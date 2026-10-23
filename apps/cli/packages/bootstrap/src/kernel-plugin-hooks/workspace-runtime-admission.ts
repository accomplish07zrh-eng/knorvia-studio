// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 运行时准入（B14 的 8 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B14。
//
// 职责：决定「此刻这次 dispatch 允不允许执行」——
// 它是「信任求值（B12）」的运行时门面，多了「激活状态 / 失效 / bootstrap 失败」等运行时维度。
//
// ⚠️ B14.3 有 **9 条判定顺序**（第一条命中即用），与 B12 同类：
// 顺序错会让「本该拒绝的」被放行 —— 这是安全判定。
import type {
  WorkspaceHookAdmissionClass,
  WorkspaceHookTrustState,
} from "./workspace-trust-evaluation.js";

/** 一条已评估的条目（B14 内部使用）。 */
export interface EvaluatedItem {
  readonly reviewItemId: string;
  readonly hookDeclarationDigest: string;
  readonly configuredEnabled: boolean;
  readonly admissionClass: WorkspaceHookAdmissionClass;
  readonly trustState: WorkspaceHookTrustState;
  readonly effectiveRunnable: boolean;
  readonly reasonCode?: string;
}

/** 快照索引（B14.1）：reviewItemId → digest。 */
export interface AdmissionSnapshot {
  readonly workspaceIdentity: string;
  readonly bundleDigest: string;
  readonly items: readonly EvaluatedItem[];
}

/** dispatch 请求（B14.3）。 */
export interface DispatchRequest {
  readonly bundleDigest?: string;
  readonly hookDeclarationDigest: string;
  readonly reviewItemId: string;
  /** 客户端持有的安全版本 counter（B14.3 第 6 条用）。 */
  readonly securityCounter?: number;
}

/** dispatch 判定结果（B14.3）。 */
export interface DispatchDecision {
  readonly allowed: boolean;
  readonly reasonCode?: string;
  /** 声明被禁用时要求跳过生命周期回调（B14.3 第 9 条）。 */
  readonly skipLifecycle?: boolean;
}

/** admission state 回调载荷（B14.7）。 */
export interface AdmissionState {
  readonly pendingCount: number;
  readonly bundleDigest: string;
  readonly workspaceIdentity?: string;
}

/** telemetry 上报接口（B14.8 去重键：event:reasonCode:bundleDigest:declarationDigest:source）。 */
export interface AdmissionTelemetry {
  report(event: string, reasonCode: string, key: string): void;
}

/** 各个 reasonCode 常量。 */
const REASON = {
  snapshotMismatch: "workspace_hooks_snapshot_mismatch",
  pendingTrust: "workspace_hooks_pending_trust",
  featureDisabled: "workspace_hooks_feature_disabled",
  storeCorrupt: "workspace_hooks_trust_store_corrupt",
  blockedUntrusted: "workspace_hooks_blocked_untrusted",
} as const;

/**
 * 运行时准入控制器（B14）。
 *
 * 状态所有者是实例 —— 与 B10/B11/B13 一致。
 */
export class WorkspaceHookRuntimeAdmission {
  #snapshot: AdmissionSnapshot | undefined;
  /** reviewItemId → digest 的索引（B14.1）。 */
  #index = new Map<string, string>();
  #enabled = true;
  #activated = false;
  #bootstrapFailed = false;
  /** 失效原因（B14.5）：一旦设置，所有 dispatch 都按它拒绝。 */
  #invalidatedReason: string | undefined;
  /** 已评估的条目（按 reviewItemId 索引）。 */
  #evaluated = new Map<string, EvaluatedItem>();
  /** 当前评估对应的安全版本 counter（B14.3 第 6 条）。 */
  #evaluatedCounter: number | undefined;
  /** telemetry 去重集合（B14.8）。 */
  readonly #reported = new Set<string>();
  #stateListener: ((state: AdmissionState) => void) | undefined;
  readonly #telemetry: AdmissionTelemetry | undefined;
  /** 重新评估的注入点（由组合根提供；B14.3 第 6 条需要它）。 */
  readonly #reevaluate: ((snapshot: AdmissionSnapshot) => readonly EvaluatedItem[]) | undefined;
  /** 当前安全版本 counter 的读取点（由组合根从 B11 协调者注入）。 */
  readonly #readSecurityCounter: (() => number) | undefined;

  constructor(
    options: {
      readonly snapshot?: AdmissionSnapshot;
      readonly enabled?: boolean;
      readonly telemetry?: AdmissionTelemetry;
      readonly reevaluate?: (snapshot: AdmissionSnapshot) => readonly EvaluatedItem[];
      /** 读取当前安全版本 counter（B14.3 规则 6 用）；省略时不检测 revision 过期。 */
      readonly readSecurityCounter?: () => number;
      readonly onState?: (state: AdmissionState) => void;
    } = {},
  ) {
    this.#enabled = options.enabled ?? true;
    this.#telemetry = options.telemetry;
    this.#reevaluate = options.reevaluate;
    this.#readSecurityCounter = options.readSecurityCounter;
    this.#stateListener = options.onState;
    if (options.snapshot !== undefined) this.#applySnapshot(options.snapshot);
  }

