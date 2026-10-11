// SPDX-License-Identifier: Apache-2.0
// 审核流程注册表：每个 session 至多一个"当前代"。它只拥有当前代与结算，不持久化、不做 UI。
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

interface MutableFlow {
  request: WorkspaceHookReviewRequestPayload;
  state: WorkspaceHookReviewFlowState;
  settle: (outcome: WorkspaceHookReviewOutcome) => void;
  result: Promise<WorkspaceHookReviewOutcome>;
  timer?: ReturnType<typeof setTimeout>;
  public: WorkspaceHookReviewFlow;
}

function sameGeneration(
  request: WorkspaceHookReviewRequestPayload,
  target: WorkspaceHookReviewTarget,
): boolean {
  return (
    request.reviewFlowId === target.reviewFlowId &&
    request.generation === target.generation &&
    request.interactionId === target.interactionId
  );
}

function sameSnapshot(
  request: WorkspaceHookReviewRequestPayload,
  target: WorkspaceHookReviewTarget,
): boolean {
  return (
    request.sessionId === target.sessionId &&
    request.taskId === target.taskId &&
    request.runId === target.runId &&
    request.remoteSessionId === target.remoteSessionId &&
    request.workspaceIdentity === target.workspaceIdentity &&
    request.bundleDigest === target.bundleDigest
  );
}

function sameRequest(
  left: WorkspaceHookReviewRequestPayload,
  right: WorkspaceHookReviewRequestPayload,
): boolean {
  return (
    left.reviewFlowId === right.reviewFlowId &&
    left.generation === right.generation &&
    left.interactionId === right.interactionId &&
    left.bundleDigest === right.bundleDigest
  );
}

const NO_CHANGE = (reasonCode: WorkspaceHookReasonCode | undefined): WorkspaceHookReviewOutcome => ({
  action: "no_change",
  reasonCode,
  reviewItemIds: [],
});

/**
 * 注册表持有每个 session 的当前代。`open`/`supersede` 是唯一创建代的入口；
 * 三个终态（resolved / superseded / timed_out / cancelled）都只结算一次。
 */
export class WorkspaceHookReviewFlowRegistry {
  private readonly currentBySession = new Map<string, MutableFlow>();

