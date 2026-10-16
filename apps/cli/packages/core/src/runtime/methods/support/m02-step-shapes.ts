// SPDX-License-Identifier: Apache-2.0
// 模型步的请求、分部和收尾字段。观察面会读 Object.keys，所以载荷按键表写入，不靠字面量排键。
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
import { assignKeys, putIf, report, type Col, type Opt } from "./m02-record.js";

export type ModelStepInputs = Opt<"drainedSteerForNextRequest", DrainedPendingInputDiagnostics> &
  Opt<"latestRealUserMessageIndex", number> &
  Col<"messages", RunModelTextRequestOptions["messages"]> &
  Col<"sourceEntries", readonly (RuntimeMessageEntry | undefined)[]> &
  Col<"recordedMessages", RunModelTextRequestOptions["messages"]> &
  Col<"requestEntries", readonly RuntimeMessageEntry[]> &
  Col<"tools", ModelToolContract[]>;

type StreamSink = {
  recordReasoningDelta: (text: string) => void;
  recordTextDelta: (text: string) => void;
  accept: (toolCall: ModelToolCall) => void;
};

type RequestFields = Col<"assistantMessageId", MessageId> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext> &
  Col<"normalBudget", number> &
  Col<"contextWindow", number | undefined> &
  Col<"streamRecovery", RunModelTextRequestOptions["streamRecovery"]> &
  Col<"coordinator", StreamSink> &
  Col<"onStreamSnapshot", NonNullable<RunModelTextRequestOptions["onStreamSnapshot"]>> &
  Col<"onModelNetworkStatus", NonNullable<RunModelTextRequestOptions["onModelNetworkStatus"]>>;

export type UsageFields = Col<"assistantMessageId", MessageId> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext> &
  Col<"networkEventStartIndex", number> &
  Col<"startedAt", number>;

/** provider 请求的键插入顺序。先散装进表，再按这张顺序取出。 */
const REQUEST_ORDER = [
  "abortSignal",
  "assistantMessageId",
  "events",
  "maxOutputTokens",
  "latestRealUserMessageIndex",
  "messages",
  "sourceEntries",
  "model",
  "onStreamSnapshot",
  "onModelNetworkStatus",
  "onStreamReasoningDelta",
  "onStreamTextDelta",
  "onStreamToolCall",
  "streamRecovery",
  "tools",
  "traceContext",
] as const;

type RequestKey = (typeof REQUEST_ORDER)[number];

function iterationOf(toolCallCount: number): number {
  if (toolCallCount === 0) return 0;
  return Math.ceil(toolCallCount / 10);
}

function stepBudget(
  host: AgentRuntimeInternal,
  step: ModelStepInputs,
  prepared: RequestFields,
): number {
  const estimated = estimateCurrentModelInputTokens(step.messages, step.sourceEntries);
  const spec = assignKeys<Parameters<typeof resolveModelStepMaxOutputTokens>[0]>([
    ["baselineMaxOutputTokens", prepared.normalBudget],
    ["contextWindow", prepared.contextWindow],
    ["estimatedCurrentUsage", estimated],
    ["modelContextBudgetStrategy", host.config.modelContextBudgetStrategy],
  ]);
  return resolveModelStepMaxOutputTokens(spec);
}

export function buildTurnModelRequest(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  step: ModelStepInputs,
  prepared: RequestFields,
): RunModelTextRequestOptions {
  const budget = stepBudget(host, step, prepared);
  const sink = prepared.coordinator;
  const slots = new Map<RequestKey, unknown>();
  slots.set("traceContext", prepared.modelTraceContext);
  slots.set("tools", step.tools);
  slots.set("streamRecovery", prepared.streamRecovery);
  slots.set("onStreamToolCall", (toolCall: ModelToolCall) => sink.accept(toolCall));
  slots.set("onStreamTextDelta", (text: string) => sink.recordTextDelta(text));
  slots.set("onStreamReasoningDelta", (text: string) => sink.recordReasoningDelta(text));
  slots.set("onModelNetworkStatus", prepared.onModelNetworkStatus);
  slots.set("onStreamSnapshot", prepared.onStreamSnapshot);
  slots.set("model", prepared.model);
  slots.set("sourceEntries", step.sourceEntries);
  slots.set("messages", step.messages);
  slots.set("latestRealUserMessageIndex", step.latestRealUserMessageIndex);
  slots.set("maxOutputTokens", budget);
  slots.set("events", loop.events);
  slots.set("assistantMessageId", prepared.assistantMessageId);
  slots.set("abortSignal", loop.turnAbortSignal);
  const pairs = REQUEST_ORDER.map((key) => [key, slots.get(key)] as const);
  return assignKeys<RunModelTextRequestOptions>(pairs);
}

