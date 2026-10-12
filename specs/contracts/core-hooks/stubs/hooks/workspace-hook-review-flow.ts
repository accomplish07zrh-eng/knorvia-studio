// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-review-flow.ts）。仅签名，无实现。
import type { WorkspaceHookReasonCode, WorkspaceHookReviewFlowState } from "@knorvia/contracts";
import type {
  WorkspaceHookReviewDecision,
  WorkspaceHookReviewRequestPayload,
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
  action: "trust_selected" | "no_change";
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
export class WorkspaceHookReviewFlowRegistry {
  open(value: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow {
    void value;
    throw new Error("not implemented: core-hooks");
  }
  supersede(
    target: WorkspaceHookReviewTarget,
    replacement: WorkspaceHookReviewRequestPayload,
  ): WorkspaceHookReviewFlow {
    void target;
    void replacement;
    throw new Error("not implemented: core-hooks");
  }
  validate(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    void target;
    void decisionValue;
    throw new Error("not implemented: core-hooks");
  }
  resolve(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult {
    void target;
    void decisionValue;
    throw new Error("not implemented: core-hooks");
  }
  fail(target: WorkspaceHookReviewTarget, reasonCode: WorkspaceHookReasonCode): boolean {
    void target;
    void reasonCode;
    throw new Error("not implemented: core-hooks");
  }
  closeWithoutDecision(target: WorkspaceHookReviewTarget): boolean {
    void target;
    throw new Error("not implemented: core-hooks");
  }
  getCurrentFlow(sessionId: string): WorkspaceHookReviewFlow | undefined {
    void sessionId;
    throw new Error("not implemented: core-hooks");
  }
  getCurrent(sessionId: string): WorkspaceHookReviewFlowState | undefined {
    void sessionId;
    throw new Error("not implemented: core-hooks");
  }
}
