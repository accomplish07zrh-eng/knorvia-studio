// SPDX-License-Identifier: Apache-2.0
// 模型步的请求、分部和收尾字段。若干载荷的键插入顺序是观察面，用键表写入。
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import {
  CoreErrorType,
  createChildTraceContext,
  createCoreError,
  createPartId,
  traceContextToLogContext,
  type MessageId,
  type Model,
  type ModelToolCall,
  type ModelToolContract,
  type TraceContext,
} from "../../deps.js";
import { projectExecutionErrorPayload } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type {
  DrainedPendingInputDiagnostics,
  RunModelTextRequestOptions,
  RuntimeModelTextResult,
} from "../../types.js";
import { resolveModelStepMaxOutputTokens } from "../model-token-limits.js";
import { estimateCurrentModelInputTokens } from "./m02-compact.js";
import { OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE } from "./m02-continuation.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";
import { assignKeys, phrase, putIf, report } from "./m02-record.js";

export interface ModelStepInputs {
  // m02
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics; // m02
  latestRealUserMessageIndex?: number; // m02
  messages: RunModelTextRequestOptions["messages"]; // m02
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[]; // m02
  recordedMessages: RunModelTextRequestOptions["messages"]; // m02
  requestEntries: readonly RuntimeMessageEntry[]; // m02
  tools: ModelToolContract[]; // m02
}

type StreamSink = {
  recordReasoningDelta: (text: string) => void;
  recordTextDelta: (text: string) => void;
  accept: (toolCall: ModelToolCall) => void;
};

type RequestFields = {
  assistantMessageId: MessageId; // m02
  model: Model; // m02
  modelTraceContext: TraceContext; // m02
  normalBudget: number; // m02
  contextWindow: number | undefined; // m02
  streamRecovery: RunModelTextRequestOptions["streamRecovery"]; // m02
  coordinator: StreamSink;
  onStreamSnapshot: NonNullable<RunModelTextRequestOptions["onStreamSnapshot"]>; // m02
  onModelNetworkStatus: NonNullable<RunModelTextRequestOptions["onModelNetworkStatus"]>; // m02
};

export interface UsageFields {
  // m02
  assistantMessageId: MessageId; // m02
  model: Model; // m02
  modelTraceContext: TraceContext; // m02
  networkEventStartIndex: number; // m02
  startedAt: number; // m02
}

const REQUEST_ORDER = [
  "abortSignal",
  "assistantMessageId", // m02
  "events",
  "maxOutputTokens",
  "latestRealUserMessageIndex",
  "messages", // m02
  "sourceEntries",
  "model", // m02
  "onStreamSnapshot",
  "onModelNetworkStatus",
  "onStreamReasoningDelta",
  "onStreamTextDelta",
  "onStreamToolCall",
  "streamRecovery",
  "tools", // m02
  "traceContext",
] as const; // m02

type RequestKey = (typeof REQUEST_ORDER)[number];

function iterationOf(toolCallCount: number): number {
  const bucket = 10;
  if (toolCallCount === 0) return 0;
  return Math.ceil(toolCallCount / bucket);
}

function stepBudget(
  runtime: AgentRuntimeInternal, // m02
  options: ModelStepInputs, // m02
  fields: RequestFields, // m02
): number {
  // m02
  const estimated = estimateCurrentModelInputTokens(options.messages, options.sourceEntries);
  const spec = assignKeys<Parameters<typeof resolveModelStepMaxOutputTokens>[0]>([
    ["baselineMaxOutputTokens", fields.normalBudget],
    ["contextWindow", fields.contextWindow],
    ["estimatedCurrentUsage", estimated],
    ["modelContextBudgetStrategy", runtime.config.modelContextBudgetStrategy],
  ]);
  return resolveModelStepMaxOutputTokens(spec);
}