type PartId = ReturnType<typeof createPartId>;
type SessionOf = AgentRuntimeInternal["sessionId"];
type PartShell<Kind extends string> = Col<"id", PartId> &
  Col<"sessionID", SessionOf> &
  Col<"messageID", MessageId> &
  Col<"type", Kind>;

function basePart<Kind extends "step-start" | "reasoning" | "text">(
  host: AgentRuntimeInternal,
  messageId: MessageId,
  kind: Kind,
): PartShell<Kind> {
  return assignKeys<PartShell<Kind>>([
    ["id", createPartId()],
    ["sessionID", host.sessionId],
    ["messageID", messageId],
    ["type", kind],
  ]);
}

function clock(openedAt: number): Col<"start", number> & Col<"end", number> {
  return assignKeys([
    ["start", openedAt],
    ["end", Date.now()],
  ]);
}

export function stepStartPart(host: AgentRuntimeInternal, messageId: MessageId) {
  return basePart(host, messageId, "step-start");
}

type ReasoningBlock = NonNullable<RuntimeModelTextResult["reasoning"]>[number];

export function reasoningPart(
  host: AgentRuntimeInternal,
  messageId: MessageId,
  openedAt: number,
  block: ReasoningBlock,
) {
  const opened = basePart(host, messageId, "reasoning");
  return assignKeys<
    PartShell<"reasoning"> &
      Col<"text", string> &
      Col<"metadata", ReasoningBlock["providerOptions"]> &
      Col<"time", ReturnType<typeof clock>>
  >([
    ["id", opened.id],
    ["sessionID", opened.sessionID],
    ["messageID", opened.messageID],
    ["type", "reasoning"],
    ["text", block.text],
    ["metadata", block.providerOptions],
    ["time", clock(openedAt)],
  ]);
}

export function textPart(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  messageId: MessageId,
  openedAt: number,
) {
  const opened = basePart(host, messageId, "text");
  return assignKeys<
    PartShell<"text"> & Col<"text", string> & Col<"time", ReturnType<typeof clock>>
  >([
    ["id", opened.id],
    ["sessionID", opened.sessionID],
    ["messageID", opened.messageID],
    ["type", "text"],
    ["text", loop.modelResponse],
    ["time", clock(openedAt)],
  ]);
}

export function modelCompletePayload(
  loop: RegularTurnLoopState,
  modelResult: RuntimeModelTextResult,
  source: string,
  windowSize: number | undefined,
  cache: unknown,
  changes: unknown,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  const mainTurn = source === "main_turn";
  const payload = assignKeys<Record<string, unknown>>([["content", loop.modelResponse]]);
  putIf(payload, "contextWindow", windowSize, mainTurn && windowSize !== undefined);
  payload.querySource = source;
  payload.stopReason = modelResult.finishReason;
  payload.usage = modelResult.usage;
  putIf(payload, "cacheHit", cache, Boolean(cache));
  putIf(payload, "fileChanges", changes, Boolean(changes));
  const breakdown = modelResult.contextUsageBreakdown;
  putIf(payload, "contextUsageBreakdown", breakdown, mainTurn && Boolean(breakdown));
  payload.toolCallCount = calls.length;
  return payload;
}

const RUNTIME_MODULE = "core.runtime";

function traced(
  trace: TraceContext,
  extras: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  const flat = traceContextToLogContext(trace) as Record<string, unknown>;
  const pairs: Array<readonly [string, unknown]> = Object.keys(flat).map((key) => [key, flat[key]]);
  for (const extra of extras) pairs.push(extra);
  return assignKeys<Record<string, unknown>>(pairs);
}

export function logModelCompletion(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  trace: TraceContext,
  openedAt: number,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  report(
    host,
    "info",
    "Model request completed",
    traced(trace, [
      ["durationMs", Date.now() - openedAt],
      ["event", "model.request.completed"],
      ["module", RUNTIME_MODULE],
      ["status", "completed"],
      ["totalTokens", loop.tokenCount],
      ["toolCallCount", calls.length],
    ]),
  );
}

