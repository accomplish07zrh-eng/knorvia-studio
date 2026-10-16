// SPDX-License-Identifier: Apache-2.0
// 模型步的请求、分部和收尾字段。请求对象的键序是契约观察面。
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
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  latestRealUserMessageIndex?: number;
  messages: RunModelTextRequestOptions["messages"];
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
  recordedMessages: RunModelTextRequestOptions["messages"];
  requestEntries: readonly RuntimeMessageEntry[];
  tools: ModelToolContract[];
}

interface StreamCoordinator {
  recordReasoningDelta: (text: string) => void;
  recordTextDelta: (text: string) => void;
  accept: (toolCall: ModelToolCall) => void;
}

interface RequestFields {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  normalBudget: number;
  contextWindow: number | undefined;
  streamRecovery: RunModelTextRequestOptions["streamRecovery"];
  coordinator: StreamCoordinator;
  onStreamSnapshot: NonNullable<RunModelTextRequestOptions["onStreamSnapshot"]>;
  onModelNetworkStatus: NonNullable<RunModelTextRequestOptions["onModelNetworkStatus"]>;
}

export interface UsageFields {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  startedAt: number;
}

const REQUEST_KEYS = [
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

function iterationOf(toolCallCount: number): number {
  if (toolCallCount === 0) return 0;
  return Math.ceil(toolCallCount / 10);
}

export function buildTurnModelRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  fields: RequestFields,
): RunModelTextRequestOptions {
  const maxOutputTokens = resolveModelStepMaxOutputTokens({
    baselineMaxOutputTokens: fields.normalBudget,
    contextWindow: fields.contextWindow,
    estimatedCurrentUsage: estimateCurrentModelInputTokens(options.messages, options.sourceEntries),
    modelContextBudgetStrategy: runtime.config.modelContextBudgetStrategy,
  });
  const coordinator = fields.coordinator;
  const values: Record<(typeof REQUEST_KEYS)[number], unknown> = {
    abortSignal: state.turnAbortSignal,
    assistantMessageId: fields.assistantMessageId,
    events: state.events,
    maxOutputTokens,
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
    messages: options.messages,
    sourceEntries: options.sourceEntries,
    model: fields.model,
    onStreamSnapshot: fields.onStreamSnapshot,
    onModelNetworkStatus: fields.onModelNetworkStatus,
    onStreamReasoningDelta: (text: string) => coordinator.recordReasoningDelta(text),
    onStreamTextDelta: (text: string) => coordinator.recordTextDelta(text),
    onStreamToolCall: (toolCall: ModelToolCall) => coordinator.accept(toolCall),
    streamRecovery: fields.streamRecovery,
    tools: options.tools,
    traceContext: fields.modelTraceContext,
  };
  return assignKeys(REQUEST_KEYS.map((key) => [key, values[key]] as const));
}

function partShell<Kind extends string>(
  runtime: AgentRuntimeInternal,
  messageID: MessageId,
  type: Kind,
) {
  return {
    id: createPartId(),
    sessionID: runtime.sessionId,
    messageID,
    type,
  };
}

export function stepStartPart(runtime: AgentRuntimeInternal, assistantMessageId: MessageId) {
  return { ...partShell(runtime, assistantMessageId, "step-start") };
}

export function reasoningPart(
  runtime: AgentRuntimeInternal,
  assistantMessageId: MessageId,
  startedAt: number,
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
) {
  return {
    ...partShell(runtime, assistantMessageId, "reasoning"),
    text: reasoning.text,
    metadata: reasoning.providerOptions,
    time: { start: startedAt, end: Date.now() },
  };
}

export function textPart(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  assistantMessageId: MessageId,
  startedAt: number,
) {
  return {
    ...partShell(runtime, assistantMessageId, "text"),
    text: state.modelResponse,
    time: { start: startedAt, end: Date.now() },
  };
}

export function modelCompletePayload(
  state: RegularTurnLoopState,
  result: RuntimeModelTextResult,
  querySource: string,
  contextWindow: number | undefined,
  cacheHit: unknown,
  fileChanges: unknown,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  const ordered = assignKeys<Record<string, unknown>>([["content", state.modelResponse]]);
  putIf(ordered, "contextWindow", contextWindow, querySource === "main_turn" && contextWindow !== undefined);
  ordered.querySource = querySource;
  ordered.stopReason = result.finishReason;
  ordered.usage = result.usage;
  putIf(ordered, "cacheHit", cacheHit, Boolean(cacheHit));
  putIf(ordered, "fileChanges", fileChanges, Boolean(fileChanges));
  putIf(
    ordered,
    "contextUsageBreakdown",
    result.contextUsageBreakdown,
    querySource === "main_turn" && Boolean(result.contextUsageBreakdown),
  );
  ordered.toolCallCount = toolCalls.length;
  return ordered;
}

