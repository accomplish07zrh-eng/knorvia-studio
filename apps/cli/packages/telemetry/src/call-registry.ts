// SPDX-License-Identifier: Apache-2.0
// 模型调用登记表：在册调用的生命周期与容量治理。
//
// 表里每一条是「一次逻辑调用」：它自己知道怎么开尝试、怎么结算、怎么被放弃。
// 容量、过期与逐出由表负责，因为那三件事只看「有多少条、各自多久没动」，
// 不需要知道 Span 长什么样。
import type { ModelAttemptSpanWriter, ModelCallSpanWriter } from "@knorvia/contracts/telemetry";

/** 一次逻辑调用在册期间的可变状态。 */
export class CallRecord {
  readonly logicalCallId: string;
  readonly writer: ModelCallSpanWriter;
  readonly sessionId: string | undefined;
  /** 在册尝试：requestId → writer。 */
  readonly attempts = new Map<string, ModelAttemptSpanWriter>();
  lastRequestId: string | undefined;
  lastSeenAtMs: number;
  retryDelayMs: number | undefined;

  constructor(
    input: {
      logicalCallId: string;
      sessionId?: string;
      writer: ModelCallSpanWriter;
    },
    now: number,
  ) {
    this.logicalCallId = input.logicalCallId;
    this.sessionId = input.sessionId;
    this.writer = input.writer;
    this.lastSeenAtMs = now;
  }

  touch(now: number): void {
    this.lastSeenAtMs = now;
  }

  /** 记下一个新尝试；`initial` 与 `retry` 的分支由调用方决定。 */
  rememberAttempt(requestId: string, writer: ModelAttemptSpanWriter): void {
    this.attempts.set(requestId, writer);
    this.lastRequestId = requestId;
    this.retryDelayMs = undefined;
  }

  forgetAttempt(requestId: string): void {
    this.attempts.delete(requestId);
  }

  /** 放弃：尝试先结算，随后调用本身。不会重复删除表里的条目。 */
  abandon(reason: "missing_terminal" | "process_shutdown" | "session_shutdown"): void {
    for (const writer of this.attempts.values()) writer.finishAbandoned(reason);
    this.attempts.clear();
    this.writer.finishAbandoned(reason);
  }
}

/** 容量与过期的治理参数。 */
export interface RegistryLimits {
  /** 调用多久没动就算过期。 */
  maxAgeMs: number;
  /** 在册调用上限。 */
  maxActive: number;
  now(): number;
  onWarning(message: string, context: Record<string, unknown>): void;
}

/** 过期扫描与容量告警各自的节流上限。 */
const SWEEP_CAP_MS = 60_000;
const WARNING_INTERVAL_MS = 60_000;

/**
 * 在册调用表。
 * 状态所有者就是它自己：`active` 是唯一事实来源，逐出与放弃都只经 `#evict`。
 */
export class CallRegistry {
  readonly #records = new Map<string, CallRecord>();
  readonly #limits: RegistryLimits;
  #nextCapacityWarningAtMs = 0;
  #nextSweepAtMs = 0;

  constructor(limits: RegistryLimits) {
    this.#limits = limits;
  }

  get size(): number {
    return this.#records.size;
  }

  get(logicalCallId: string): CallRecord | undefined {
    return this.#records.get(logicalCallId);
  }

  add(record: CallRecord): void {
    this.#records.set(record.logicalCallId, record);
  }

  drop(logicalCallId: string): void {
    this.#records.delete(logicalCallId);
  }

  /** 放弃并移除：先从表里删，再结算，避免结算过程中被再次取到。 */
  evict(
    record: CallRecord,
    reason: "missing_terminal" | "process_shutdown" | "session_shutdown",
  ): void {
    this.#records.delete(record.logicalCallId);
    record.abandon(reason);
  }

  /** 会话关闭：只清理这个会话名下的调用。 */
  evictSession(sessionId: string): void {
    for (const record of [...this.#records.values()]) {
      if (record.sessionId === sessionId) this.evict(record, "session_shutdown");
    }
  }

  /** 进程关闭：全部放弃。 */
  evictAll(): void {
    for (const record of [...this.#records.values()]) this.evict(record, "process_shutdown");
  }

  /** 过期清理：扫描本身有节流，过期判定只看「多久没动」。 */
  sweepExpired(): void {
    const now = this.#limits.now();
    if (now < this.#nextSweepAtMs) return;
    this.#nextSweepAtMs = now + Math.min(this.#limits.maxAgeMs, SWEEP_CAP_MS);
    const expired = [...this.#records.values()].filter(
      (record) => now - record.lastSeenAtMs >= this.#limits.maxAgeMs,
    );
    for (const record of expired) this.evict(record, "missing_terminal");
    if (expired.length === 0) return;
    this.#limits.onWarning("Expired model telemetry calls were abandoned", {
      abandonedCount: expired.length,
      maxActiveCallAgeMs: this.#limits.maxAgeMs,
    });
  }

  /** 容量治理：满了就按「最久没动」逐出，直到腾出位置；告警有节流。 */
  makeRoom(): void {
    if (this.#records.size < this.#limits.maxActive) return;
    const removed: CallRecord[] = [];
    while (this.#records.size >= this.#limits.maxActive) {
      const oldest = this.#leastRecentlySeen();
      if (oldest === undefined) break;
      this.evict(oldest, "missing_terminal");
      removed.push(oldest);
    }
    if (removed.length === 0) return;
    const now = this.#limits.now();
    if (now < this.#nextCapacityWarningAtMs) return;
    this.#nextCapacityWarningAtMs = now + WARNING_INTERVAL_MS;
    this.#limits.onWarning("Model telemetry active call capacity was reached", {
      abandonedCount: removed.length,
      maxActiveCalls: this.#limits.maxActive,
    });
  }

  /** 最久未活动的调用；同刻并列时取先入表的那条。 */
  #leastRecentlySeen(): CallRecord | undefined {
    let candidate: CallRecord | undefined;
    for (const record of this.#records.values()) {
      if (candidate === undefined || record.lastSeenAtMs < candidate.lastSeenAtMs)
        candidate = record;
    }
    return candidate;
  }
}
