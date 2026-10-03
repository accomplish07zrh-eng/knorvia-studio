// CLI session 常驻池。
//
// 这是容量与生命周期控制器，不拥有 session 内容。宿主提供当前 resident registry、同步
// 安全事实和去激活执行面；pool 只维护 idle TTL、LRU touch、operation lease 与
// deactivation gate。
// 2026-10-03: source-exposed behavior-contract implementation of leases and reclamation.
// Origin: zai-org/ZCode 872ad960de7ec172591f7e1952f7849229f94521,
// apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-resident-pool.ts.
// Existing Apache-2.0 attribution/history retained; see docs/lane-cli-20261003.md.

const DEFAULT_SESSION_RESIDENT_TARGET_COUNT = 8;
export const DEFAULT_SESSION_RESIDENT_HIGH_WATER_COUNT = 16;
const DEFAULT_SESSION_RESIDENT_IDLE_TIMEOUT_MS = 10 * 60 * 1_000;

export type SessionDeactivationReason = "high_water_lru" | "idle_timeout";

export interface SessionDeactivationDecision {
  highWaterCount: number;
  idleMs: number;
  idleTimeoutMs: number;
  reason: SessionDeactivationReason;
  residentCountBefore: number;
  targetCount: number;
}

export interface SessionResidencyFacts {
  persisted: boolean;
  hasResidencyBlockingWork: boolean;
  hasPendingInteractions: boolean;
  hasQueuedCommands: boolean;
  hasSubscribers: boolean;
  hasLegacySubscriber: boolean;
  lastActivityAt: number;
}

export interface SessionResidentPoolHost {
  listSessionIds(): string[];
  readResidencyFacts(sessionId: string): SessionResidencyFacts | null;
  /**
   * 首个同步执行片必须把 session 从 resident registry 摘除；返回 Promise 只等待
   * app.close 等异步收尾。
   */
  deactivate(sessionId: string): Promise<void>;
  onDeactivated?(sessionId: string, decision: SessionDeactivationDecision): void;
  onError?(sessionId: string, error: unknown, decision: SessionDeactivationDecision): void;
}

export interface SessionResidentPoolOptions {
  highWaterCount?: number;
  idleTimeoutMs?: number;
  now?: () => number;
  targetCount?: number;
}

interface ResidencyCandidate {
  eligibleSinceAt: number;
  lastUsedAt: number;
  sessionId: string;
}

export class SessionResidentPool {
  private readonly highWaterCount: number;
  private readonly idleTimeoutMs: number;
  private readonly now: () => number;
  private readonly targetCount: number;
  private readonly eligibleSinceAt = new Map<string, number>();
  private readonly lastTouchedAt = new Map<string, number>();
  private readonly sessionOperations = new Map<string, Set<symbol>>();
  private readonly operations = new Set<symbol>();
  private readonly inFlightDeactivations = new Map<string, Promise<void>>();
  private rebalancing = false;

