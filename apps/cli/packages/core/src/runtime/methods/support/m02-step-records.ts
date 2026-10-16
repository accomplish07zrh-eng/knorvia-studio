// SPDX-License-Identifier: Apache-2.0
// 模型步诊断、失败形状、取消快照提交。诊断键表是 recoveredFromStreamFailure 的观察面。
import { createRuntimeAssistantEntry } from "../../../agent/message-history.js";
import { traceContextToLogContext, type TraceContext } from "../../deps.js";
import {
  isTurnCancellationError,
  objectKeys,
  projectExecutionErrorPayload,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelStreamSnapshot, RuntimeModelTextResult } from "../../types.js";
import { phrase, report } from "./m02-record.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";
import {
  commitTurnRequestEntries,
  hasAssistantReasoningContent,
} from "./m02-continuation.js";

type ToolCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>;

const DIAGNOSTICS_EVENT = phrase(["model.response.", "diagnostics"]);
const SUSPICIOUS_EVENT = phrase(["model.response.", "suspicious_empty"]);

function usageNumber(usage: RuntimeModelTextResult["usage"], key: string): unknown {
  return (usage as unknown as Record<string, unknown>)[key];
}

export function logTurnModelDiagnostics(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawFinishReason: string | undefined,
  responseLength: number,
  toolCalls: ToolCalls,
): void {
  report(runtime, "info", phrase(["Model response ", "diagnostics"]), {
    ...traceContextToLogContext(modelTraceContext),
    event: DIAGNOSTICS_EVENT,
    finishReason: result.finishReason,
    module: "core.runtime",
    providerMetadataKeys: objectKeys(result.providerMetadata),
    rawFinishReason,
    responseEmpty: responseLength === 0,
    responseLength,
    status: "completed",
    toolCallCount: toolCalls.length,
    usageCacheReadTokens: usageNumber(usage, "cacheReadTokens"),
    usageCacheWriteTokens: usageNumber(usage, "cacheWriteTokens"),
    usageInputTokens: usageNumber(usage, "inputTokens"),
    usageOutputTokens: usageNumber(usage, "outputTokens"),
    usageReasoningTokens: usageNumber(usage, "reasoningTokens"),
    usageTotalTokens: usageNumber(usage, "totalTokens"),
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
  report(runtime, "warn", phrase(["Model returned an empty ", "non-stop result"]), {
    ...traceContextToLogContext(modelTraceContext),
    event: SUSPICIOUS_EVENT,
    finishReason: result.finishReason,
    module: "core.runtime",
    rawFinishReason,
    responseLength,
    status: "completed",
    toolCallCount: toolCalls.length,
    usageTotalTokens: usageNumber(usage, "totalTokens"),
  });
}

export function prepareFailureFacts(error: unknown, state: RegularTurnLoopState) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const code = typeof record?.code === "string" ? record.code : undefined;
  const projection = projectExecutionErrorPayload(error);
  const turnResult = isTurnCancellationError(error, state.turnAbortSignal) ? "cancelled" : undefined;
  return { code, projection, turnResult };
}

export function persistedFailure(error: unknown, facts: ReturnType<typeof prepareFailureFacts>) {
  const named = error instanceof Error;
  const data: {
    message: string;
    code?: string;
    attribution?: unknown;
    turnResult?: string;
  } = { message: named ? error.message : String(error) };
  if (facts.code) data.code = facts.code;
  if (facts.projection.attribution) data.attribution = facts.projection.attribution;
  if (facts.turnResult) data.turnResult = facts.turnResult;
  return { name: named ? error.name : "UnknownError", data };
}

export function commitCancelledAssistantSnapshot(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  snapshot: RuntimeModelStreamSnapshot,
): void {
  const reasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
  const hasText = snapshot.text.length > 0;
  if (!hasText && reasoning.length === 0) return;
  const model = state.model;
  const modelRef = model ? { providerId: model.providerId, modelId: model.modelId } : undefined;
  const entry = createRuntimeAssistantEntry(snapshot.text, undefined, reasoning, modelRef);
  commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
  recordModelHistoryRound(state);
}