export function buildTurnModelRequest(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  options: ModelStepInputs, // m02
  fields: RequestFields, // m02
): RunModelTextRequestOptions {
  // m02
  const budget = stepBudget(runtime, options, fields);
  const sink = fields.coordinator;
  const slots = new Map<RequestKey, unknown>();
  slots.set("traceContext", fields.modelTraceContext);
  slots.set("tools", options.tools);
  slots.set("streamRecovery", fields.streamRecovery);
  slots.set("onStreamToolCall", (toolCall: ModelToolCall) => sink.accept(toolCall));
  slots.set("onStreamTextDelta", (text: string) => sink.recordTextDelta(text));
  slots.set("onStreamReasoningDelta", (text: string) => sink.recordReasoningDelta(text));
  slots.set("onModelNetworkStatus", fields.onModelNetworkStatus);
  slots.set("onStreamSnapshot", fields.onStreamSnapshot);
  slots.set("model", fields.model);
  slots.set("sourceEntries", options.sourceEntries);
  slots.set("messages", options.messages);
  slots.set("latestRealUserMessageIndex", options.latestRealUserMessageIndex);
  slots.set("maxOutputTokens", budget);
  slots.set("events", state.events);
  slots.set("assistantMessageId", fields.assistantMessageId);
  slots.set("abortSignal", state.turnAbortSignal);
  const pairs = REQUEST_ORDER.map((key) => [key, slots.get(key)] as const);
  return assignKeys<RunModelTextRequestOptions>(pairs);
}

type PartId = ReturnType<typeof createPartId>;
type SessionOf = AgentRuntimeInternal["sessionId"];

function basePart<Kind extends "step-start" | "reasoning" | "text">(
  runtime: AgentRuntimeInternal, // m02
  messageID: MessageId, // m02
  kind: Kind,
) {
  // m02
  return assignKeys<{ id: PartId; sessionID: SessionOf; messageID: MessageId; type: Kind }>([
    ["id", createPartId()],
    ["sessionID", runtime.sessionId],
    ["messageID", messageID],
    ["type", kind],
  ]);
}

function clock(start: number): { start: number; end: number } {
  const end = Date.now();
  return assignKeys<{ start: number; end: number }>([
    ["start", start],
    ["end", end],
  ]);
}

export function stepStartPart(runtime: AgentRuntimeInternal, assistantMessageId: MessageId) {
  // m02
  return basePart(runtime, assistantMessageId, "step-start");
}

export function reasoningPart(
  // m02
  runtime: AgentRuntimeInternal, // m02
  assistantMessageId: MessageId, // m02
  startedAt: number, // m02
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number], // m02
) {
  // m02
  const opened = basePart(runtime, assistantMessageId, "reasoning");
  return assignKeys<{
    id: PartId; // m02
    sessionID: SessionOf;
    messageID: MessageId; // m02
    type: "reasoning"; // m02
    text: string; // m02
    metadata: typeof reasoning.providerOptions;
    time: { start: number; end: number };
  }>([
    ["id", opened.id],
    ["sessionID", opened.sessionID],
    ["messageID", opened.messageID],
    ["type", "reasoning"],
    ["text", reasoning.text],
    ["metadata", reasoning.providerOptions],
    ["time", clock(startedAt)],
  ]);
}

export function textPart(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  assistantMessageId: MessageId, // m02
  startedAt: number, // m02
) {
  // m02
  const opened = basePart(runtime, assistantMessageId, "text");
  return assignKeys<{
    id: PartId; // m02
    sessionID: SessionOf;
    messageID: MessageId; // m02
    type: "text"; // m02
    text: string; // m02
    time: { start: number; end: number };
  }>([
    ["id", opened.id],
    ["sessionID", opened.sessionID],
    ["messageID", opened.messageID],
    ["type", "text"],
    ["text", state.modelResponse],
    ["time", clock(startedAt)],
  ]);
}

