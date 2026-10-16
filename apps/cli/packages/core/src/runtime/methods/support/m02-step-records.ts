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
import { layer, report, type Col, type Opt } from "./m02-record.js";
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

type UsageSnapshot = RuntimeModelTextResult["usage"];

/** 两条模型响应日志共用的观测，各自再声明事件名和要不要元数据。 */
type ResponseView = {
  finishReason: RuntimeModelTextResult["finishReason"];
  providerMetadataKeys: ReturnType<typeof objectKeys>;
  rawFinishReason: string | undefined;
  responseLength: number;
  toolCallCount: number;
  usage: UsageSnapshot;
};

const RUNTIME_MODULE = "core.runtime";
const COMPLETED = "completed";

const DIAGNOSTIC_ROWS = [
  "usageCacheReadTokens",
  "usageCacheWriteTokens",
  "usageInputTokens",
  "usageOutputTokens",
  "usageReasoningTokens",
  "usageTotalTokens",
] as const;

const USAGE_SOURCE: Record<(typeof DIAGNOSTIC_ROWS)[number], keyof UsageSnapshot> = {
  usageCacheReadTokens: "cacheReadTokens",
  usageCacheWriteTokens: "cacheWriteTokens",
  usageInputTokens: "inputTokens",
  usageOutputTokens: "outputTokens",
  usageReasoningTokens: "reasoningTokens",
  usageTotalTokens: "totalTokens",
};

const RESPONSE_NOTICES = {
  diagnostics: {
    level: "info" as const,
    message: "Model response diagnostics",
    event: "model.response.diagnostics",
    metadata: true,
    emptyFlag: true,
    usage: "full" as const,
  },
  suspicious: {
    level: "warn" as const,
    message: "Model returned an empty non-stop result",
    event: "model.response.suspicious_empty",
    metadata: false,
    emptyFlag: false,
    usage: "total" as const,
  },
};

function readUsage(usage: UsageSnapshot, field: keyof UsageSnapshot): unknown {
  return usage[field];
}

function usageProjection(usage: UsageSnapshot, mode: "full" | "total"): Record<string, unknown> {
  if (mode === "total") return { usageTotalTokens: readUsage(usage, "totalTokens") };
  const rows: Record<string, unknown> = {};
  for (const label of DIAGNOSTIC_ROWS) rows[label] = readUsage(usage, USAGE_SOURCE[label]);
  return rows;
}

function responseView(
  modelResult: RuntimeModelTextResult,
  usage: UsageSnapshot,
  rawFinishReason: string | undefined,
  responseLength: number,
  calls: ListedCalls,
): ResponseView {
  return {
    finishReason: modelResult.finishReason,
    providerMetadataKeys: objectKeys(modelResult.providerMetadata),
    rawFinishReason,
    responseLength,
    toolCallCount: calls.length,
    usage,
  };
}

function responseDetail(
  notice: (typeof RESPONSE_NOTICES)[keyof typeof RESPONSE_NOTICES],
  view: ResponseView,
) {
  const { event } = notice;
  const { finishReason, providerMetadataKeys, rawFinishReason, responseLength, toolCallCount } =
    view;
  const module = RUNTIME_MODULE;
  const status = COMPLETED;
  const head = { event, finishReason, module };
  const metadata = notice.metadata ? { providerMetadataKeys } : undefined;
  const responseEmpty = responseLength === 0;
  const body = notice.emptyFlag
    ? { rawFinishReason, responseEmpty, responseLength, status, toolCallCount }
    : { rawFinishReason, responseLength, status, toolCallCount };
  return layer(head, metadata, body, usageProjection(view.usage, notice.usage));
}

function emitResponse(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  notice: (typeof RESPONSE_NOTICES)[keyof typeof RESPONSE_NOTICES],
  view: ResponseView,
): void {
  report(
    host,
    notice.level,
    notice.message,
    layer(traceContextToLogContext(trace), responseDetail(notice, view)),
  );
}

export function logTurnModelDiagnostics(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
  usage: UsageSnapshot,
  rawReason: string | undefined,
  responseLength: number,
  calls: ListedCalls,
): void {
  emitResponse(
    host,
    trace,
    RESPONSE_NOTICES.diagnostics,
    responseView(modelResult, usage, rawReason, responseLength, calls),
  );
}

export function logTurnModelSuspiciousEmpty(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
  usage: UsageSnapshot,
  rawReason: string | undefined,
  responseLength: number,
  calls: ListedCalls,
): void {
  emitResponse(
    host,
    trace,
    RESPONSE_NOTICES.suspicious,
    responseView(modelResult, usage, rawReason, responseLength, calls),
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
  const turnResult = isTurnCancellationError(problem, loop.turnAbortSignal)
    ? "cancelled"
    : undefined;
  return { code, projection, turnResult };
}

export function persistedFailure(problem: unknown, facts: FailureFacts) {
  const named = problem instanceof Error ? problem : undefined;
  const message = named ? named.message : String(problem);
  const name = named ? named.name : "UnknownError";
  const data = layer<FailureData>(
    { message },
    facts.code ? { code: facts.code } : undefined,
    facts.projection.attribution ? { attribution: facts.projection.attribution } : undefined,
    facts.turnResult ? { turnResult: facts.turnResult } : undefined,
  );
  return { name, data };
}

function modelRefOf(active: Model | undefined): Pick<Model, "providerId" | "modelId"> | undefined {
  if (!active) return undefined;
  const { providerId, modelId } = active;
  return { providerId, modelId };
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
