// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 审核流程注册表（B13 的 10 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B13。
//
// 职责：管理「等待用户审批」的流程 —— 一个流程是一个 pending 状态 + 一个 Promise。
// 用户决定后 resolve，超时后自动结算，被新请求取代后 reject。
//
// ⚠️ 最关键的正确性要求（B13.8）：**每个 Promise 最终都必须 settle**。
// 悬挂的 Promise 会让调用方永远等待 —— 所以：
//   · `open` 必须注册超时计时器
//   · `supersede` 必须结算旧流程
//   · `resolve` / `fail` / `closeWithoutDecision` 必须结算
//   · 而「结算幂等」保证不会二次 settle

/** 流程状态（B13.2 / B13.3）。 */
export type ReviewFlowState = "pending" | "resolved" | "superseded" | "cancelled" | "timed_out";

/** 结算结果（B13.2 的形状）。 */
export interface ReviewFlowOutcome {
  readonly action: "no_change" | "accept" | "reject";
  readonly reviewItemIds: readonly string[];
  readonly reasonCode?: string;
}

/** 打开流程的请求（B13.1）。 */
export interface ReviewFlowRequest {
  readonly sessionId: string;
  readonly reviewFlowId: string;
  readonly generation: number;
  readonly interactionId: string;
  readonly bundleDigest: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly remoteSessionId?: string;
  readonly workspaceIdentity?: string;
  readonly reviewItemIds: readonly string[];
  readonly deadlineAt?: number;
}

/** 用户决定（B13.4）。 */
export interface ReviewFlowDecision {
  readonly action: "accept" | "reject" | "no_change";
  readonly reviewItemIds?: readonly string[];
}

/** 校验结果（B13.4）。 */
export type ReviewFlowValidation =
  | { readonly accepted: true; readonly reviewItemIds: readonly string[] }
  | { readonly accepted: false; readonly reasonCode: string };

/** 公开的 flow 视图（B13.9 / B13.10）。 */
export interface ReviewFlow {
  readonly request: ReviewFlowRequest;
  readonly result: Promise<ReviewFlowOutcome>;
  /**
   * 状态视图。
   *
   * ⚠️ 每次读取都返回**新对象**（B13.10）—— 这样调用方无法通过修改它篡改内部状态，
   * 而它反映的始终是**当前**状态（不是创建时的快照）。
   */
  readonly state: {
    readonly state: ReviewFlowState;
    readonly supersededByInteractionId?: string;
  };
}

/** 内部流程记录（含结算控制）。 */
interface InternalFlow {
  readonly request: ReviewFlowRequest;
  readonly result: Promise<ReviewFlowOutcome>;
  readonly resolve: (outcome: ReviewFlowOutcome) => void;
  readonly reject: (error: Error) => void;
  /**
   * 超时计时器。
   *
   * ⚠️ 不能是 `readonly` —— 结算时要清掉引用（`clearTimeout` + 置 `undefined`），
   * 否则已结算的流程会留下悬空计时器。
   */
  timer: ReturnType<typeof setTimeout> | undefined;
  state: ReviewFlowState;
  supersededByInteractionId: string | undefined;
  settled: boolean;
}

/** 超时的 reasonCode（B13.2）。 */
const TIMEOUT_REASON_CODE = "workspace_hooks_interaction_timeout";
/** 被取代的 reasonCode（B13.3）。 */
const SUPERSEDED_REASON_CODE = "workspace_hooks_review_superseded";
/** 快照不匹配的 reasonCode（B13.4）。 */
const SNAPSHOT_MISMATCH_REASON_CODE = "workspace_hooks_snapshot_mismatch";

/** 无变化的结算（B13.2 / B13.3 / B13.6）。 */
function noChangeOutcome(reasonCode?: string): ReviewFlowOutcome {
  return {
    action: "no_change",
    reviewItemIds: [],
    ...(reasonCode === undefined ? {} : { reasonCode }),
  };
}

/**
 * 审核流程注册表。
 *
 * 状态所有者是实例（无全局单例）—— 与 B10/B11 一致。
 */
export class WorkspaceHookReviewFlowRegistry {
  /** sessionId → 当前流程（只保留一个；新的取代旧的）。 */
  readonly #bySession = new Map<string, InternalFlow>();

  /**
   * 打开一个待审批流程（B13.1）。
   *
   * 同 session 已有 pending 流程时：
   *   · 同一代 → 返回**同一个** flow 对象（引用相等）
   *   · 不同代 → 抛错（必须显式 supersede）
   */
  open(request: ReviewFlowRequest): ReviewFlow {
    validateRequest(request);

    const existing = this.#bySession.get(request.sessionId);
    if (existing !== undefined && existing.state === "pending") {
      if (isSameGeneration(existing.request, request)) {
        // 同一代 → 返回同一个对象（引用相等，B13.1）。
        return this.#publicView(existing);
      }
      throw new Error(
        `A pending review flow already exists for session ${request.sessionId}; supersede it explicitly`,
      );
    }

    const flow = this.#createFlow(request);
    this.#bySession.set(request.sessionId, flow);
    return this.#publicView(flow);
  }

