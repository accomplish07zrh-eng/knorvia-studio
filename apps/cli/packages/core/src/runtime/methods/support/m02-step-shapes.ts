// SPDX-License-Identifier: Apache-2.0
// 模型步的请求、分部和收尾字段。请求键按 REQUEST_ORDER 抄出，其余载荷用分层对象。
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
import { layer, report, type Col, type Opt } from "./m02-record.js";

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

/** provider 请求的键插入顺序。槽位对象不保证顺序，抄出时按这张表。 */
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

const RUNTIME_MODULE = "core.runtime";
const LIMIT_CODE = "model_output_limit_exceeded";

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
  const { normalBudget: baselineMaxOutputTokens, contextWindow } = prepared;
  const { modelContextBudgetStrategy } = host.config;
  return resolveModelStepMaxOutputTokens({
    baselineMaxOutputTokens,
    contextWindow,
    estimatedCurrentUsage: estimated,
    modelContextBudgetStrategy,
  });
}

export function buildTurnModelRequest(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  step: ModelStepInputs,
  prepared: RequestFields,
): RunModelTextRequestOptions {
  const budget = stepBudget(host, step, prepared);
  const sink = prepared.coordinator;
  const slots: Record<RequestKey, unknown> = {
    abortSignal: loop.turnAbortSignal,
    assistantMessageId: prepared.assistantMessageId,
    events: loop.events,
    maxOutputTokens: budget,
    latestRealUserMessageIndex: step.latestRealUserMessageIndex,
    messages: step.messages,
    sourceEntries: step.sourceEntries,
    model: prepared.model,
    onStreamSnapshot: prepared.onStreamSnapshot,
    onModelNetworkStatus: prepared.onModelNetworkStatus,
    onStreamReasoningDelta: (text: string) => sink.recordReasoningDelta(text),
    onStreamTextDelta: (text: string) => sink.recordTextDelta(text),
    onStreamToolCall: (toolCall: ModelToolCall) => sink.accept(toolCall),
    streamRecovery: prepared.streamRecovery,
    tools: step.tools,
    traceContext: prepared.modelTraceContext,
  };
  const request: Record<string, unknown> = {};
  for (const key of REQUEST_ORDER) request[key] = slots[key];
  return request as unknown as RunModelTextRequestOptions;
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
  const { sessionId } = host;
  return { id: createPartId(), sessionID: sessionId, messageID: messageId, type: kind };
}

function clock(openedAt: number): Col<"start", number> & Col<"end", number> {
  return { start: openedAt, end: Date.now() };
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
  const { text, providerOptions: metadata } = block;
  return { ...opened, text, metadata, time: clock(openedAt) };
}

export function textPart(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  messageId: MessageId,
  openedAt: number,
) {
  const opened = basePart(host, messageId, "text");
  return { ...opened, text: loop.modelResponse, time: clock(openedAt) };
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
  const content = loop.modelResponse;
  const querySource = source;
  const stopReason = modelResult.finishReason;
  const { usage, contextUsageBreakdown } = modelResult;
  const toolCallCount = calls.length;
  return layer(
    { content },
    mainTurn && windowSize !== undefined ? { contextWindow: windowSize } : undefined,
    { querySource, stopReason, usage },
    cache ? { cacheHit: cache } : undefined,
    changes ? { fileChanges: changes } : undefined,
    mainTurn && contextUsageBreakdown ? { contextUsageBreakdown } : undefined,
    { toolCallCount },
  );
}

function observe(trace: TraceContext, detail: object): Record<string, unknown> {
  return layer(traceContextToLogContext(trace), detail);
}

export function logModelCompletion(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  trace: TraceContext,
  openedAt: number,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  const durationMs = Date.now() - openedAt;
  const event = "model.request.completed";
  const module = RUNTIME_MODULE;
  const status = "completed";
  const totalTokens = loop.tokenCount;
  const toolCallCount = calls.length;
  report(
    host,
    "info",
    "Model request completed",
    observe(trace, {
      durationMs,
      event,
      module,
      status,
      totalTokens,
      toolCallCount,
    }),
  );
}

export function logStartPlanRetry(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  delayMs: number,
  plan: { retryNumber: number; maxRetries: number },
) {
  const event = "model.main_turn.retry_start_plan_admission_busy";
  const module = RUNTIME_MODULE;
  const { retryNumber, maxRetries } = plan;
  const status = "waiting";
  report(
    host,
    "warn",
    "Main turn retrying after Start Plan admission busy",
    observe(trace, {
      event,
      module,
      retryDelayMs: delayMs,
      retryNumber,
      maxRetries,
      status,
    }),
  );
}

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
  // code 在前，然后才是 message / retryable / attribution。
  const data = layer<Record<string, unknown>>(
    projected.code ? { code: projected.code } : undefined,
    { message: projected.message, retryable: fault.recoverable },
    projected.attribution ? { attribution: projected.attribution } : undefined,
  );
  const error: LimitError = { name: projected.code ?? fault.type, data };
  const finishReason = modelResult.finishReason;
  return { error, finishReason, model: activeModel, modelTraceContext: trace };
}

const HAN_LIMIT =
  "定时任务已达到 20 个上限，本次未创建。请前往“自动化”手动删除一个已有任务后重试。";