  /**
   * 激活（B14.2）。
   *
   * 首次 activate 会「等待 ready」—— 本实现在构造时已接收 snapshot，
   * 所以「等待」表现为「若 snapshot 未就绪则记录 bootstrapFailed」。
   */
  activate(source: string, signal?: AbortSignal): void {
    // signal 已 abort → 立即抛错（B14.2）。
    if (signal?.aborted === true) {
      throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
    }

    if (!this.#enabled) {
      // enabled === false：仅一次 telemetry，回调一次 admission state（pendingCount 0）。
      //
      // ⚠️ **仍要标记 activated** —— 否则 B14.3 的规则 3（未 activate → pending_trust）
      // 会先命中，导致返回 pending_trust 而不是 feature_disabled。
      // 而合同要求规则 4（enabled === false → feature_disabled）生效。
      this.#activated = true;
      this.#reportOnce("workspace_hook.feature_disabled", REASON.featureDisabled, source);
      this.#emitState({ pendingCount: 0, bundleDigest: this.#snapshot?.bundleDigest ?? "" });
      return;
    }

    this.#activated = true;
    // 刷新评估（评估抛错 → bootstrapFailed，fail-closed）。
    try {
      this.#reevaluateNow();
    } catch {
      this.#bootstrapFailed = true;
    }
    this.#emitState(this.#currentState());
  }

