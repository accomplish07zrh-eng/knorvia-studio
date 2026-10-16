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
import { assignKeys, putIf, report, type Col, type Opt } from "./m02-record.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";
import { commitTurnRequestEntries, hasAssistantReasoningContent } from "./m02-continuation.js";

type ListedCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>;

type ErrorProjection = ReturnType<typeof projectExecutionErrorPayload>;

type FailureFacts = Col<"code", string | undefined> &
  Col<"projection", ErrorProjection> &
  Col<"turnResult", string | undefined>;

type FailureData = Col<"message", string> &
  Opt<"code", string> &
  Opt<"attribution", unknown> &
  Opt<"turnResult", string>;

function readUsage(usage: RuntimeModelTextResult["usage"], field: string): unknown {
  return (usage as unknown as Record<string, unknown>)[field];
}

function overlay(
  base: object,
  extras: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of extras) merged[key] = value;
  return merged;
}

const DIAGNOSTIC_ROWS = [
  "usageCacheReadTokens",
  "usageCacheWriteTokens",
  "usageInputTokens",
  "usageOutputTokens",
  "usageReasoningTokens",
  "usageTotalTokens",
] as const;

const USAGE_SOURCE: Record<(typeof DIAGNOSTIC_ROWS)[number], string> = {
  usageCacheReadTokens: "cacheReadTokens",
  usageCacheWriteTokens: "cacheWriteTokens",
  usageInputTokens: "inputTokens",
  usageOutputTokens: "outputTokens",
  usageReasoningTokens: "reasoningTokens",
  usageTotalTokens: "totalTokens",
};

function usageRows(
  usage: RuntimeModelTextResult["usage"],
): ReadonlyArray<readonly [string, unknown]> {
  return DIAGNOSTIC_ROWS.map((label) => [label, readUsage(usage, USAGE_SOURCE[label])] as const);
}

export function logTurnModelDiagnostics(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawReason: string | undefined,
  responseLength: number,
  calls: ListedCalls,
): void {
  const traced = traceContextToLogContext(trace);
  report(
    host,
    "info",
    "Model response diagnostics",
    overlay(traced, [
      ["event", "model.response.diagnostics"],
      ["finishReason", modelResult.finishReason],
      ["module", "core.runtime"],
      ["providerMetadataKeys", objectKeys(modelResult.providerMetadata)],
      ["rawFinishReason", rawReason],
      ["responseEmpty", responseLength === 0],
      ["responseLength", responseLength],
      ["status", "completed"],
      ["toolCallCount", calls.length],
      ...usageRows(usage),
    ]),
  );
}

export function logTurnModelSuspiciousEmpty(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
  usage: RuntimeModelTextResult["usage"],
  rawReason: string | undefined,
  responseLength: number,
  calls: ListedCalls,
): void {
  const traced = traceContextToLogContext(trace);
  report(
    host,
    "warn",
    "Model returned an empty non-stop result",
    overlay(traced, [
      ["event", "model.response.suspicious_empty"],
      ["finishReason", modelResult.finishReason],
      ["module", "core.runtime"],
      ["rawFinishReason", rawReason],
      ["responseLength", responseLength],
      ["status", "completed"],
      ["toolCallCount", calls.length],
      ["usageTotalTokens", readUsage(usage, "totalTokens")],
    ]),
  );
}

function codeOf(problem: unknown): string | undefined {
  if (problem === null || typeof problem !== "object") return undefined;
  const bag = problem as Record<string, unknown>;
  return typeof bag.code === "string" ? bag.code : undefined;
}

export function prepareFailureFacts(problem: unknown, loop: RegularTurnLoopState): FailureFacts {
  const code = codeOf(problem);
  const projection = projectExecutionErrorPayload(problem);
  const cancelled = isTurnCancellationError(problem, loop.turnAbortSignal);
  const turnResult = cancelled ? "cancelled" : undefined;
  return assignKeys<FailureFacts>([
    ["code", code],
    ["projection", projection],
    ["turnResult", turnResult],
  ]);
}

export function persistedFailure(problem: unknown, facts: FailureFacts) {
  const named = problem instanceof Error;
  const data = assignKeys<FailureData>([["message", named ? problem.message : String(problem)]]);
  putIf(data, "code", facts.code, Boolean(facts.code));
  putIf(data, "attribution", facts.projection.attribution, Boolean(facts.projection.attribution));
  putIf(data, "turnResult", facts.turnResult, Boolean(facts.turnResult));
  return assignKeys<{ name: string; data: FailureData }>([
    ["name", named ? problem.name : "UnknownError"],
    ["data", data],
  ]);
}

function modelRefOf(active: Model | undefined): Pick<Model, "providerId" | "modelId"> | undefined {
  if (!active) return undefined;
  return assignKeys<Pick<Model, "providerId" | "modelId">>([
    ["providerId", active.providerId],
    ["modelId", active.modelId],
  ]);
}

export function commitCancelledAssistantSnapshot(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  snapshot: RuntimeModelStreamSnapshot,
): void {
  const keptReasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
  const worthKeeping = snapshot.text.length > 0 || keptReasoning.length > 0;
  if (!worthKeeping) return;
  const entry = createRuntimeAssistantEntry(
    snapshot.text,
    undefined,
    keptReasoning,
    modelRefOf(loop.model),
  );
  commitTurnRequestEntries(host, loop.turnRequestState, [entry]);
  recordModelHistoryRound(loop);
}
