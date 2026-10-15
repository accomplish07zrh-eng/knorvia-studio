// SPDX-License-Identifier: Apache-2.0
// 流结果体检：在流结束、队列排空后调用。只打日志不改状态——上下文超限与可疑空响应各一条
// warn；可疑空响应再交收尾通道转成模型错误（收尾转换可能抛出，属既有语义）。
import { traceContextToLogContext } from "../../deps.js";
import type { TraceContext } from "../../deps.js";
import {
  buildSuspiciousEmptyDiagnostics,
  finalizeSuspiciousEmptyModelResult,
  isContextExceededFinishReason,
  isSuspiciousEmptyModelResult,
  readRawFinishReason,
} from "../../helpers/index.js";
import { isOutputTokenLimitFinishReason } from "../turn-output-token-continuation.js";

/** 两种命中各自的日志文案与事件名（兼容接口取值，逐字）。 */
const INSPECTION_LOG_TEXT = {
  overflowEvent: "model.runtime.stream.context_exceeded",
  overflowMessage: "Model stream ended with provider context overflow",
  suspiciousEvent: "model.runtime.stream.suspicious_empty",
  suspiciousMessage: "Model stream ended with suspicious empty completion",
  module: "core.runtime",
} as const;

/** 体检入参：流结束的收尾事实 + 模型选择 + 追踪上下文。 */
export interface StreamInspectionRequest {
  /** 日志回调（warn 级）。 */
  warn: (message: string, fields: Record<string, unknown>) => void;
  /** 收尾原因。 */
  finishReason: string | undefined;
  /** 供应商原始收尾原因所在的元数据。 */
  providerMetadata: Record<string, unknown> | undefined;
  /** 用量快照（可疑空响应判定用）。 */
  usage: unknown;
  /** 已收文本。 */
  text: string;
  /** 已收工具调用表。 */
  toolCalls: unknown[];
  /** 模型选择（日志归因）。 */
  modelSelection: { modelId: string; providerId: string };
  /** 追踪上下文。 */
  traceContext: TraceContext;
}

/** 流结果体检：命中即 warn（可疑空响应再走收尾转换）。 */
export function inspectStreamOutcome(request: StreamInspectionRequest): void {
  const rawFinishReason = readRawFinishReason(request.providerMetadata);
  const outputCapped = isOutputTokenLimitFinishReason(request.finishReason, rawFinishReason);
  const overflowHit =
    request.toolCalls.length === 0 &&
    !outputCapped &&
    isContextExceededFinishReason(request.finishReason, rawFinishReason);
  if (overflowHit) {
    request.warn(INSPECTION_LOG_TEXT.overflowMessage, {
      ...traceContextToLogContext(request.traceContext),
      event: INSPECTION_LOG_TEXT.overflowEvent,
      finishReason: request.finishReason,
      module: INSPECTION_LOG_TEXT.module,
      modelId: request.modelSelection.modelId,
      modelProviderId: request.modelSelection.providerId,
      rawFinishReason,
      textLength: request.text.length,
      toolCallCount: request.toolCalls.length,
    });
    return;
  }
  const suspiciousHit =
    !outputCapped &&
    isSuspiciousEmptyModelResult(
      request.finishReason,
      request.text.length,
      request.toolCalls.length,
      request.usage as never,
    );
  if (!suspiciousHit) return;
  request.warn(INSPECTION_LOG_TEXT.suspiciousMessage, {
    ...traceContextToLogContext(request.traceContext),
    event: INSPECTION_LOG_TEXT.suspiciousEvent,
    finishReason: request.finishReason,
    module: INSPECTION_LOG_TEXT.module,
    modelId: request.modelSelection.modelId,
    modelProviderId: request.modelSelection.providerId,
    textLength: request.text.length,
    toolCallCount: request.toolCalls.length,
    ...buildSuspiciousEmptyDiagnostics({
      finishReason: request.finishReason,
      providerMetadata: request.providerMetadata,
      rawFinishReason,
    }),
  });
  finalizeSuspiciousEmptyModelResult({
    finishReason: request.finishReason,
    model: request.modelSelection,
    providerMetadata: request.providerMetadata,
    rawFinishReason,
  });
}