export function logStartPlanRetry(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  delayMs: number,
  plan: { retryNumber: number; maxRetries: number },
) {
  report(
    host,
    "warn",
    "Main turn retrying after Start Plan admission busy",
    traced(trace, [
      ["event", "model.main_turn.retry_start_plan_admission_busy"],
      ["module", RUNTIME_MODULE],
      ["retryDelayMs", delayMs],
      ["retryNumber", plan.retryNumber],
      ["maxRetries", plan.maxRetries],
      ["status", "waiting"],
    ]),
  );
}

const LIMIT_CODE = "model_output_limit_exceeded";

type LimitError = { name: string; data: Record<string, unknown> };
type LimitCarrier = Col<"error", LimitError> &
  Col<"finishReason", string> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext>;

export function outputLimitCarrier(
  fault: ReturnType<typeof createCoreError>,
  projected: ReturnType<typeof projectExecutionErrorPayload>,
  modelResult: RuntimeModelTextResult,
  activeModel: Model,
  trace: TraceContext,
): LimitCarrier {
  // code 在前，然后才是 message / retryable / attribution，和原先展开的条件键顺序一致。
  const data: Record<string, unknown> = {};
  if (projected.code) data.code = projected.code;
  data.message = projected.message;
  data.retryable = fault.recoverable;
  if (projected.attribution) data.attribution = projected.attribution;
  const error = assignKeys<LimitError>([
    ["name", projected.code ?? fault.type],
    ["data", data],
  ]);
  return assignKeys<LimitCarrier>([
    ["error", error],
    ["finishReason", modelResult.finishReason],
    ["model", activeModel],
    ["modelTraceContext", trace],
  ]);
}

const HAN_LIMIT =
  "定时任务已达到 20 个上限，本次未创建。请前往“自动化”手动删除一个已有任务后重试。";
const EN_LIMIT =
  "The limit of 20 scheduled tasks has been reached, so no task was created. Manually delete an existing task on the Automations page, then try again.";

export function automationLimitResponse(text: string): string {
  return /\p{Script=Han}/u.test(text) ? HAN_LIMIT : EN_LIMIT;
}

export function modelStepTrace(loop: RegularTurnLoopState, activeModel: Model, source: string) {
  const attributes = assignKeys<Record<string, string | number | boolean>>([
    ["providerId", String(activeModel.providerId)],
    ["modelId", String(activeModel.modelId)],
    ["iteration", iterationOf(loop.toolCallCount)],
    ["querySource", source],
  ]);
  return createChildTraceContext(loop.turnTraceContext, { attributes });
}

type SteeringBag = Col<"activeTurn", RegularTurnLoopState["activeTurn"]> &
  Col<"drained", ModelStepInputs["drainedSteerForNextRequest"]> &
  Col<"messages", ModelStepInputs["messages"]> &
  Col<"modelStepCount", number> &
  Col<"traceContext", TraceContext>;

export function steeringFields(
  loop: RegularTurnLoopState,
  step: ModelStepInputs,
  trace: TraceContext,
): SteeringBag {
  return assignKeys<SteeringBag>([
    ["activeTurn", loop.activeTurn],
    ["drained", step.drainedSteerForNextRequest],
    ["messages", step.messages],
    ["modelStepCount", loop.modelStepCount],
    ["traceContext", trace],
  ]);
}

type RequestPayload = Col<"messages", ModelStepInputs["recordedMessages"]> &
  Col<"providerId", string> &
  Col<"modelId", string> &
  Col<"querySource", string> &
  Col<"toolCount", number> &
  Col<"iteration", number>;

export function modelRequestPayload(
  loop: RegularTurnLoopState,
  step: ModelStepInputs,
  activeModel: Model,
  source: string,
): RequestPayload {
  return assignKeys<RequestPayload>([
    ["messages", step.recordedMessages],
    ["providerId", String(activeModel.providerId)],
    ["modelId", String(activeModel.modelId)],
    ["querySource", source],
    ["toolCount", step.tools.length],
    ["iteration", iterationOf(loop.toolCallCount)],
  ]);
}

export function outputLimitError() {
  const context = assignKeys<Record<string, unknown>>([
    ["providerCode", LIMIT_CODE],
    ["reason", LIMIT_CODE],
    ["source", "provider"],
  ]);
  return createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, {
    context,
    recoverable: true,
  });
}

type UsageFailure = Col<"assistantMessageId", MessageId> &
  Col<"error", unknown> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext> &
  Col<"networkEventStartIndex", number> &
  Col<"startedAt", number> &
  Col<"status", "cancelled" | "error">;