export function logModelCompletion(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  modelTraceContext: TraceContext,
  startedAt: number,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void {
  report(runtime, "info", phrase(["Model request ", "completed"]), {
    ...traceContextToLogContext(modelTraceContext),
    durationMs: Date.now() - startedAt,
    event: phrase(["model.request.", "completed"]),
    module: "core.runtime",
    status: "completed",
    totalTokens: state.tokenCount,
    toolCallCount: toolCalls.length,
  });
}

export function logStartPlanRetry(
  runtime: AgentRuntimeInternal,
  modelTraceContext: TraceContext,
  retryDelayMs: number,
  attempt: { retryNumber: number; maxRetries: number },
): void {
  report(runtime, "warn", phrase(["Main turn retrying after ", "Start Plan admission busy"]), {
    ...traceContextToLogContext(modelTraceContext),
    event: phrase(["model.main_turn.", "retry_start_plan_admission_busy"]),
    module: "core.runtime",
    retryDelayMs,
    retryNumber: attempt.retryNumber,
    maxRetries: attempt.maxRetries,
    status: "waiting",
  });
}

export function outputLimitCarrier(
  exhausted: ReturnType<typeof createCoreError>,
  projected: ReturnType<typeof projectExecutionErrorPayload>,
  result: RuntimeModelTextResult,
  model: Model,
  modelTraceContext: TraceContext,
) {
  const data: Record<string, unknown> = { message: projected.message, retryable: exhausted.recoverable };
  if (projected.code) data.code = projected.code;
  if (projected.attribution) data.attribution = projected.attribution;
  return {
    error: { name: projected.code ?? exhausted.type, data },
    finishReason: result.finishReason,
    model,
    modelTraceContext,
  };
}

export function automationLimitResponse(input: string): string {
  const han = /\p{Script=Han}/u.test(input);
  if (han) {
    return phrase([
      "定时任务已达到 20 个上限，本次未创建。",
      "请前往“自动化”手动删除一个已有任务后重试。",
    ]);
  }
  return phrase([
    "The limit of 20 scheduled tasks has been reached, so no task was created. ",
    "Manually delete an existing task on the Automations page, then try again.",
  ]);
}

export function modelStepTrace(state: RegularTurnLoopState, model: Model, querySource: string) {
  return createChildTraceContext(state.turnTraceContext, {
    attributes: {
      providerId: String(model.providerId),
      modelId: String(model.modelId),
      iteration: iterationOf(state.toolCallCount),
      querySource,
    },
  });
}

interface SteeringBag {
  activeTurn?: RegularTurnLoopState["activeTurn"];
  drained?: ModelStepInputs["drainedSteerForNextRequest"];
  messages: ModelStepInputs["messages"];
  modelStepCount: number;
  traceContext: TraceContext;
}

export function steeringFields(
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  traceContext: TraceContext,
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
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  model: Model,
  querySource: string,
) {
  return assignKeys([
    ["messages", options.recordedMessages],
    ["providerId", String(model.providerId)],
    ["modelId", String(model.modelId)],
    ["querySource", querySource],
    ["toolCount", options.tools.length],
    ["iteration", iterationOf(state.toolCallCount)],
  ]);
}

export function outputLimitError() {
  return createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, {
    context: {
      providerCode: "model_output_limit_exceeded",
      reason: "model_output_limit_exceeded",
      source: "provider",
    },
    recoverable: true,
  });
}

export function failedUsage(state: RegularTurnLoopState, fields: UsageFields, error: unknown) {
  const status = (state.turnAbortSignal.aborted ? "cancelled" : "error") as "cancelled" | "error";
  return {
    assistantMessageId: fields.assistantMessageId,
    error,
    model: fields.model,
    modelTraceContext: fields.modelTraceContext,
    networkEventStartIndex: fields.networkEventStartIndex,
    startedAt: fields.startedAt,
    status,
  };
}

export function completedUsage(
  fields: UsageFields,
  result: RuntimeModelTextResult,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
) {
  return {
    assistantMessageId: fields.assistantMessageId,
    model: fields.model,
    modelTraceContext: fields.modelTraceContext,
    networkEventStartIndex: fields.networkEventStartIndex,
    result,
    startedAt: fields.startedAt,
    status: "completed" as const,
    toolCallCount: toolCalls.length,
  };
}

interface SuspiciousBag {
  finishReason: string | undefined;
  model: { modelId: string; providerId: string };
  providerMetadata: Record<string, unknown> | undefined;
  rawFinishReason: string | undefined;
}

export function suspiciousResultFields(
  result: RuntimeModelTextResult,
  model: { providerId: string; modelId: string },
  rawFinishReason: string | undefined,
): SuspiciousBag {
  return assignKeys<SuspiciousBag>([
    ["finishReason", result.finishReason],
    ["model", model],
    ["providerMetadata", result.providerMetadata],
    ["rawFinishReason", rawFinishReason],
  ]);
}

export function warnAutomationTools(
  runtime: AgentRuntimeInternal,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void {
  report(runtime, "warn", phrase(["Ignored tool calls after ", "automation create limit was reached"]), {
    event: phrase(["automation.create_limit.", "tool_calls_ignored"]),
    module: "core.runtime",
    status: "completed",
    toolCallCount: toolCalls.length,
  });
}

export function stopFields(
  anchor: {
    latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"];
    latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"];
    latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"];
  },
  assistantCreatedAt: number,
  assistantMessageId: MessageId,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
) {
  return {
    assistantPersistenceAnchor: anchor,
    assistantCreatedAt,
    assistantMessageId,
    modelTraceContext,
    result,
  };
}

export function completedAssistantFields(
  anchor: {
    latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"];
    latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"];
    latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"];
  },
  assistantCreatedAt: number,
  assistantMessageId: MessageId,
  modelTraceContext: TraceContext,
  result: RuntimeModelTextResult,
) {
  return {
    assistantPersistenceAnchor: anchor,
    assistantCreatedAt,
    assistantMessageId,
    includeEmptyAssistant: false,
    modelTraceContext,
    result,
  };
}

export function recoveryFields(
  assistantMessageId: MessageId,
  failedRequestId: string | undefined,
  traceContext: TraceContext,
): { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext } {
  const fields: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    traceContext?: TraceContext;
  } = { assistantMessageId };
  if (failedRequestId !== undefined) fields.failedRequestId = failedRequestId;
  fields.traceContext = traceContext;
  return fields as { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext };
}