  /**
   * 判定一次 dispatch 是否允许（B14.3 的 9 条顺序）。
   *
   * ⚠️ **顺序不能调换** —— 每一条都是「前一条不成立时才看」。
   */
  evaluateDispatch(request: DispatchRequest, source = "unknown"): DispatchDecision {
    const snapshot = this.#snapshot;

    // 1. 快照不匹配（提供了 bundleDigest 且不等；或 reviewItemId 的 digest 与索引不一致）
    if (snapshot !== undefined) {
      if (request.bundleDigest !== undefined && request.bundleDigest !== snapshot.bundleDigest) {
        this.#reportOnce("workspace_hook.snapshot_mismatch", REASON.snapshotMismatch, source);
        return { allowed: false, reasonCode: REASON.snapshotMismatch };
      }
      const indexedDigest = this.#index.get(request.reviewItemId);
      if (indexedDigest !== undefined && indexedDigest !== request.hookDeclarationDigest) {
        this.#reportOnce("workspace_hook.snapshot_mismatch", REASON.snapshotMismatch, source);
        return { allowed: false, reasonCode: REASON.snapshotMismatch };
      }
    }

    // 2. 已 invalidate → 拒绝该 reasonCode。
    if (this.#invalidatedReason !== undefined) {
      return { allowed: false, reasonCode: this.#invalidatedReason };
    }

    // 3. 未 activate → pending_trust。
    if (!this.#activated) {
      return { allowed: false, reasonCode: REASON.pendingTrust };
    }

    // 4. enabled === false → feature_disabled。
    if (!this.#enabled) {
      return { allowed: false, reasonCode: REASON.featureDisabled };
    }

    // 5. bootstrapFailed → trust_store_corrupt。
    if (this.#bootstrapFailed) {
      this.#reportOnce("workspace_hook.trust_store_corrupt", REASON.storeCorrupt, source);
      return { allowed: false, reasonCode: REASON.storeCorrupt };
    }

    // 6. 校验 revision 不一致 → 重新评估并**重发** admission state（pendingCount 0 也要发）。
    //
    // ⚠️ 比较的是「**客户端持有的 counter**」与「**当前 counter**」——
    //    而不是与「上次评估时的 counter」比。
    //    因为客户端可能拿着很旧的 counter（比上次评估还旧），
    //    那种情况同样需要重评估并重发。
    const currentCounter = this.#currentSecurityCounter;
    if (
      request.securityCounter !== undefined &&
      currentCounter !== undefined &&
      request.securityCounter !== currentCounter
    ) {
      try {
        this.#reevaluateNow();
      } catch {
        this.#bootstrapFailed = true;
      }
      // 重发 state（即使 pendingCount 为 0，B14.3 第 6 条明确要求）。
      this.#emitState(this.#currentState());
    }

    // 7. 找不到 item 或 digest 不一致 → snapshot_mismatch。
    const item = this.#evaluated.get(request.reviewItemId);
    if (item === undefined || item.hookDeclarationDigest !== request.hookDeclarationDigest) {
      return { allowed: false, reasonCode: REASON.snapshotMismatch };
    }

    // 8. effectiveRunnable → allowed。
    if (item.effectiveRunnable) return { allowed: true };

    // 9. 否则拒绝（reasonCode = item.reasonCode ?? blocked_untrusted）。
    const reasonCode = item.reasonCode ?? REASON.blockedUntrusted;
    if (item.trustState === "blocked_policy") {
      this.#reportOnce("workspace_hook.policy_blocked", reasonCode, source);
    }
    return {
      allowed: false,
      reasonCode,
      ...(item.configuredEnabled ? {} : { skipLifecycle: true }),
    };
  }

  /**
   * 替换快照（B14.4）。
   *
   * `workspaceIdentity` 不同 → **抛错且状态不变**（跨 workspace 替换是编程错误）。
   */
  replaceSnapshot(snapshot: AdmissionSnapshot): void {
    if (
      this.#snapshot !== undefined &&
      snapshot.workspaceIdentity !== this.#snapshot.workspaceIdentity
    ) {
      throw new Error(
        `Cannot replace snapshot across workspaces: ${this.#snapshot.workspaceIdentity} → ${snapshot.workspaceIdentity}`,
      );
    }
    this.#applySnapshot(snapshot);
    // 已 activate 时立即重评估并回调（B14.4）。
    if (this.#activated) {
      try {
        this.#reevaluateNow();
      } catch {
        this.#bootstrapFailed = true;
      }
      this.#emitState(this.#currentState());
    }
  }

  /** 失效（B14.5）：记录原因并清空评估；之后 dispatch 一律按该原因拒绝。 */
  invalidate(reasonCode: string): void {
    this.#invalidatedReason = reasonCode;
    this.#evaluated.clear();
    this.#evaluatedCounter = undefined;
  }

  /** 取当前快照引用（B14.6）。 */
  getCurrentSnapshot(): AdmissionSnapshot | undefined {
    return this.#snapshot;
  }

  /** 注册 admission state 回调（B14.7）。 */
  onState(listener: (state: AdmissionState) => void): void {
    this.#stateListener = listener;
  }

  /** 应用快照并重建索引（B14.1 / B14.4）。 */
  #applySnapshot(snapshot: AdmissionSnapshot): void {
    this.#snapshot = snapshot;
    this.#index = new Map(
      snapshot.items.map((item) => [item.reviewItemId, item.hookDeclarationDigest]),
    );
    this.#evaluated.clear();
    this.#evaluatedCounter = undefined;
    this.#invalidatedReason = undefined;
  }

  /** 执行一次评估（用注入的 reevaluate 或直接用快照的 items）。 */
  #reevaluateNow(): void {
    const snapshot = this.#snapshot;
    if (snapshot === undefined) return;

    const items = this.#reevaluate === undefined ? snapshot.items : this.#reevaluate(snapshot);
    this.#evaluated = new Map(items.map((item) => [item.reviewItemId, item]));
    // ⚠️ 记录「这次评估对应的安全版本」—— B14.3 规则 6 用它判断 revision 是否过期。
    //    若不记录，`#evaluatedCounter` 永远是 undefined → 规则 6 永不触发。
    this.#evaluatedCounter = this.#readSecurityCounter?.();
  }

  /** 当前安全版本（B14.3 规则 6）；未注入时返回 undefined。 */
  get #currentSecurityCounter(): number | undefined {
    return this.#readSecurityCounter?.();
  }

  /** 当前 admission state（B14.7）：pendingCount = configuredEnabled && pending_trust 的条数。 */
  #currentState(): AdmissionState {
    const snapshot = this.#snapshot;
    if (snapshot === undefined) return { pendingCount: 0, bundleDigest: "" };

    const pendingCount = [...this.#evaluated.values()].filter(
      (item) =>
        item.configuredEnabled &&
        item.admissionClass === "blocked" &&
        item.trustState === "pending_trust",
    ).length;

    return {
      pendingCount,
      bundleDigest: snapshot.bundleDigest,
      workspaceIdentity: snapshot.workspaceIdentity,
    };
  }

  /** 发出 state（B14.7）。 */
  #emitState(state: AdmissionState): void {
    this.#stateListener?.(state);
  }

  /**
   * telemetry 去重上报（B14.8）。
   *
   * 去重键 = `event:reasonCode:bundleDigest:declarationDigest:source` ——
   * 同一键只发一次，避免「每次 dispatch 都上报」把日志刷爆。
   */
  #reportOnce(event: string, reasonCode: string, source: string): void {
    if (this.#telemetry === undefined) return;
    const key = `${event}:${reasonCode}:${this.#snapshot?.bundleDigest ?? ""}:${source}`;
    if (this.#reported.has(key)) return;
    this.#reported.add(key);
    this.#telemetry.report(event, reasonCode, key);
  }
}
