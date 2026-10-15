// SPDX-License-Identifier: Apache-2.0
// 空模型响应的判定、诊断与收尾抛错（B28 的空响应半边）。
// 空响应判定：文本 0、工具调用 0、finishReason 不是 stop/tool-calls/tool_calls、用量全 0。
// 诊断对象给 finishReason、元数据键（最多 20 个）、出站 header 键、业务码与响应摘要。
// 收尾函数**以抛出为正常返回**：命中提供方业务失败 → ModelError（不可重试、带 providerCode
// 与响应摘要）；否则抛「空模型响应」ModelError（可重试、reason=empty_model_response）。
import { CoreErrorType, createCoreError } from "../../deps.js";
import type { ModelUsage } from "../../deps.js";
import { findProviderBusinessFailureInMetadata } from "./provider-business-failure.js";

// 空响应的 reason 标记与正文（逐字冻结）。
const EMPTY_RESPONSE_REASON = "empty_model_response";
const EMPTY_RESPONSE_MESSAGE =
  "Model returned no text, no tool calls, and no usage before completing the turn.";

// 诊断对象里元数据键的截断上限。
const METADATA_KEY_CAP = 20;

// 正常收尾的 finishReason 白名单：stop 与两种工具调用拼写。
const NORMAL_FINISH_REASONS = new Set<string>(["stop", "tool-calls", "tool_calls"]);

// 用量全 0 判定：totalTokens 缺省时按五个分项求和。
const hasZeroUsage = (snapshot: ModelUsage | undefined): boolean => {
  if (!snapshot) return true;
  const breakdown = [
    snapshot.inputTokens,
    snapshot.outputTokens,
    snapshot.cacheReadTokens,
    snapshot.cacheWriteTokens,
    snapshot.reasoningTokens,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return (snapshot.totalTokens ?? breakdown) === 0;
};

export const isSuspiciousEmptyModelResult = (
  finishReason: string | undefined, // 会话收尾原因
  textLength: number, // 文本长度
  callCount: number, // 工具调用数
  usage?: ModelUsage, // 用量快照
): boolean => {
  if (textLength !== 0 || callCount !== 0) return false;
  const normalizedFinish = finishReason?.trim().toLowerCase() ?? "";
  const normalStop = NORMAL_FINISH_REASONS.has(normalizedFinish);
  return !normalStop && hasZeroUsage(usage);
};

// 诊断请求面（字段名是兼容接口）。
export interface SuspiciousEmptyDiagnosticsInput {
  finishReason: /* 会话收尾原因 */ string | undefined;
  providerMetadata: /* 提供方元数据，键只取前 20 个 */ Record<string, unknown> | undefined;
  rawFinishReason: /* 原始收尾原因 */ string | undefined;
  outboundHeaderKeys?: /* 出站 header 键 */ string[];
}

export const buildSuspiciousEmptyDiagnostics = (
  probe: SuspiciousEmptyDiagnosticsInput,
): Record<string, unknown> => {
  const businessHit = findProviderBusinessFailureInMetadata(probe.providerMetadata);
  const metadataKeys = probe.providerMetadata ? Object.keys(probe.providerMetadata) : [];
  const diagnostics = {
    finishReason: probe.finishReason ?? null,
    rawFinishReason: probe.rawFinishReason ?? null,
    outboundHeaderKeys: probe.outboundHeaderKeys ?? [],
    providerMetadataKeys: metadataKeys.slice(0, METADATA_KEY_CAP),
    providerBusinessCodeFromMetadata: businessHit?.providerCode ?? null,
    providerBusinessMessageFromMetadata: businessHit?.message ?? null,
    responseBodySummaryFromMetadata: businessHit?.responseBodySummary ?? null,
  };
  return diagnostics;
};

// 收尾请求面（字段名是兼容接口）。
export interface SuspiciousEmptyFinalizeInput {
  finishReason: /* 会话收尾原因 */ string | undefined;
  model: {
    modelId: /* 模型 id */ string;
    providerId: /* 供应商 id */ string;
  };
  providerMetadata: /* 提供方元数据，先找业务失败 */ Record<string, unknown> | undefined;
  rawFinishReason: /* 原始收尾原因 */ string | undefined;
}

export const finalizeSuspiciousEmptyModelResult = (probe: SuspiciousEmptyFinalizeInput): void => {
  const failureModel = probe.model;
  const businessHit = findProviderBusinessFailureInMetadata(probe.providerMetadata);
  if (businessHit) {
    // 供应商业务失败：不可重试，providerCode 与响应摘要进 context。
    const context: Record<string, unknown> = { source: "provider" };
    if (failureModel) {
      context.modelId = failureModel.modelId;
      context.providerId = failureModel.providerId;
    }
    if (businessHit.providerCode) context.providerCode = businessHit.providerCode;
    if (businessHit.responseBodySummary) {
      context.responseBodySummary = businessHit.responseBodySummary;
    }
    throw createCoreError(CoreErrorType.ModelError, businessHit.message, {
      context,
      recoverable: true,
      retryable: false,
    });
  }
  const emptyResponseContext: Record<string, unknown> = {
    reason: EMPTY_RESPONSE_REASON,
    suspiciousEmpty: true,
    source: "provider",
    finishReason: probe.finishReason,
    rawFinishReason: probe.rawFinishReason,
  };
  if (failureModel) {
    emptyResponseContext.modelId = failureModel.modelId;
    emptyResponseContext.providerId = failureModel.providerId;
  }
  throw createCoreError(CoreErrorType.ModelError, EMPTY_RESPONSE_MESSAGE, {
    context: emptyResponseContext,
    recoverable: true,
    retryable: true,
  });
};
