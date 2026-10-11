// SPDX-License-Identifier: Apache-2.0
// 审核代注册表。每个会话最多有一"代"在等用户决定；代只会向四个终态迁移一次。
// 结构上刻意不按方法铺开：受理、匹配、迁移、结算各自是一个小函数，由状态表驱动。
import {
  workspaceHookReviewFlowStateSchema,
  type WorkspaceHookReasonCode,
  type WorkspaceHookReviewFlowState,
} from "@knorvia/contracts";
import {
  workspaceHookReviewDecisionSchema,
  workspaceHookReviewRequestPayloadSchema,
  type WorkspaceHookReviewDecision,
  type WorkspaceHookReviewRequestPayload,
} from "@knorvia/shared/protocol-v4";

export interface WorkspaceHookReviewTarget {
  sessionId: string;
  taskId: string;
  runId: string;
  remoteSessionId?: string;
  workspaceIdentity: string;
  bundleDigest: string;
  reviewFlowId: string;
  generation: number;
  interactionId: string;
}

export interface WorkspaceHookReviewOutcome {
  action: WorkspaceHookReviewDecision["action"] | "no_change";
  reviewItemIds: string[];
  reasonCode: WorkspaceHookReasonCode | undefined;
}

export type WorkspaceHookReviewResolveResult =
  | { accepted: true; reviewItemIds: string[] }
  | {
      accepted: false;
      reasonCode: "workspace_hooks_review_superseded" | "workspace_hooks_snapshot_mismatch";
    };

export interface WorkspaceHookReviewFlow {
  readonly request: WorkspaceHookReviewRequestPayload;
  readonly result: Promise<WorkspaceHookReviewOutcome>;
  readonly state: WorkspaceHookReviewFlowState;
}

type TerminalState = "resolved" | "superseded" | "timed_out" | "cancelled";

interface FlowRecord {
  request: WorkspaceHookReviewRequestPayload;
  state: WorkspaceHookReviewFlowState;
  settle: (outcome: WorkspaceHookReviewOutcome) => void;
  now: () => number;
  timer?: ReturnType<typeof setTimeout>;
  publicFlow: WorkspaceHookReviewFlow;
}

/** 终态 → 结果载荷。表驱动让"哪一种结束方式给什么结果"一眼可见。 */
const TERMINAL_OUTCOMES: Record<
  TerminalState,
  (reason: WorkspaceHookReasonCode | undefined) => WorkspaceHookReviewOutcome
> = {
  cancelled: (reasonCode) => ({ action: "no_change", reasonCode, reviewItemIds: [] }),
  resolved: () => ({ action: "no_change", reasonCode: undefined, reviewItemIds: [] }),
  superseded: (reasonCode) => ({ action: "no_change", reasonCode, reviewItemIds: [] }),
  timed_out: (reasonCode) => ({ action: "no_change", reasonCode, reviewItemIds: [] }),
};

const GENERATION_FIELDS = ["reviewFlowId", "generation", "interactionId"] as const;
const SNAPSHOT_FIELDS = [
  "sessionId",
  "taskId",
  "runId",
  "remoteSessionId",
  "workspaceIdentity",
  "bundleDigest",
] as const;

function sameFields(
  payload: WorkspaceHookReviewRequestPayload,
  probe: WorkspaceHookReviewTarget,
  keys: readonly string[],
): boolean {
  const actual = payload as unknown as Record<string, unknown>;
  const expected = probe as unknown as Record<string, unknown>;
  return keys.every((key) => actual[key] === expected[key]);
}

/** 同一代 = 流程 id、代次与交互 id 都对上（摘要不参与，摘要变的是快照）。 */
function isSameGeneration(
  request: WorkspaceHookReviewRequestPayload,
  target: WorkspaceHookReviewTarget,
): boolean {
  return sameFields(request, target, GENERATION_FIELDS);
}

/** 同一快照 = 会话/任务/运行/远端会话/工作区/摘要全部一致。 */
function isSameSnapshot(
  request: WorkspaceHookReviewRequestPayload,
  target: WorkspaceHookReviewTarget,
): boolean {
  return sameFields(request, target, SNAPSHOT_FIELDS);
}

function isSameRequest(
  earlier: WorkspaceHookReviewRequestPayload,
  later: WorkspaceHookReviewRequestPayload,
): boolean {
  const pairs = [
    earlier.reviewFlowId === later.reviewFlowId,
    earlier.generation === later.generation,
    earlier.interactionId === later.interactionId,
    earlier.bundleDigest === later.bundleDigest,
  ];
  return pairs.every(Boolean);
}

/**
 * 每个会话一"代"。注册表不读文件、不渲染界面：它只保存当前代、把决定结算一次，
 * 并由定时器把超时代也结算掉。
 */
