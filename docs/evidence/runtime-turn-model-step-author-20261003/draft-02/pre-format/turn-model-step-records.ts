import { traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import { objectKeys, isTurnCancellationError, projectExecutionErrorPayload } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelTextResult } from "../types.js";

type ToolCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>;

export function logTurnModelDiagnostics(
  runtime: AgentRuntimeInternal, modelTraceContext: TraceContext, result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"], rawFinishReason: string | undefined,
  responseLength: number, toolCalls: ToolCalls,
): void {
  runtime.logger?.info("Model response diagnostics", {
    ...traceContextToLogContext(modelTraceContext),
    event: "model.response.diagnostics",
    finishReason: result.finishReason,
    module: "core.runtime",
    providerMetadataKeys: objectKeys(result.providerMetadata),
    rawFinishReason,
    responseEmpty: responseLength === 0,
    responseLength,
    status: "completed",
    toolCallCount: toolCalls.length,
    usageCacheReadTokens: usage.cacheReadTokens,
    usageCacheWriteTokens: usage.cacheWriteTokens,
    usageInputTokens: usage.inputTokens,
    usageOutputTokens: usage.outputTokens,
    usageReasoningTokens: usage.reasoningTokens,
    usageTotalTokens: usage.totalTokens,
  });
}

export function logTurnModelSuspiciousEmpty(
  runtime: AgentRuntimeInternal, modelTraceContext: TraceContext, result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"], rawFinishReason: string | undefined,
  responseLength: number, toolCalls: ToolCalls,
): void {
    runtime.logger?.warn("Model returned an empty non-stop result", {
      ...traceContextToLogContext(modelTraceContext),
      event: "model.response.suspicious_empty",
      finishReason: result.finishReason,
      module: "core.runtime",
      rawFinishReason,
      responseLength,
      status: "failed",
      toolCallCount: toolCalls.length,
      usageTotalTokens: usage.totalTokens,
    });
}

export function persistedFailure(error: unknown, signal: AbortSignal) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : undefined;
  const attribution = projectExecutionErrorPayload(error).attribution;
  return {
    name,
    data: {
      message,
      ...(code ? { code } : {}),
      ...(attribution ? { attribution } : {}),
      ...(isTurnCancellationError(error, signal) ? { turnResult: "cancelled" } : {}),
    },
  };
}
