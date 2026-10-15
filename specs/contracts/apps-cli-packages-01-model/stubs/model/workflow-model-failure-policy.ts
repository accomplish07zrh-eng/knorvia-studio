// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export type WorkflowProviderStopKind =
  | "auth"
  | "not_configured"
  | "model_unavailable"
  | "invalid_request"
  | "quota"
  | "other";
export const WORKFLOW_QUOTA_PROVIDER_CODES: ReadonlySet<string> = undefined as never;
export type WorkflowModelFailurePolicy =
  | { decision: "retry" }
  | { decision: "stop"; kind: WorkflowProviderStopKind }
  | { decision: "context_exceeded" }
  | { decision: "cancelled" };
export function resolveWorkflowModelFailurePolicy(
  failure: Pick<ClassifiedModelFailure, "code" | "reason" | "retryable">,
  providerCode: string | undefined,
): WorkflowModelFailurePolicy {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function retryAllowedByFailurePolicy(
  failure: ClassifiedModelFailure,
  retryBudget: ModelRetryBudget | undefined,
  providerCode: string | undefined,
): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export interface WorkflowModelFailureInspection {
  policy: WorkflowModelFailurePolicy;
  reason: string;
  providerCode?: string;
  providerId?: string;
  modelId?: string;
  rawMessage?: string;
  resetAt?: number;
}
export function inspectWorkflowModelFailure(
  error: unknown,
): WorkflowModelFailureInspection | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