export class WorkspaceHookReviewFlowRegistry {
  private readonly flows = new Map<string, FlowRecord>();
  private readonly clock: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.clock = options.now ?? (() => Date.now());
  }

  open(value: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow {
    const request = workspaceHookReviewRequestPayloadSchema.parse(value);
    const current = this.flows.get(request.sessionId);
    if (current?.state.state === "pending") {
      if (isSameRequest(current.request, request)) return current.publicFlow;
      throw new Error("A pending Workspace Hook review must be superseded explicitly");
    }
    const flow = this.create(request);
    this.flows.set(request.sessionId, flow);
    return flow.publicFlow;
  }

  supersede(
    target: WorkspaceHookReviewTarget,
    replacement: WorkspaceHookReviewRequestPayload,
  ): WorkspaceHookReviewFlow {
    const current = this.flows.get(target.sessionId);
    if (!current || !isSameGeneration(current.request, target))
      throw new Error("Cannot supersede an unknown Workspace Hook review generation");

    const next = workspaceHookReviewRequestPayloadSchema.parse(replacement);
    const advancesSameFlow =
      next.sessionId === current.request.sessionId &&
      next.reviewFlowId === current.request.reviewFlowId &&
      next.generation > current.request.generation;
    if (!advancesSameFlow)
      throw new Error("Replacement must advance the same Workspace Hook review flow");

    this.transition(current, "superseded", "workspace_hooks_review_superseded", next.interactionId);
    const flow = this.create(next);
    this.flows.set(next.sessionId, flow);
    return flow.publicFlow;
  }

  validate(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    const current = this.flows.get(target.sessionId);
    const superseded = {
      accepted: false as const,
      reasonCode: "workspace_hooks_review_superseded" as const,
    };
    const mismatch = {
      accepted: false as const,
      reasonCode: "workspace_hooks_snapshot_mismatch" as const,
    };

    if (!current || current.state.state !== "pending" || !isSameGeneration(current.request, target))
      return superseded;
    if (!isSameSnapshot(current.request, target)) return mismatch;

    const decision = workspaceHookReviewDecisionSchema.parse(decisionValue);
    const requested = [...new Set(decision.reviewItemIds)];
    const declared = new Set(current.request.items.map((item) => item.reviewItemId));
    if (requested.some((reviewItemId) => !declared.has(reviewItemId))) return mismatch;

    return { accepted: true, reviewItemIds: requested };
  }

  resolve(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    const validation = this.validate(target, decisionValue);
    if (!validation.accepted) return validation;

    const current = this.flows.get(target.sessionId);
    if (!current) return { accepted: false, reasonCode: "workspace_hooks_review_superseded" };

    const decision = workspaceHookReviewDecisionSchema.parse(decisionValue);
    if (current.state.state === "pending") {
      this.setState(current, "resolved");
      current.settle({
        action: decision.action,
        reasonCode: undefined,
        reviewItemIds: validation.reviewItemIds,
      });
    }
    return validation;
  }

  /** 失败与"无决定关闭"都要求代与快照都匹配且仍在等待；不匹配时不改状态。 */
  fail(target: WorkspaceHookReviewTarget, reasonCode: WorkspaceHookReasonCode): boolean {
    return this.close(target, "cancelled", reasonCode);
  }

  closeWithoutDecision(target: WorkspaceHookReviewTarget): boolean {
    return this.close(target, "resolved", undefined);
  }

  getCurrentFlow(sessionKey: string): WorkspaceHookReviewFlow | undefined {
    return this.flows.get(sessionKey)?.publicFlow;
  }

  getCurrent(sessionKey: string): WorkspaceHookReviewFlowState | undefined {
    const state = this.flows.get(sessionKey)?.state;
    return state ? { ...state } : undefined;
  }

  private close(
    target: WorkspaceHookReviewTarget,
    state: Extract<TerminalState, "cancelled" | "resolved">,
    reasonCode: WorkspaceHookReasonCode | undefined,
  ): boolean {
    const current = this.flows.get(target.sessionId);
    if (
      !current ||
      current.state.state !== "pending" ||
      !isSameGeneration(current.request, target) ||
      !isSameSnapshot(current.request, target)
    )
      return false;
    this.transition(current, state, reasonCode);
    return true;
  }

  private create(request: WorkspaceHookReviewRequestPayload): FlowRecord {
    let settle!: (outcome: WorkspaceHookReviewOutcome) => void;
    const result = new Promise<WorkspaceHookReviewOutcome>((resolve) => {
      settle = resolve;
    });

    const record = {
      now: this.clock,
      request,
      result,
      settle,
      state: workspaceHookReviewFlowStateSchema.parse(
        Object.fromEntries([
          ["bundleDigest", request.bundleDigest],
          ["createdAt", request.createdAt],
          ["deadlineAt", request.deadlineAt],
          ["generation", request.generation],
          ["interactionId", request.interactionId],
          ["reviewFlowId", request.reviewFlowId],
          ["sessionId", request.sessionId],
          ["state", "pending"],
          ["workspaceIdentity", request.workspaceIdentity],
        ]),
      ),
    } as unknown as FlowRecord;

    record.publicFlow = {
      get state() {
        return { ...record.state };
      },
      request,
      result,
    };

    record.timer = setTimeout(
      () => this.transition(record, "timed_out", "workspace_hooks_interaction_timeout"),
      Math.max(0, request.deadlineAt - this.clock()),
    );
    record.timer.unref?.();
    return record;
  }

  /** 唯一的迁移入口：非等待态直接忽略，保证结果只结算一次。 */
  private transition(
    flow: FlowRecord,
    state: TerminalState,
    reasonCode: WorkspaceHookReasonCode | undefined,
    supersededBy?: string,
  ): void {
    if (flow.state.state !== "pending") return;
    if (flow.timer) clearTimeout(flow.timer);
    this.setState(flow, state, supersededBy);
    flow.settle(TERMINAL_OUTCOMES[state](reasonCode));
  }

  private setState(flow: FlowRecord, state: TerminalState, supersededBy?: string): void {
    const merged: readonly (readonly [string, unknown])[] = [
      ...Object.entries(flow.state),
      ["state", state],
    ];
    flow.state = workspaceHookReviewFlowStateSchema.parse(
      Object.fromEntries(
        supersededBy ? [...merged, ["supersededByInteractionId", supersededBy]] : merged,
      ),
    );
  }
}