  /**
   * 用新流程取代旧流程（B13.3）。
   *
   * 旧流程**立即结算**为 `superseded`，而不是悬挂 ——
   * 这是 B13.8「每个 Promise 都 settle」的关键路径。
   */
  supersede(target: ReviewFlow, replacement: ReviewFlowRequest): ReviewFlow {
    const current = this.#bySession.get(target.request.sessionId);
    if (current === undefined) {
      throw new Error("No current review flow to supersede");
    }
    if (
      current.request.reviewFlowId !== target.request.reviewFlowId ||
      current.request.generation !== target.request.generation ||
      current.request.interactionId !== target.request.interactionId
    ) {
      throw new Error("Supersede target does not match the current flow");
    }
    // 替换必须同 session、同 reviewFlowId、generation **严格递增**。
    if (
      replacement.sessionId !== current.request.sessionId ||
      replacement.reviewFlowId !== current.request.reviewFlowId ||
      replacement.generation <= current.request.generation
    ) {
      throw new Error(
        "Replacement must share session and reviewFlowId with a strictly greater generation",
      );
    }

    // 旧流程立即结算（不悬挂）。
    current.supersededByInteractionId = replacement.interactionId;
    this.#settle(current, "superseded", noChangeOutcome(SUPERSEDED_REASON_CODE));

    const flow = this.#createFlow(replacement);
    this.#bySession.set(replacement.sessionId, flow);
    return this.#publicView(flow);
  }

  /**
   * 校验用户决定是否可接受（B13.4）。
   *
   * 六种拒绝原因：
   *   · 无流程 / 代不匹配 / 状态非 pending → superseded
   *   · 六个快照字段任一不一致 → snapshot_mismatch
   *   · decision 含请求之外的 reviewItemId → snapshot_mismatch
   *   · decision 非法 → **抛错**（不是返回负结果）
   */
  validate(target: ReviewFlow, decision: ReviewFlowDecision): ReviewFlowValidation {
    const current = this.#bySession.get(target.request.sessionId);
    if (
      current === undefined ||
      current.state !== "pending" ||
      !isSameGeneration(current.request, target.request)
    ) {
      return { accepted: false, reasonCode: SUPERSEDED_REASON_CODE };
    }

    // 六个快照字段都要一致（B13.4 逐字列举）。
    for (const key of [
      "sessionId",
      "taskId",
      "runId",
      "remoteSessionId",
      "workspaceIdentity",
      "bundleDigest",
    ] as const) {
      if (current.request[key] !== target.request[key]) {
        return { accepted: false, reasonCode: SNAPSHOT_MISMATCH_REASON_CODE };
      }
    }

    // decision 含请求之外的 reviewItemId → snapshot_mismatch。
    const allowed = new Set(current.request.reviewItemIds);
    const decided = decision.reviewItemIds ?? [];
    if (decided.some((id) => !allowed.has(id))) {
      return { accepted: false, reasonCode: SNAPSHOT_MISMATCH_REASON_CODE };
    }

    // decision 非法 → 抛错（B13.4 末句：「非法抛错」）。
    if (
      decision.action !== "accept" &&
      decision.action !== "reject" &&
      decision.action !== "no_change"
    ) {
      throw new Error(`Invalid review decision action: ${String(decision.action)}`);
    }

    // 去重并保持首次出现顺序（B13.4）。
    return { accepted: true, reviewItemIds: [...new Set(decided)] };
  }