export function modelCompletePayload(
  // m02
  state: RegularTurnLoopState, // m02
  result: RuntimeModelTextResult, // m02
  querySource: string, // m02
  contextWindow: number | undefined, // m02
  cacheHit: unknown, // m02
  fileChanges: unknown, // m02
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>, // m02
) {
  // m02
  const mainTurn = querySource === "main_turn";
  const payload = assignKeys<Record<string, unknown>>([["content", state.modelResponse]]);
  putIf(payload, "contextWindow", contextWindow, mainTurn && contextWindow !== undefined);
  payload.querySource = querySource;
  payload.stopReason = result.finishReason;
  payload.usage = result.usage;
  putIf(payload, "cacheHit", cacheHit, Boolean(cacheHit));
  putIf(payload, "fileChanges", fileChanges, Boolean(fileChanges));
  const breakdown = result.contextUsageBreakdown;
  putIf(payload, "contextUsageBreakdown", breakdown, mainTurn && Boolean(breakdown));
  payload.toolCallCount = toolCalls.length;
  return payload; // m02
}

function traced(
  trace: TraceContext, // m02
  extras: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  // m02
  const pairs: Array<readonly [string, unknown]> = [];
  const flat = traceContextToLogContext(trace) as Record<string, unknown>;
  for (const key of Object.keys(flat)) pairs.push([key, flat[key]]);
  for (const extra of extras) pairs.push(extra);
  return assignKeys<Record<string, unknown>>(pairs);
}

const RUNTIME_MODULE = phrase(["core.", "runtime"]);

export function logModelCompletion(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  modelTraceContext: TraceContext, // m02
  startedAt: number, // m02
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>, // m02
): void {
  // m02
  const elapsed = Date.now() - startedAt;
  const fields = traced(modelTraceContext, [
    ["durationMs", elapsed],
    ["event", phrase(["model.", "request.completed"])],
    ["module", RUNTIME_MODULE],
    ["status", "completed"],
    ["totalTokens", state.tokenCount],
    ["toolCallCount", toolCalls.length],
  ]);
  report(runtime, "info", phrase(["Model request", " completed"]), fields);
}

export function logStartPlanRetry(
  // m02
  runtime: AgentRuntimeInternal, // m02
  modelTraceContext: TraceContext, // m02
  retryDelayMs: number, // m02
  attempt: { retryNumber: number; maxRetries: number },
): void {
  // m02
  const fields = traced(modelTraceContext, [
    ["event", phrase(["model.main_turn.retry_", "start_plan_admission_busy"])],
    ["module", RUNTIME_MODULE],
    ["retryDelayMs", retryDelayMs],
    ["retryNumber", attempt.retryNumber],
    ["maxRetries", attempt.maxRetries],
    ["status", "waiting"],
  ]);
  report(
    // m02
    runtime, // m02
    "warn", // m02
    phrase(["Main turn retrying after Start Plan ", "admission busy"]),
    fields,
  );
}

const LIMIT_CODE = phrase(["model_output_limit", "_exceeded"]);

export function outputLimitCarrier(
  // m02
  exhausted: ReturnType<typeof createCoreError>, // m02
  projected: ReturnType<typeof projectExecutionErrorPayload>, // m02
  result: RuntimeModelTextResult, // m02
  model: Model, // m02
  modelTraceContext: TraceContext, // m02
) {
  // m02
  const data = assignKeys<Record<string, unknown>>([
    ["message", projected.message],
    ["retryable", exhausted.recoverable],
  ]);
  putIf(data, "code", projected.code, Boolean(projected.code));
  putIf(data, "attribution", projected.attribution, Boolean(projected.attribution));
  const error = assignKeys<{ name: string; data: Record<string, unknown> }>([
    ["name", projected.code ?? exhausted.type],
    ["data", data],
  ]);
  return assignKeys<{
    error: typeof error;
    finishReason: string; // m02
    model: Model; // m02
    modelTraceContext: TraceContext; // m02
  }>([
    ["error", error],
    ["finishReason", result.finishReason],
    ["model", model],
    ["modelTraceContext", modelTraceContext],
  ]);
}

const HAN_LIMIT = phrase([
  "定时任务已达到 20 个上限，本次未创建。请前往",
  "“自动化”手动删除一个已有任务后重试。",
]);
const EN_LIMIT = phrase([
  "The limit of 20 scheduled tasks has been reached, so no task was created. Manually ",
  "delete an existing task on the Automations page, then try again.",
]);

