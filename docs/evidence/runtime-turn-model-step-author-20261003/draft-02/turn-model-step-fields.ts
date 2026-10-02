import {
  createPartId,
  traceContextToLogContext,
  createChildTraceContext,
  CoreErrorType,
} from "../deps.js";
import type { MessageId, Model, ModelToolContract, TraceContext } from "../deps.js";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type {
  DrainedPendingInputDiagnostics,
  RunModelTextRequestOptions,
  RuntimeModelTextResult,
} from "../types.js";
import { estimateCurrentModelInputTokens } from "./compact.js";
import { resolveModelStepMaxOutputTokens } from "./model-token-limits.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { createStreamingToolCoordinator } from "./streaming-tool-coordinator.js";
import {
  persistOutputTokenLimitErrorCarrier,
  captureAssistantPersistenceAnchor,
} from "./turn-stop.js";
import { beginStartPlanBusyAdmissionRetryAttempt } from "./streaming-recovery.js";
import { createCoreError } from "../deps.js";
import { projectExecutionErrorPayload } from "../helpers/index.js";

export interface ModelStepInputs {
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  latestRealUserMessageIndex?: number;
  messages: RunModelTextRequestOptions["messages"];
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
  recordedMessages: RunModelTextRequestOptions["messages"];
  requestEntries: readonly RuntimeMessageEntry[];
  tools: ModelToolContract[];
}
interface RequestFields {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  normalBudget: number;
  contextWindow: number | undefined;
  streamRecovery: RunModelTextRequestOptions["streamRecovery"];
  coordinator: ReturnType<typeof createStreamingToolCoordinator>;
  onStreamSnapshot: NonNullable<RunModelTextRequestOptions["onStreamSnapshot"]>;
  onModelNetworkStatus: NonNullable<RunModelTextRequestOptions["onModelNetworkStatus"]>;
}
export function buildTurnModelRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  fields: RequestFields,
): RunModelTextRequestOptions {
  return {
    abortSignal: state.turnAbortSignal,
    assistantMessageId: fields.assistantMessageId,
    events: state.events,
    maxOutputTokens: resolveModelStepMaxOutputTokens({
      baselineMaxOutputTokens: fields.normalBudget,
      contextWindow: fields.contextWindow,
      estimatedCurrentUsage: estimateCurrentModelInputTokens(
        options.messages,
        options.sourceEntries,
      ),
      modelContextBudgetStrategy: runtime.config.modelContextBudgetStrategy,
    }),
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
    messages: options.messages,
    sourceEntries: options.sourceEntries,
    model: fields.model,
    onStreamSnapshot: fields.onStreamSnapshot,
    onModelNetworkStatus: fields.onModelNetworkStatus,
    onStreamReasoningDelta: (text) => fields.coordinator.recordReasoningDelta(text),
    onStreamTextDelta: (text) => fields.coordinator.recordTextDelta(text),
    onStreamToolCall: (toolCall) => fields.coordinator.accept(toolCall),
    streamRecovery: fields.streamRecovery,
    tools: options.tools,
    traceContext: fields.modelTraceContext,
  };
}
export function stepStartPart(runtime: AgentRuntimeInternal, assistantMessageId: MessageId) {
  return {
    id: createPartId(),
    sessionID: runtime.sessionId,
    messageID: assistantMessageId,
    type: "step-start" as const,
  };
}
export function reasoningPart(
  runtime: AgentRuntimeInternal,
  assistantMessageId: MessageId,
  startedAt: number,
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
) {
  return {
    id: createPartId(),
    sessionID: runtime.sessionId,
    messageID: assistantMessageId,
    type: "reasoning" as const,
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
    id: createPartId(),
    sessionID: runtime.sessionId,
    messageID: assistantMessageId,
    type: "text" as const,
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
  return {
    content: state.modelResponse,
    ...(querySource === "main_turn" && contextWindow !== undefined ? { contextWindow } : {}),
    querySource,
    stopReason: result.finishReason,
    usage: result.usage,
    ...(cacheHit ? { cacheHit } : {}),
    ...(fileChanges ? { fileChanges } : {}),
    ...(querySource === "main_turn" && result.contextUsageBreakdown
      ? { contextUsageBreakdown: result.contextUsageBreakdown }
      : {}),
    toolCallCount: toolCalls.length,
  };
}
export function logModelCompletion(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  modelTraceContext: TraceContext,
  startedAt: number,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void {
  runtime.logger?.info("Model request completed", {
    ...traceContextToLogContext(modelTraceContext),
    durationMs: Date.now() - startedAt,
    event: "model.request.completed",
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
  attempt: ReturnType<typeof beginStartPlanBusyAdmissionRetryAttempt>,
): void {
  runtime.logger?.warn("Main turn retrying after Start Plan admission busy", {
    ...traceContextToLogContext(modelTraceContext),
    event: "model.main_turn.retry_start_plan_admission_busy",
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
): Parameters<typeof persistOutputTokenLimitErrorCarrier>[2] {
  return {
    error: {
      name: projected.code || exhausted.type,
      data: {
        ...(projected.code ? { code: projected.code } : {}),
        message: projected.message,
        retryable: exhausted.recoverable,
        ...(projected.attribution ? { attribution: projected.attribution } : {}),
      },
    },
    finishReason: result.finishReason,
    model,
    modelTraceContext,
  };
}
export function automationLimitResponse(input: string): string {
  return /\p{Script=Han}/u.test(input)
    ? "定时任务已达到 20 个上限，本次未创建。请前往“自动化”手动删除一个已有任务后重试。"
    : "The limit of 20 scheduled tasks has been reached, so no task was created. Manually delete an existing task on the Automations page, then try again.";
}

export function modelStepTrace(state: RegularTurnLoopState, model: Model, querySource: string) {
  return createChildTraceContext(state.turnTraceContext, {
    attributes: {
      providerId: String(model.providerId),
      modelId: String(model.modelId),
      iteration: state.toolCallCount === 0 ? 0 : Math.ceil(state.toolCallCount / 10),
      querySource,
    },
  });
}
export function steeringFields(
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  traceContext: TraceContext,
) {
  return {
    activeTurn: state.activeTurn,
    drained: options.drainedSteerForNextRequest,
    messages: options.messages,
    modelStepCount: state.modelStepCount,
    traceContext,
  };
}
export function modelRequestPayload(
  state: RegularTurnLoopState,
  options: ModelStepInputs,
  model: Model,
  querySource: string,
) {
  return {
    messages: options.recordedMessages,
    providerId: String(model.providerId),
    modelId: String(model.modelId),
    querySource,
    toolCount: options.tools.length,
    iteration: state.toolCallCount === 0 ? 0 : Math.ceil(state.toolCallCount / 10),
  };
}
export function outputLimitError() {
  return createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, {
    recoverable: true,
    context: {
      providerCode: "model_output_limit_exceeded",
      reason: "model_output_limit_exceeded",
      source: "provider",
    },
  });
}
export interface UsageFields {
  assistantMessageId: MessageId;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  startedAt: number;
}
export function failedUsage(state: RegularTurnLoopState, fields: UsageFields, error: unknown) {
  return {
    assistantMessageId: fields.assistantMessageId,
    error,
    model: fields.model,
    modelTraceContext: fields.modelTraceContext,
    networkEventStartIndex: fields.networkEventStartIndex,
    startedAt: fields.startedAt,
    status: state.turnAbortSignal.aborted ? ("cancelled" as const) : ("error" as const),
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
export function suspiciousResultFields(
  result: RuntimeModelTextResult,
  model: { providerId: string; modelId: string },
  rawFinishReason: string | undefined,
) {
  return {
    finishReason: result.finishReason,
    model,
    providerMetadata: result.providerMetadata,
    rawFinishReason,
  };
}
export function warnAutomationTools(
  runtime: AgentRuntimeInternal,
  toolCalls: ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>,
): void {
  runtime.logger?.warn("Ignored tool calls after automation create limit was reached", {
    event: "automation.create_limit.tool_calls_ignored",
    module: "core.runtime",
    status: "completed",
    toolCallCount: toolCalls.length,
  });
}

import { OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE } from "./turn-output-token-continuation.js";

export function stopFields(
  anchor: ReturnType<typeof captureAssistantPersistenceAnchor>,
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
  anchor: ReturnType<typeof captureAssistantPersistenceAnchor>,
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
) {
  return { assistantMessageId, ...(failedRequestId ? { failedRequestId } : {}), traceContext };
}
