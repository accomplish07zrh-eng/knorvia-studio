// SPDX-License-Identifier: Apache-2.0
// workflow 侧的模型失败裁决：按「取消 → 配额码 → 上下文超限 → 鉴权 → 未配置 → 未找到 →
// 无效请求 → 重试」的固定顺序取第一个命中；配额码表与决策值是协议面，逐字保持。
// 另提供失败检视：从适配错误（或其一层 cause）还原裁决要素。

import type { ModelRetryBudget } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { isUnboundedRetryBudget } from "./retry-budget.js";

export type WorkflowProviderStopKind =
  | "auth" // 会话鉴权失败
  | "not_configured" // provider 未配置
  | "model_unavailable" // 模型不存在
  | "invalid_request" // 请求不合法
  | "quota" // 配额耗尽
  | "other"; // 其它停机原因（表内不产生）

export const WORKFLOW_QUOTA_PROVIDER_CODES: ReadonlySet<string> = new Set(
  "1005 2056 20097 1304 1308 1310 1313 1316 1317 1318 1319 1320 1321 insufficient_quota credit_balance_exhausted organization_spend_limit_exceeded project_spend_limit_exceeded organization_usage_limit_exceeded exceeded_current_quota_error".split(
    " ",
  ),
);

export type WorkflowModelFailurePolicy =
  | { decision: "retry" } // 有界预算下再看 retryable
  | { decision: "stop"; kind: WorkflowProviderStopKind } // 明确不可继续
  | { decision: "context_exceeded" } // 交回 core 做上下文压缩
  | { decision: "cancelled" }; // 请求已取消

interface VerdictShape {
  code: string; // 错误码
  reason: string; // 失败归因
  retryable: boolean; // 有界预算下的可重试标记
}

const RETRY: WorkflowModelFailurePolicy = { decision: "retry" };
const CANCELLED: WorkflowModelFailurePolicy = { decision: "cancelled" };
const CONTEXT_EXCEEDED: WorkflowModelFailurePolicy = { decision: "context_exceeded" };

function stop(kind: WorkflowProviderStopKind): WorkflowModelFailurePolicy {
  return { decision: "stop", kind };
}

export function resolveWorkflowModelFailurePolicy(
  verdict: VerdictShape,
  codeText: string | undefined,
): WorkflowModelFailurePolicy {
  if (verdict.reason === "cancelled") return CANCELLED;
  if (codeText && WORKFLOW_QUOTA_PROVIDER_CODES.has(codeText)) return stop("quota");
  if (verdict.reason === "context_exceeded" || verdict.code === "model_context_exceeded")
    return CONTEXT_EXCEEDED;
  if (verdict.reason === "auth_failed") return stop("auth");
  if (verdict.reason === "provider_not_configured" || verdict.code === "provider_not_configured")
    return stop("not_configured");
  if (verdict.code === "model_not_found") return stop("model_unavailable");
  if (verdict.reason === "invalid_request" || verdict.code === "invalid_model_request")
    return stop("invalid_request");
  return RETRY;
}

export function retryAllowedByFailurePolicy(
  verdict: ClassifiedModelFailure,
  budget: ModelRetryBudget | undefined,
  codeText: string | undefined,
): boolean {
  if (isUnboundedRetryBudget(budget)) {
    return resolveWorkflowModelFailurePolicy(verdict, codeText).decision === "retry";
  }
  return verdict.retryable;
}

export interface WorkflowModelFailureInspection {
  policy: WorkflowModelFailurePolicy; // 裁决结果
  reason: string; // 失败归因（缺省 unknown）
  providerCode?: string; // provider 业务码
  providerId?: string; // provider 身份
  modelId?: string; // 模型身份
  rawMessage?: string; // 原始错误消息
  resetAt?: number; // Retry-After 换算的重试时刻
}

function inspectLayer(layer: unknown): WorkflowModelFailureInspection | undefined {
  if (typeof layer !== "object" || layer === null) return undefined;
  const record = layer as { name?: unknown; message?: unknown; context?: unknown };
  if (record.name !== "AiSdkModelAdapterError") return undefined;
  if (typeof record.context !== "object" || record.context === null) return undefined;
  const bag = record.context as Record<string, unknown>;
  const verdictReason = typeof bag.reason === "string" ? bag.reason : "unknown";
  const verdict = {
    code: String(bag.code ?? "model_request_failed"),
    reason: verdictReason,
    retryable: bag.retryable === true,
  } as ClassifiedModelFailure;
  const codeText = typeof bag.providerErrorCode === "string" ? bag.providerErrorCode : undefined;
  const retryAfterMs = typeof bag.retryAfterMs === "number" ? bag.retryAfterMs : undefined;
  return {
    policy: resolveWorkflowModelFailurePolicy(verdict, codeText),
    reason: verdictReason,
    providerCode: codeText,
    providerId: typeof bag.providerId === "string" ? bag.providerId : undefined,
    modelId: typeof bag.modelId === "string" ? bag.modelId : undefined,
    rawMessage: typeof record.message === "string" ? record.message : undefined,
    resetAt: retryAfterMs === undefined ? undefined : Date.now() + retryAfterMs,
  };
}

export function inspectWorkflowModelFailure(
  error: unknown,
): WorkflowModelFailureInspection | undefined {
  const layers = [
    error,
    typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined,
  ];
  for (const layer of layers) {
    const hit = inspectLayer(layer);
    if (hit) return hit;
  }
  return undefined;
}