  constructor(
    private readonly host: SessionResidentPoolHost,
    options: SessionResidentPoolOptions = {},
  ) {
    const targetCount = options.targetCount ?? DEFAULT_SESSION_RESIDENT_TARGET_COUNT;
    const highWaterCount = options.highWaterCount ?? DEFAULT_SESSION_RESIDENT_HIGH_WATER_COUNT;
    const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_RESIDENT_IDLE_TIMEOUT_MS;
    if (!Number.isInteger(targetCount) || targetCount < 0) {
      throw new RangeError("session resident targetCount must be a non-negative integer");
    }
    if (!Number.isInteger(highWaterCount) || highWaterCount < targetCount) {
      throw new RangeError(
        "session resident highWaterCount must be an integer greater than or equal to targetCount",
      );
    }
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 0) {
      throw new RangeError("session resident idleTimeoutMs must be a non-negative number");
    }
    this.targetCount = targetCount;
    this.highWaterCount = highWaterCount;
    this.idleTimeoutMs = idleTimeoutMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * 获取协议请求租约。全进程计数防跨 session 的 async workspace 操作与 sampler
   * 回收并发；按 session 计数表达精确所有权并参与该 session 的 eligibility。
   */
  async acquireOperation(sessionIdsInput?: string | readonly string[]): Promise<() => void> {
    const requested = typeof sessionIdsInput === "string" ? [sessionIdsInput] : sessionIdsInput;
    const sessions = new Set((requested ?? []).filter((id) => id.length > 0));
    const operation = Symbol("resident operation");
    this.operations.add(operation);
    for (const id of sessions) {
      const owners = this.sessionOperations.get(id) ?? new Set<symbol>();
      owners.add(operation);
      this.sessionOperations.set(id, owners);
    }
    let open = true;
    const release = (): void => {
      if (!open) return;
      open = false;
      for (const id of sessions) {
        this.touch(id);
        const owners = this.sessionOperations.get(id);
        owners?.delete(operation);
        if (owners?.size === 0) this.sessionOperations.delete(id);
      }
      this.operations.delete(operation);
      this.rebalance();
    };
    try {
      for (const id of sessions) {
        await this.waitForDeactivation(id);
        this.touch(id);
      }
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }

  touch(sessionId: string, usedAt = this.now()): void {
    if (!Number.isFinite(usedAt)) return;
    const previous = this.lastTouchedAt.get(sessionId);
    if (previous === undefined || usedAt > previous) {
      this.lastTouchedAt.set(sessionId, usedAt);
    }
    // idle TTL 表达“最后一次使用后的连续空闲”，协议请求重新使用 session
    // 后必须重新计时，不能沿用 touch 前已经接近到期的 eligible 窗口。
    this.eligibleSinceAt.delete(sessionId);
  }

  /** sampler 与 request-release 共用的 TTL / 高低水位收敛入口。 */
  rebalance(): void {
    if (this.operations.size !== 0 || this.rebalancing) return;
    this.rebalancing = true;
    try {
      const observedAt = this.now();
      const residents = this.host.listSessionIds();
      this.pruneMetadata(new Set(residents));
      const expired = this.readCandidates(residents, observedAt)
        .filter((candidate) => observedAt - candidate.eligibleSinceAt >= this.idleTimeoutMs)
        .sort(
          (left, right) =>
            left.eligibleSinceAt - right.eligibleSinceAt ||
            left.lastUsedAt - right.lastUsedAt ||
            left.sessionId.localeCompare(right.sessionId),
        );

      this.reclaim(expired, "idle_timeout", residents.length, observedAt);
      const remaining = this.host.listSessionIds();
      if (remaining.length <= this.highWaterCount) return;
      const oldest = this.readCandidates(remaining, observedAt).sort(
        (left, right) =>
          left.lastUsedAt - right.lastUsedAt || left.sessionId.localeCompare(right.sessionId),
      );

      this.reclaim(oldest, "high_water_lru", remaining.length, observedAt);
    } finally {
      this.rebalancing = false;
    }
  }

  waitForDeactivation(sessionId: string): Promise<void> {
    return this.inFlightDeactivations.get(sessionId) ?? Promise.resolve();
  }

  private isEligible(sessionId: string, facts: SessionResidencyFacts): boolean {
    return (
      facts.persisted &&
      !facts.hasResidencyBlockingWork &&
      !facts.hasPendingInteractions &&
      !facts.hasQueuedCommands &&
      !facts.hasSubscribers &&
      !facts.hasLegacySubscriber &&
      !this.sessionOperations.has(sessionId) &&
      !this.inFlightDeactivations.has(sessionId)
    );
  }

  private readCandidates(sessionIds: readonly string[], observedAt: number): ResidencyCandidate[] {
    const candidates: ResidencyCandidate[] = [];
    for (const sessionId of sessionIds) {
      const facts = this.readEligibleFacts(sessionId);
      if (!facts) continue;
      const eligibleSinceAt = this.eligibleSinceAt.get(sessionId) ?? observedAt;
      this.eligibleSinceAt.set(sessionId, eligibleSinceAt);
      candidates.push({
        eligibleSinceAt,
        lastUsedAt: Math.max(
          facts.lastActivityAt,
          this.lastTouchedAt.get(sessionId) ?? Number.NEGATIVE_INFINITY,
        ),
        sessionId,
      });
    }
    return candidates;
  }

  private readEligibleFacts(sessionId: string): SessionResidencyFacts | null {
    const facts = this.host.readResidencyFacts(sessionId);
    if (facts && this.isEligible(sessionId, facts)) return facts;
    this.eligibleSinceAt.delete(sessionId);
    return null;
  }

  private reclaim(
    candidates: readonly ResidencyCandidate[],
    reason: SessionDeactivationReason,
    residentCount: number,
    observedAt: number,
  ): void {
    for (const { sessionId } of candidates) {
      if (this.operations.size !== 0) return;
      if (reason === "high_water_lru" && residentCount <= this.targetCount) return;
      // 候选不是回收权限：TTL/LRU 在同一 admission 路径重读安全事实和当前 idle 窗口。
      if (!this.readEligibleFacts(sessionId)) continue;
      const since = this.eligibleSinceAt.get(sessionId);
      if (
        reason === "idle_timeout" &&
        (since === undefined || observedAt - since < this.idleTimeoutMs)
      ) {
        continue;
      }
      const decision = this.createDecision(
        reason,
        residentCount,
        observedAt - (since ?? observedAt),
      );
      if (this.executeDeactivation(sessionId, decision)) residentCount -= 1;
    }
  }

  private createDecision(
    reason: SessionDeactivationReason,
    residentCountBefore: number,
    idleMs: number,
  ): SessionDeactivationDecision {
    return {
      highWaterCount: this.highWaterCount,
      idleMs: Math.max(0, idleMs),
      idleTimeoutMs: this.idleTimeoutMs,
      reason,
      residentCountBefore,
      targetCount: this.targetCount,
    };
  }

  private executeDeactivation(sessionId: string, decision: SessionDeactivationDecision): boolean {
    let pending: Promise<void>;
    try {
      pending = this.host.deactivate(sessionId);
    } catch (error) {
      this.host.onError?.(sessionId, error, decision);
      return false;
    }

    // 宿主同步摘除在先；gate 覆盖异步 close、成功/失败通知与 finally 清理。
    const finish = async (): Promise<void> => {
      try {
        await pending;
        await this.host.onDeactivated?.(sessionId, decision);
      } catch (error) {
        await this.host.onError?.(sessionId, error, decision);
      } finally {
        if (this.inFlightDeactivations.get(sessionId) === tracked) {
          this.inFlightDeactivations.delete(sessionId);
        }
      }
    };
    const tracked = finish();
    this.inFlightDeactivations.set(sessionId, tracked);
    this.eligibleSinceAt.delete(sessionId);
    this.lastTouchedAt.delete(sessionId);
    return true;
  }

  private pruneMetadata(residentIds: ReadonlySet<string>): void {
    for (const sessionId of this.lastTouchedAt.keys()) {
      if (
        !residentIds.has(sessionId) &&
        !this.inFlightDeactivations.has(sessionId) &&
        !this.sessionOperations.has(sessionId)
      ) {
        this.lastTouchedAt.delete(sessionId);
      }
    }
    for (const sessionId of this.eligibleSinceAt.keys()) {
      if (!residentIds.has(sessionId) && !this.inFlightDeactivations.has(sessionId)) {
        this.eligibleSinceAt.delete(sessionId);
      }
    }
  }
}