  open(value: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow {
    const request = workspaceHookReviewRequestPayloadSchema.parse(value);
    const current = this.currentBySession.get(request.sessionId);
    if (current && current.state.state === "pending") {
      if (sameRequest(current.request, request)) return current.public;
      throw new Error("A pending Workspace Hook review must be superseded explicitly");
    }
    const flow = this.createFlow(request);
    this.currentBySession.set(request.sessionId, flow);
    return flow.public;
  }

  supersede(
    target: WorkspaceHookReviewTarget,
    replacement: WorkspaceHookReviewRequestPayload,
  ): WorkspaceHookReviewFlow {
    const current = this.currentBySession.get(target.sessionId);
    if (!current || !sameGeneration(current.request, target))
      throw new Error("Cannot supersede an unknown Workspace Hook review generation");

    const next = workspaceHookReviewRequestPayloadSchema.parse(replacement);
    if (
      next.sessionId !== current.request.sessionId ||
      next.reviewFlowId !== current.request.reviewFlowId ||
      next.generation <= current.request.generation
    )
      throw new Error("Replacement must advance the same Workspace Hook review flow");

    this.finish(current, {
      state: "superseded",
      supersededByInteractionId: next.interactionId,
      outcome: NO_CHANGE("workspace_hooks_review_superseded"),
    });
    const flow = this.createFlow(next);
    this.currentBySession.set(next.sessionId, flow);
    return flow.public;
  }

  validate(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    const current = this.currentBySession.get(target.sessionId);
    if (!current || current.state.state !== "pending" || !sameGeneration(current.request, target))
      return { accepted: false, reasonCode: "workspace_hooks_review_superseded" };
    if (!sameSnapshot(current.request, target))
      return { accepted: false, reasonCode: "workspace_hooks_snapshot_mismatch" };

    const decision = workspaceHookReviewDecisionSchema.parse(decisionValue);
    const reviewItemIds = [...new Set(decision.reviewItemIds)];
    const known = new Set(current.request.items.map((item) => item.reviewItemId));
    if (reviewItemIds.some((reviewItemId) => !known.has(reviewItemId)))
      return { accepted: false, reasonCode: "workspace_hooks_snapshot_mismatch" };

    return { accepted: true, reviewItemIds };
  }

  resolve(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    const validation = this.validate(target, decisionValue);
    if (!validation.accepted) return validation;

    const current = this.currentBySession.get(target.sessionId);
    if (!current) return { accepted: false, reasonCode: "workspace_hooks_review_superseded" };

    const decision = workspaceHookReviewDecisionSchema.parse(decisionValue);
    this.finish(current, {
      outcome: {
        action: decision.action,
        reasonCode: undefined,
        reviewItemIds: validation.reviewItemIds,
      },
      state: "resolved",
    });
    return validation;
  }

  fail(target: WorkspaceHookReviewTarget, reasonCode: WorkspaceHookReasonCode): boolean {
    const current = this.pendingFlowFor(target);
    if (!current) return false;
    this.finish(current, { outcome: NO_CHANGE(reasonCode), state: "cancelled" });
    return true;
  }

  closeWithoutDecision(target: WorkspaceHookReviewTarget): boolean {
    const current = this.pendingFlowFor(target);
    if (!current) return false;
    this.finish(current, { outcome: NO_CHANGE(undefined), state: "resolved" });
    return true;
  }

  getCurrentFlow(sessionId: string): WorkspaceHookReviewFlow | undefined {
    return this.currentBySession.get(sessionId)?.public;
  }

  getCurrent(sessionId: string): WorkspaceHookReviewFlowState | undefined {
    const state = this.currentBySession.get(sessionId)?.state;
    return state ? { ...state } : undefined;
  }

  private pendingFlowFor(target: WorkspaceHookReviewTarget): MutableFlow | undefined {
    const current = this.currentBySession.get(target.sessionId);
    if (
      !current ||
      current.state.state !== "pending" ||
      !sameGeneration(current.request, target) ||
      !sameSnapshot(current.request, target)
    )
      return undefined;
    return current;
  }

  private createFlow(request: WorkspaceHookReviewRequestPayload): MutableFlow {
    let settle!: (outcome: WorkspaceHookReviewOutcome) => void;
    const result = new Promise<WorkspaceHookReviewOutcome>((resolve) => {
      settle = resolve;
    });

    const flow = {} as MutableFlow;
    const publicFlow: WorkspaceHookReviewFlow = {
      get state() {
        return { ...flow.state };
      },
      request,
      result,
    };

    Object.assign(flow, {
      public: publicFlow,
      request,
      result,
      settle: (outcome: WorkspaceHookReviewOutcome) => settle(outcome),
      state: workspaceHookReviewFlowStateSchema.parse({
        bundleDigest: request.bundleDigest,
        createdAt: request.createdAt,
        deadlineAt: request.deadlineAt,
        generation: request.generation,
        interactionId: request.interactionId,
        reviewFlowId: request.reviewFlowId,
        sessionId: request.sessionId,
        state: "pending",
        workspaceIdentity: request.workspaceIdentity,
      }),
    });

    flow.timer = setTimeout(
      () => {
        if (flow.state.state !== "pending") return;
        this.finish(flow, {
          outcome: NO_CHANGE("workspace_hooks_interaction_timeout"),
          state: "timed_out",
        });
      },
      Math.max(0, request.deadlineAt - Date.now()),
    );
    flow.timer.unref?.();
    return flow;
  }

  /** 唯一的状态迁移点：只有 pending 可以迁移，重复调用被忽略（result 只结算一次）。 */
  private finish(
    flow: MutableFlow,
    input: {
      state: "resolved" | "superseded" | "timed_out" | "cancelled";
      supersededByInteractionId?: string;
      outcome: WorkspaceHookReviewOutcome;
    },
  ): void {
    if (flow.state.state !== "pending") return;
    if (flow.timer) clearTimeout(flow.timer);
    flow.state = workspaceHookReviewFlowStateSchema.parse({
      ...flow.state,
      state: input.state,
      ...(input.supersededByInteractionId
        ? { supersededByInteractionId: input.supersededByInteractionId }
        : {}),
    });
    flow.settle(input.outcome);
  }
}
