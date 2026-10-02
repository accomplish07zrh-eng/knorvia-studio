import { traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import {
  objectKeys,
  isTurnCancellationError,
  projectExecutionErrorPayload,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelTextResult } from "../types.js";

type ToolCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>;

export function logTurnModelDiagnostics(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawFinishReason: string | undefined,
  responseLength: number,
  toolCalls: ToolCalls,
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
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawFinishReason: string | undefined,
  responseLength: number,
  toolCalls: ToolCalls,
): void {
  runtime.logger?.warn("Model returned an empty non-stop result", {
    ...traceContextToLogContext(modelTraceContext),
    event: "model.response.suspicious_empty",
    finishReason: result.finishReason,
    module: "core.runtime",
    rawFinishReason,
    responseLength,
    status: "completed",
    toolCallCount: toolCalls.length,
    usageTotalTokens: usage.totalTokens,
  });
}

export function prepareFailureFacts(error: unknown, state: RegularTurnLoopState) {
  const record =
    error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const code = typeof record?.code === "string" ? record.code : undefined;
  const projection = projectExecutionErrorPayload(error);
  const turnResult = isTurnCancellationError(error, state.turnAbortSignal)
    ? "cancelled"
    : undefined;
  return { code, projection, turnResult };
}

export function persistedFailure(error: unknown, facts: ReturnType<typeof prepareFailureFacts>) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    data: {
      message: error instanceof Error ? error.message : String(error),
      ...(facts.code ? { code: facts.code } : {}),
      ...(facts.projection.attribution ? { attribution: facts.projection.attribution } : {}),
      ...(facts.turnResult ? { turnResult: facts.turnResult } : {}),
    },
  };
}

import type { RegularTurnLoopState } from "./turn-loop-state.js";

export function commitCancelledAssistantSnapshot(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  snapshot: RuntimeModelStreamSnapshot,
): void {
  const reasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
  if (snapshot.text.length > 0 || reasoning.length > 0) {
    const entry = createRuntimeAssistantEntry(
      snapshot.text,
      undefined,
      reasoning,
      state.model
        ? { providerId: state.model.providerId, modelId: state.model.modelId }
        : undefined,
    );
    commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
    recordModelHistoryRound(state);
  }
}

import { createRuntimeAssistantEntry } from "../../agent/message-history.js";
import {
  commitTurnRequestEntries,
  hasAssistantReasoningContent,
} from "./turn-output-token-continuation.js";
import { recordModelHistoryRound } from "./turn-loop-state.js";
import type { RuntimeModelStreamSnapshot } from "../types.js";
