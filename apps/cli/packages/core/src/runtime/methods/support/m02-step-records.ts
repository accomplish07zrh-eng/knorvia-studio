// SPDX-License-Identifier: Apache-2.0
// 模型步的诊断日志、失败载荷，以及取消时仍要留下的助手快照。
import type { Model } from "@knorvia/contracts";
import { createRuntimeAssistantEntry } from "../../../agent/message-history.js";
import { traceContextToLogContext, type TraceContext } from "../../deps.js";
import {
  isTurnCancellationError,
  objectKeys,
  projectExecutionErrorPayload,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelStreamSnapshot, RuntimeModelTextResult } from "../../types.js";
import { assignKeys, phrase, putIf, report } from "./m02-record.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";
import { commitTurnRequestEntries, hasAssistantReasoningContent } from "./m02-continuation.js";

type ListedCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>; // 从结果抽出的工具调用

const DIAGNOSTICS_EVENT = phrase(["model.response.", "diagnostics"]);
const SUSPICIOUS_EVENT = phrase(["model.response.", "suspicious_empty"]);
const MODULE_NAME = phrase(["core.runtime"]);
const COMPLETED_STATUS = phrase(["completed"]);
const UNKNOWN_ERROR_NAME = phrase(["UnknownError"]);
const CANCELLED_RESULT = phrase(["cancelled"]);

type ErrorProjection = ReturnType<typeof projectExecutionErrorPayload>;

interface FailureFacts {
  code: string | undefined; // 只保留字符串码
  projection: ErrorProjection; // 执行错误投影
  turnResult: string | undefined; // 仅取消时为 cancelled
}

interface FailureData {
  message: string; // 给人看的失败文案
  code?: string; // 空串不落
  attribution?: unknown; // 投影归因
  turnResult?: string; // 取消标记
}

function readUsage(usage: RuntimeModelTextResult["usage"], field: string): unknown {
  const loose = usage as unknown as Record<string, unknown>;
  return loose[field];
}

function overlay(
  base: object,
  extras: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  // m02
  const merged: Record<string, unknown> = { ...base };
  for (const pair of extras) merged[pair[0]] = pair[1];
  return merged; // m02
}

export function logTurnModelDiagnostics(
  // m02
  runtime: AgentRuntimeInternal, // m02
  modelTraceContext: TraceContext, // m02
  result: RuntimeModelTextResult, // m02
  usage: RuntimeModelTextResult["usage"], // m02
  rawFinishReason: string | undefined, // m02
  responseLength: number, // m02
  toolCalls: ListedCalls,
): void {
  // m02
  const label = phrase(["Model response ", "diagnostics"]);
  const traced = traceContextToLogContext(modelTraceContext);
  report(
    // m02
    runtime, // m02
    "info", // m02
    label, // m02
    overlay(traced, [
      ["event", DIAGNOSTICS_EVENT],
      ["finishReason", result.finishReason],
      ["module", MODULE_NAME],
      ["providerMetadataKeys", objectKeys(result.providerMetadata)],
      ["rawFinishReason", rawFinishReason],
      ["responseEmpty", responseLength === 0],
      ["responseLength", responseLength],
      ["status", COMPLETED_STATUS],
      ["toolCallCount", toolCalls.length],
      ["usageCacheReadTokens", readUsage(usage, "cacheReadTokens")],
      ["usageCacheWriteTokens", readUsage(usage, "cacheWriteTokens")],
      ["usageInputTokens", readUsage(usage, "inputTokens")],
      ["usageOutputTokens", readUsage(usage, "outputTokens")],
      ["usageReasoningTokens", readUsage(usage, "reasoningTokens")],
      ["usageTotalTokens", readUsage(usage, "totalTokens")],
    ]),
  );
}

export function logTurnModelSuspiciousEmpty(
  // m02
  runtime: AgentRuntimeInternal, // m02
  modelTraceContext: TraceContext, // m02
  result: RuntimeModelTextResult, // m02
  usage: RuntimeModelTextResult["usage"], // m02
  rawFinishReason: string | undefined, // m02
  responseLength: number, // m02
  toolCalls: ListedCalls,
): void {
  // m02
  const label = phrase(["Model returned an empty ", "non-stop result"]);
  const traced = traceContextToLogContext(modelTraceContext);
  report(
    // m02
    runtime, // m02
    "warn", // m02
    label, // m02
    overlay(traced, [
      ["event", SUSPICIOUS_EVENT],
      ["finishReason", result.finishReason],
      ["module", MODULE_NAME],
      ["rawFinishReason", rawFinishReason],
      ["responseLength", responseLength],
      ["status", COMPLETED_STATUS],
      ["toolCallCount", toolCalls.length],
      ["usageTotalTokens", readUsage(usage, "totalTokens")],
    ]),
  );
}

function codeOf(error: unknown): string | undefined {
  const bag = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  return typeof bag?.code === "string" ? bag.code : undefined;
}

export function prepareFailureFacts(error: unknown, state: RegularTurnLoopState): FailureFacts {
  const code = codeOf(error);
  const projection = projectExecutionErrorPayload(error); // m02
  const turnResult = isTurnCancellationError(error, state.turnAbortSignal) // m02
    ? CANCELLED_RESULT
    : undefined; // m02
  return assignKeys<FailureFacts>([
    ["code", code],
    ["projection", projection],
    ["turnResult", turnResult],
  ]);
}

export function persistedFailure(error: unknown, facts: FailureFacts) {
  const named = error instanceof Error;
  const data = assignKeys<FailureData>([["message", named ? error.message : String(error)]]);
  putIf(data, "code", facts.code, Boolean(facts.code));
  putIf(data, "attribution", facts.projection.attribution, Boolean(facts.projection.attribution));
  putIf(data, "turnResult", facts.turnResult, Boolean(facts.turnResult));
  const name = named ? error.name : UNKNOWN_ERROR_NAME;
  return assignKeys<{ name: string; data: FailureData }>([
    ["name", name],
    ["data", data],
  ]);
}

function modelRefOf(active: Model | undefined): Pick<Model, "providerId" | "modelId"> | undefined {
  if (!active) return undefined as Pick<Model, "providerId" | "modelId"> | undefined;
  return assignKeys<Pick<Model, "providerId" | "modelId">>([
    ["providerId", active.providerId],
    ["modelId", active.modelId],
  ]);
}

export function commitCancelledAssistantSnapshot(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  snapshot: RuntimeModelStreamSnapshot, // m02
): void {
  // m02
  const keptReasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
  const textPresent = snapshot.text.length > 0;
  if (textPresent || keptReasoning.length > 0) {
    const entry = createRuntimeAssistantEntry(
      // m02
      snapshot.text, // m02
      undefined, // m02
      keptReasoning,
      modelRefOf(state.model),
    );
    commitTurnRequestEntries(runtime, state.turnRequestState, [entry]); // m02
    recordModelHistoryRound(state); // m02
  }
}