export function automationLimitResponse(input: string): string {
  // m02
  return /\p{Script=Han}/u.test(input) ? HAN_LIMIT : EN_LIMIT;
}

export function modelStepTrace(state: RegularTurnLoopState, model: Model, querySource: string) {
  // m02
  const attributes = assignKeys<Record<string, string | number | boolean>>([
    ["providerId", String(model.providerId)],
    ["modelId", String(model.modelId)],
    ["iteration", iterationOf(state.toolCallCount)],
    ["querySource", querySource],
  ]);
  return createChildTraceContext(state.turnTraceContext, { attributes });
}

type SteeringBag = {
  activeTurn?: RegularTurnLoopState["activeTurn"];
  drained?: ModelStepInputs["drainedSteerForNextRequest"];
  messages: ModelStepInputs["messages"];
  modelStepCount: number; // m02
  traceContext: TraceContext; // m02
};

export function steeringFields(
  // m02
  state: RegularTurnLoopState, // m02
  options: ModelStepInputs, // m02
  traceContext: TraceContext, // m02
): SteeringBag {
  return assignKeys<SteeringBag>([
    ["activeTurn", state.activeTurn],
    ["drained", options.drainedSteerForNextRequest],
    ["messages", options.messages],
    ["modelStepCount", state.modelStepCount],
    ["traceContext", traceContext],
  ]);
}

export function modelRequestPayload(
  // m02
  state: RegularTurnLoopState, // m02
  options: ModelStepInputs, // m02
  model: Model, // m02
  querySource: string, // m02
) {
  // m02
  return assignKeys<{
    messages: ModelStepInputs["recordedMessages"];
    providerId: string; // m02
    modelId: string; // m02
    querySource: string; // m02
    toolCount: number; // m02
    iteration: number; // m02
  }>([
    ["messages", options.recordedMessages],
    ["providerId", String(model.providerId)],
    ["modelId", String(model.modelId)],
    ["querySource", querySource],
    ["toolCount", options.tools.length],
    ["iteration", iterationOf(state.toolCallCount)],
  ]);
}

export function outputLimitError() {
  // m02
  const context = assignKeys<Record<string, unknown>>([
    ["providerCode", LIMIT_CODE],
    ["reason", LIMIT_CODE],
    ["source", "provider"],
  ]);
  const options = assignKeys<{ context: Record<string, unknown>; recoverable: boolean }>([
    ["context", context],
    ["recoverable", true],
  ]);
  return createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, options);
}

type UsageFailure = {
  assistantMessageId: MessageId; // m02
  error: unknown; // m02
  model: Model; // m02
  modelTraceContext: TraceContext; // m02
  networkEventStartIndex: number; // m02
  startedAt: number; // m02
  status: "cancelled" | "error";
};

export function failedUsage(
  state: RegularTurnLoopState, // m02
  fields: UsageFields, // m02
  error: unknown, // m02
): UsageFailure {
  const status: "cancelled" | "error" = state.turnAbortSignal.aborted ? "cancelled" : "error";
  return assignKeys<UsageFailure>([
    ["assistantMessageId", fields.assistantMessageId],
    ["error", error],
    ["model", fields.model],
    ["modelTraceContext", fields.modelTraceContext],
    ["networkEventStartIndex", fields.networkEventStartIndex],
    ["startedAt", fields.startedAt],
    ["status", status],
  ]);
}

type UsageSuccess = {
  assistantMessageId: MessageId; // m02
  model: Model; // m02
  modelTraceContext: TraceContext; // m02
  networkEventStartIndex: number; // m02
  result: RuntimeModelTextResult; // m02
  startedAt: number; // m02
  status: "completed"; // m02
  toolCallCount: number; // m02
};