const EN_LIMIT =
  "The limit of 20 scheduled tasks has been reached, so no task was created. Manually delete an existing task on the Automations page, then try again.";

export function automationLimitResponse(text: string): string {
  return /\p{Script=Han}/u.test(text) ? HAN_LIMIT : EN_LIMIT;
}

export function modelStepTrace(loop: RegularTurnLoopState, activeModel: Model, source: string) {
  const providerId = String(activeModel.providerId);
  const modelId = String(activeModel.modelId);
  const iteration = iterationOf(loop.toolCallCount);
  const querySource = source;
  return createChildTraceContext(loop.turnTraceContext, {
    attributes: { providerId, modelId, iteration, querySource },
  });
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
  const { activeTurn, modelStepCount } = loop;
  const { drainedSteerForNextRequest: drained, messages } = step;
  return { activeTurn, drained, messages, modelStepCount, traceContext: trace };
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
  const messages = step.recordedMessages;
  const providerId = String(activeModel.providerId);
  const modelId = String(activeModel.modelId);
  const querySource = source;
  const toolCount = step.tools.length;
  const iteration = iterationOf(loop.toolCallCount);
  return { messages, providerId, modelId, querySource, toolCount, iteration };
}

export function outputLimitError() {
  const providerCode = LIMIT_CODE;
  const reason = LIMIT_CODE;
  const source = "provider";
  return createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, {
    context: { providerCode, reason, source },
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

function usageIdentity(usage: UsageFields) {
  const { assistantMessageId, model, modelTraceContext, networkEventStartIndex, startedAt } = usage;
  return { assistantMessageId, model, modelTraceContext, networkEventStartIndex, startedAt };
}

export function failedUsage(
  loop: RegularTurnLoopState,
  usage: UsageFields,
  fault: unknown,
): UsageFailure {
  const status: UsageFailure["status"] = loop.turnAbortSignal.aborted ? "cancelled" : "error";
  const { assistantMessageId, model, modelTraceContext, networkEventStartIndex, startedAt } =
    usageIdentity(usage);
  return {
    assistantMessageId,
    error: fault,
    model,
    modelTraceContext,
    networkEventStartIndex,
    startedAt,
    status,
  };
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
  const { assistantMessageId, model, modelTraceContext, networkEventStartIndex, startedAt } =
    usageIdentity(usage);
  return {
    assistantMessageId,
    model,
    modelTraceContext,
    networkEventStartIndex,
    result: modelResult,
    startedAt,
    status: "completed",
    toolCallCount: calls.length,
  };
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
  const { finishReason, providerMetadata } = modelResult;
  return { finishReason, model: activeModel, providerMetadata, rawFinishReason };
}

export function warnAutomationTools(
  host: AgentRuntimeInternal,
  calls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  const event = "automation.create_limit.tool_calls_ignored";
  const module = RUNTIME_MODULE;
  const status = "completed";
  const toolCallCount = calls.length;
  report(host, "warn", "Ignored tool calls after automation create limit was reached", {
    event,
    module,
    status,
    toolCallCount,
  });
}

type Anchor = Col<"latestAssistantMessageId", AgentRuntimeInternal["latestAssistantMessageId"]> &
  Col<"latestAssistantTurnId", AgentRuntimeInternal["latestAssistantTurnId"]> &
  Col<"latestConversationMessageId", AgentRuntimeInternal["latestConversationMessageId"]>;

type StopBag = Col<"assistantPersistenceAnchor", Anchor> &
  Col<"assistantCreatedAt", number> &
  Col<"assistantMessageId", MessageId> &
  Col<"modelTraceContext", TraceContext> &
  Col<"result", RuntimeModelTextResult>;

function assistantStop(
  saved: Anchor,
  createdAt: number,
  messageId: MessageId,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
): StopBag {
  return {
    assistantPersistenceAnchor: saved,
    assistantCreatedAt: createdAt,
    assistantMessageId: messageId,
    modelTraceContext: trace,
    result: modelResult,
  };
}

export function stopFields(
  saved: Anchor,
  createdAt: number,
  messageId: MessageId,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
): StopBag {
  return assistantStop(saved, createdAt, messageId, trace, modelResult);
}

type CompletedBag = StopBag & Col<"includeEmptyAssistant", false>;

export function completedAssistantFields(
  saved: Anchor,
  createdAt: number,
  messageId: MessageId,
  trace: TraceContext,
  modelResult: RuntimeModelTextResult,
): CompletedBag {
  const core = assistantStop(saved, createdAt, messageId, trace, modelResult);
  return {
    assistantPersistenceAnchor: core.assistantPersistenceAnchor,
    assistantCreatedAt: core.assistantCreatedAt,
    assistantMessageId: core.assistantMessageId,
    includeEmptyAssistant: false,
    modelTraceContext: core.modelTraceContext,
    result: core.result,
  };
}

type RecoveryBag = Col<"assistantMessageId", MessageId> &
  Opt<"failedRequestId", string> &
  Col<"traceContext", TraceContext>;

export function recoveryFields(
  messageId: MessageId,
  requestId: string | undefined,
  trace: TraceContext,
): RecoveryBag {
  return layer<RecoveryBag>(
    { assistantMessageId: messageId },
    requestId !== undefined ? { failedRequestId: requestId } : undefined,
    { traceContext: trace },
  );
}
