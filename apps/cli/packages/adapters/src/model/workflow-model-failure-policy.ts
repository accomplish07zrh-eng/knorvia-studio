// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelRetryBudget } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { isUnboundedRetryBudget } from "./retry-budget.js";
export type WorkflowProviderStopKind =
  | "auth"
  | "not_configured"
  | "model_unavailable"
  | "invalid_request"
  | "quota"
  | "other";
export const WORKFLOW_QUOTA_PROVIDER_CODES: ReadonlySet<string> = new Set([
  "1005",
  "2056",
  "20097",
  "1304",
  "1308",
  "1310",
  "1313",
  "1316",
  "1317",
  "1318",
  "1319",
  "1320",
  "1321",
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "exceeded_current_quota_error",
]);
export type WorkflowModelFailurePolicy =
  | { decision: "retry" }
  | { decision: "stop"; kind: WorkflowProviderStopKind }
  | { decision: "context_exceeded" }
  | { decision: "cancelled" };
export function resolveWorkflowModelFailurePolicy(
  failure: Pick<ClassifiedModelFailure, "code" | "reason" | "retryable">,
  providerCode: string | undefined,
): WorkflowModelFailurePolicy {
  if (failure.reason === "cancelled") return { decision: "cancelled" };
  if (providerCode && WORKFLOW_QUOTA_PROVIDER_CODES.has(providerCode))
    return { decision: "stop", kind: "quota" };
  if (failure.reason === "context_exceeded" || failure.code === "model_context_exceeded")
    return { decision: "context_exceeded" };
  if (failure.reason === "auth_failed") return { decision: "stop", kind: "auth" };
  if (failure.reason === "provider_not_configured" || failure.code === "provider_not_configured")
    return { decision: "stop", kind: "not_configured" };
  if (failure.code === "model_not_found") return { decision: "stop", kind: "model_unavailable" };
  if (failure.reason === "invalid_request" || failure.code === "invalid_model_request")
    return { decision: "stop", kind: "invalid_request" };
  return { decision: "retry" };
}
export function retryAllowedByFailurePolicy(
  failure: ClassifiedModelFailure,
  retryBudget: ModelRetryBudget | undefined,
  providerCode: string | undefined,
): boolean {
  return isUnboundedRetryBudget(retryBudget)
    ? resolveWorkflowModelFailurePolicy(failure, providerCode).decision === "retry"
    : failure.retryable;
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
  const candidates = [
    error,
    typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const record = candidate as { name?: unknown; message?: unknown; context?: unknown };
    if (
      record.name !== "AiSdkModelAdapterError" ||
      typeof record.context !== "object" ||
      record.context === null
    )
      continue;
    const context = record.context as Record<string, unknown>;
    const reason = typeof context.reason === "string" ? context.reason : "unknown";
    const failure = {
      code: String(context.code ?? "model_request_failed"),
      reason,
      retryable: context.retryable === true,
    } as ClassifiedModelFailure;
    const providerCode =
      typeof context.providerErrorCode === "string" ? context.providerErrorCode : undefined;
    const retryAfterMs =
      typeof context.retryAfterMs === "number" ? context.retryAfterMs : undefined;
    return {
      policy: resolveWorkflowModelFailurePolicy(failure, providerCode),
      reason,
      providerCode,
      providerId: typeof context.providerId === "string" ? context.providerId : undefined,
      modelId: typeof context.modelId === "string" ? context.modelId : undefined,
      rawMessage: typeof record.message === "string" ? record.message : undefined,
      resetAt: retryAfterMs === undefined ? undefined : Date.now() + retryAfterMs,
    };
  }
  return undefined;
}