export function failedUsage(
  loop: RegularTurnLoopState,
  usage: UsageFields,
  fault: unknown,
): UsageFailure {
  const status: UsageFailure["status"] = loop.turnAbortSignal.aborted ? "cancelled" : "error";
  return assignKeys<UsageFailure>([
    ["assistantMessageId", usage.assistantMessageId],
    ["error", fault],
    ["model", usage.model],
    ["modelTraceContext", usage.modelTraceContext],
    ["networkEventStartIndex", usage.networkEventStartIndex],
    ["startedAt", usage.startedAt],
    ["status", status],
  ]);
}

type UsageSuccess = Col<"assistantMessageId", MessageId> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext> &
  Col<"networkEventStartIndex", number> &
  Col<"result", RuntimeModelTextResult> &
  Col<"startedAt", number> &
  Col<"status", "completed"> &
  Col<"toolCallCount", number>;

export function completedUsage(
  usage: UsageFields,
  modelResult: RuntimeModelTextResult,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): UsageSuccess {
  return assignKeys<UsageSuccess>([
    ["assistantMessageId", usage.assistantMessageId],
    ["model", usage.model],
    ["modelTraceContext", usage.modelTraceContext],
    ["networkEventStartIndex", usage.networkEventStartIndex],
    ["result", modelResult],
    ["startedAt", usage.startedAt],
    ["status", "completed"],
    ["toolCallCount", calls.length],
  ]);
}

type SuspiciousBag = Col<"finishReason", string | undefined> &
  Col<"model", { modelId: string; providerId: string }> &
  Col<"providerMetadata", Record<string, unknown> | undefined> &
  Col<"rawFinishReason", string | undefined>;

export function suspiciousResultFields(
  modelResult: RuntimeModelTextResult,
  activeModel: { providerId: string; modelId: string },
  rawFinishReason: string | undefined,
): SuspiciousBag {
  return assignKeys<SuspiciousBag>([
    ["finishReason", modelResult.finishReason],
    ["model", activeModel],
    ["providerMetadata", modelResult.providerMetadata],
    ["rawFinishReason", rawFinishReason],
  ]);
}

export function warnAutomationTools(
  host: AgentRuntimeInternal,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  report(
    host,
    "warn",
    "Ignored tool calls after automation create limit was reached",
    assignKeys([
      ["event", "automation.create_limit.tool_calls_ignored"],
      ["module", RUNTIME_MODULE],
      ["status", "completed"],
      ["toolCallCount", calls.length],
    ]),
  );
}

type Anchor = Col<"latestAssistantMessageId", AgentRuntimeInternal["latestAssistantMessageId"]> &
  Col<"latestAssistantTurnId", AgentRuntimeInternal["latestAssistantTurnId"]> &
  Col<"latestConversationMessageId", AgentRuntimeInternal["latestConversationMessageId"]>;

type StopBag = Col<"assistantPersistenceAnchor", Anchor> &
  Col<"assistantCreatedAt", number> &
  Col<"assistantMessageId", MessageId> &
  Col<"modelTraceContext", TraceContext> &
  Col<"result", RuntimeModelTextResult>;

export function stopFields(
  saved: Anchor,
  createdAt: number,
  messageId: MessageId,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
): StopBag {
  return assignKeys<StopBag>([
    ["assistantPersistenceAnchor", saved],
    ["assistantCreatedAt", createdAt],
    ["assistantMessageId", messageId],
    ["modelTraceContext", trace],
    ["result", modelResult],
  ]);
}

type CompletedBag = StopBag & Col<"includeEmptyAssistant", false>;

export function completedAssistantFields(
  saved: Anchor,
  createdAt: number,
  messageId: MessageId,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
): CompletedBag {
  return assignKeys<CompletedBag>([
    ["assistantPersistenceAnchor", saved],
    ["assistantCreatedAt", createdAt],
    ["assistantMessageId", messageId],
    ["includeEmptyAssistant", false],
    ["modelTraceContext", trace],
    ["result", modelResult],
  ]);
}

type RecoveryBag = Col<"assistantMessageId", MessageId> &
  Opt<"failedRequestId", string> &
  Col<"traceContext", TraceContext>;

export function recoveryFields(
  messageId: MessageId,
  requestId: string | undefined,
  trace: TraceContext,
): RecoveryBag {
  const fields = assignKeys<RecoveryBag>([["assistantMessageId", messageId]]);
  putIf(fields, "failedRequestId", requestId, requestId !== undefined);
  fields.traceContext = trace;
  return fields;
}