export function completedUsage(
  // m02
  fields: UsageFields, // m02
  result: RuntimeModelTextResult, // m02
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>, // m02
): UsageSuccess {
  return assignKeys<UsageSuccess>([
    ["assistantMessageId", fields.assistantMessageId],
    ["model", fields.model],
    ["modelTraceContext", fields.modelTraceContext],
    ["networkEventStartIndex", fields.networkEventStartIndex],
    ["result", result],
    ["startedAt", fields.startedAt],
    ["status", "completed"],
    ["toolCallCount", toolCalls.length],
  ]);
}

type SuspiciousBag = {
  finishReason: string | undefined; // m02
  model: { modelId: string; providerId: string }; // m02
  providerMetadata: Record<string, unknown> | undefined; // m02
  rawFinishReason: string | undefined; // m02
};

export function suspiciousResultFields(
  // m02
  result: RuntimeModelTextResult, // m02
  model: { providerId: string; modelId: string }, // m02
  rawFinishReason: string | undefined, // m02
): SuspiciousBag {
  return assignKeys<SuspiciousBag>([
    ["finishReason", result.finishReason],
    ["model", model],
    ["providerMetadata", result.providerMetadata],
    ["rawFinishReason", rawFinishReason],
  ]);
}

export function warnAutomationTools(
  // m02
  runtime: AgentRuntimeInternal, // m02
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>, // m02
): void {
  // m02
  const fields = assignKeys<Record<string, unknown>>([
    ["event", phrase(["automation.create_limit.tool_", "calls_ignored"])],
    ["module", RUNTIME_MODULE],
    ["status", "completed"],
    ["toolCallCount", toolCalls.length],
  ]);
  report(
    // m02
    runtime, // m02
    "warn", // m02
    phrase(["Ignored tool calls after automation ", "create limit was reached"]),
    fields,
  );
}

type Anchor = {
  latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"]; // m02
  latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"]; // m02
  latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"]; // m02
};

export function stopFields(
  // m02
  anchor: Anchor,
  assistantCreatedAt: number, // m02
  assistantMessageId: MessageId, // m02
  modelTraceContext: TraceContext, // m02
  result: RuntimeModelTextResult, // m02
) {
  // m02
  return assignKeys<{
    assistantPersistenceAnchor: Anchor;
    assistantCreatedAt: number; // m02
    assistantMessageId: MessageId; // m02
    modelTraceContext: TraceContext; // m02
    result: RuntimeModelTextResult; // m02
  }>([
    ["assistantPersistenceAnchor", anchor],
    ["assistantCreatedAt", assistantCreatedAt],
    ["assistantMessageId", assistantMessageId],
    ["modelTraceContext", modelTraceContext],
    ["result", result],
  ]);
}

export function completedAssistantFields(
  // m02
  anchor: Anchor,
  assistantCreatedAt: number, // m02
  assistantMessageId: MessageId, // m02
  modelTraceContext: TraceContext, // m02
  result: RuntimeModelTextResult, // m02
) {
  // m02
  return assignKeys<{
    assistantPersistenceAnchor: Anchor;
    assistantCreatedAt: number; // m02
    assistantMessageId: MessageId; // m02
    includeEmptyAssistant: false;
    modelTraceContext: TraceContext; // m02
    result: RuntimeModelTextResult; // m02
  }>([
    ["assistantPersistenceAnchor", anchor],
    ["assistantCreatedAt", assistantCreatedAt],
    ["assistantMessageId", assistantMessageId],
    ["includeEmptyAssistant", false],
    ["modelTraceContext", modelTraceContext],
    ["result", result],
  ]);
}

type RecoveryBag = {
  assistantMessageId: MessageId; // m02
  failedRequestId?: string; // m02
  traceContext: TraceContext; // m02
};

export function recoveryFields(
  // m02
  assistantMessageId: MessageId, // m02
  failedRequestId: string | undefined, // m02
  traceContext: TraceContext, // m02
): RecoveryBag {
  const fields = assignKeys<RecoveryBag>([["assistantMessageId", assistantMessageId]]);
  putIf(fields, "failedRequestId", failedRequestId, failedRequestId !== undefined);
  fields.traceContext = traceContext;
  return fields; // m02
}