  /**
   * 结算流程（B13.5）。
   *
   * 校验通过 → 结算 `resolved`；不通过 → **不改状态**并返回负结果。
   */
  resolve(target: ReviewFlow, decision: ReviewFlowDecision): ReviewFlowValidation {
    const validation = this.validate(target, decision);
    if (!validation.accepted) return validation;

    const current = this.#bySession.get(target.request.sessionId);
    if (current !== undefined) {
      this.#settle(current, "resolved", {
        action: decision.action,
        reviewItemIds: validation.reviewItemIds,
      });
    }
    return validation;
  }

  /** 以失败原因结算为 cancelled（B13.6）。 */
  fail(target: ReviewFlow, reasonCode: string): boolean {
    const current = this.#bySession.get(target.request.sessionId);
    if (!this.#canSettle(current, target)) return false;

    this.#settle(current as InternalFlow, "cancelled", noChangeOutcome(reasonCode));
    return true;
  }

  /** 无决定地关闭（B13.7）：结算为 resolved，无 reasonCode。 */
  closeWithoutDecision(target: ReviewFlow): boolean {
    const current = this.#bySession.get(target.request.sessionId);
    if (!this.#canSettle(current, target)) return false;

    this.#settle(current as InternalFlow, "resolved", noChangeOutcome());
    return true;
  }

  /** 取当前公开 flow（B13.9）。 */
  getCurrentFlow(sessionId: string): ReviewFlow | undefined {
    const current = this.#bySession.get(sessionId);
    return current === undefined ? undefined : this.#publicView(current);
  }

  /** 取当前状态副本（B13.9）：修改返回值不影响内部状态。 */
  getCurrent(sessionId: string): { readonly state: ReviewFlowState } | undefined {
    const current = this.#bySession.get(sessionId);
    return current === undefined ? undefined : { state: current.state };
  }

  /** 创建流程并注册超时（B13.2）。 */
  #createFlow(request: ReviewFlowRequest): InternalFlow {
    let resolveFn!: (outcome: ReviewFlowOutcome) => void;
    let rejectFn!: (error: Error) => void;
    const result = new Promise<ReviewFlowOutcome>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const flow: InternalFlow = {
      request,
      result,
      resolve: resolveFn,
      reject: rejectFn,
      timer: undefined,
      state: "pending",
      supersededByInteractionId: undefined,
      settled: false,
    };

    if (request.deadlineAt !== undefined) {
      const remaining = request.deadlineAt - Date.now();
      if (remaining <= 0) {
        // deadlineAt 已过 → 立即结算（B13.2）。
        this.#settle(flow, "timed_out", noChangeOutcome(TIMEOUT_REASON_CODE));
      } else {
        const timer = setTimeout(() => {
          this.#settle(flow, "timed_out", noChangeOutcome(TIMEOUT_REASON_CODE));
        }, remaining);
        // 计时器不阻止进程退出（B13.2）。
        timer.unref?.();
        flow.timer = timer;
      }
    }
    return flow;
  }

  /** 判断是否可结算：状态 pending 且代匹配（B13.6 / B13.7 的「条件同 6」）。 */
  #canSettle(current: InternalFlow | undefined, target: ReviewFlow): boolean {
    return (
      current !== undefined &&
      current.state === "pending" &&
      isSameGeneration(current.request, target.request)
    );
  }

  /**
   * 结算（幂等，B13.8）。
   *
   * 只有 pending 且未结算过才生效 —— 防止「超时与 resolve 竞态」二次 settle。
   */
  #settle(flow: InternalFlow, state: ReviewFlowState, outcome: ReviewFlowOutcome): void {
    if (flow.settled) return;
    flow.settled = true;
    flow.state = state;
    if (flow.timer !== undefined) {
      clearTimeout(flow.timer);
      flow.timer = undefined;
    }
    flow.resolve(outcome);
  }

  /** 公开视图：`state` 用 getter，每次读取都产生新对象（B13.10）。 */
  #publicView(flow: InternalFlow): ReviewFlow {
    return {
      // request 与 result 保持同一引用（B13.10）。
      request: flow.request,
      result: flow.result,
      // getter 而不是固定值：这样「结算后读 state」能看到最新状态，
      // 而「每次读到新对象」防止调用方篡改内部状态。
      get state(): { state: ReviewFlowState; supersededByInteractionId?: string } {
        return {
          state: flow.state,
          ...(flow.supersededByInteractionId === undefined
            ? {}
            : { supersededByInteractionId: flow.supersededByInteractionId }),
        };
      },
    };
  }
}

/**
 * 同一代判定（B13.1）：三个字段全等。
 *
 * ⚠️ **不含 `bundleDigest`** —— 因为 B13.4 把 `bundleDigest` 列为**快照字段**：
 * 若这里也检查它，「bundleDigest 不一致」会被误报为 `superseded`，
 * 而正确原因是 `snapshot_mismatch`。两者的区别是：
 *   · `superseded` = 流程已被新代取代（代不匹配）
 *   · `snapshot_mismatch` = 同一代但快照内容变了
 * → **B13.1 的「同一代」只要求代标识（flowId/generation/interactionId）相同**，
 *   而 `bundleDigest` 属于「这一代的快照内容」，由 B13.4 校验。
 */
function isSameGeneration(left: ReviewFlowRequest, right: ReviewFlowRequest): boolean {
  return (
    left.reviewFlowId === right.reviewFlowId &&
    left.generation === right.generation &&
    left.interactionId === right.interactionId
  );
}

/** 请求校验（B13.1 的「按 schema 校验」）。 */
function validateRequest(request: ReviewFlowRequest): void {
  for (const key of ["sessionId", "reviewFlowId", "interactionId", "bundleDigest"] as const) {
    if (typeof request[key] !== "string" || request[key].trim().length === 0) {
      throw new Error(`Review flow request requires a non-empty ${key}`);
    }
  }
  if (!Number.isInteger(request.generation) || request.generation < 0) {
    throw new Error("Review flow request requires a non-negative integer generation");
  }
  if (!Array.isArray(request.reviewItemIds)) {
    throw new Error("Review flow request requires reviewItemIds array");
  }
}
