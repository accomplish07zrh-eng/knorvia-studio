import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { CoreErrorType, SessionEventType, createChildTraceContext, createCoreError,
  createMessageId, createPartId, getModelUsageTotalTokens, traceContextToLogContext } from "../deps.js";
import type { MessageId, ModelToolContract } from "../deps.js";
import { createRuntimeAssistantEntry, type RuntimeMessageEntry } from "../../agent/message-history.js";
import { createModelContextExceededFinishError, projectExecutionErrorPayload,
  finalizeSuspiciousEmptyModelResult, isContextExceededFinishReason, isSuspiciousEmptyModelResult,
  readRawFinishReason, throwIfTurnAborted, isTurnCancellationError, isModelContextExceededError,
  buildTurnFileChangeSummary } from "../helpers/index.js";
import type { DrainedPendingInputDiagnostics, RunModelTextRequestOptions,
  RuntimeModelStreamSnapshot, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { executeToolCallsForModelStep } from "./turn-tools.js";
import { captureAssistantPersistenceAnchor, finishModelStepWithoutToolCalls,
  persistCompletedAssistantStep, persistOutputTokenLimitErrorCarrier } from "./turn-stop.js";
import { createStreamingToolCoordinator } from "./streaming-tool-coordinator.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";
import { querySourceForTask, recordMainTurnCacheHitUsage,
  recordMainTurnModelUsage } from "./turn-model-step-usage.js";
import { estimateCurrentModelInputTokens } from "./compact.js";
import { resolveModelStepMaxOutputTokens, resolveNormalRequestMaxOutputTokens } from "./model-token-limits.js";
import { appendOutputTokenContinuation, classifyOutputTokenContinuation, commitAssistantToTurnRequest,
  commitTurnRequestEntries, completeOutputTokenRecovery, hasAssistantReasoningContent,
  OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE } from "./turn-output-token-continuation.js";
import { persistCancelledStreamSnapshot } from "./cancelled-stream-persistence.js";
import { beginStartPlanBusyAdmissionRetryAttempt, createStartPlanBusyAutoRetryExhaustedError,
  emitStreamRecoveryRetryEvents, emitStreamRecoveryStarted, getStartPlanBusyAdmissionRetryDelayMs,
  isStartPlanBusyStreamRecoveryFailure } from "./streaming-recovery.js";
import { logTurnModelDiagnostics, logTurnModelSuspiciousEmpty,
  persistedFailure } from "./turn-model-step-records.js";
import { recoverTurnModelContext } from "./turn-model-step-recovery.js";

type ModelStepResult = "continue" | "output_continuation" | "break";

export async function runModelBackedTurnStep(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  latestRealUserMessageIndex?: number;
  messages: RunModelTextRequestOptions["messages"];
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
  recordedMessages: RunModelTextRequestOptions["messages"];
  requestEntries: readonly RuntimeMessageEntry[];
  tools: ModelToolContract[];
}): Promise<ModelStepResult> {
  const assistantMessageId = createMessageId();
  const telemetry = this.agentTelemetry.step({
    stepId: assistantMessageId,
    stepIndex: state.modelStepCount,
  });
  return telemetry.run(async () => {
    try {
      const outcome = await performModelStep(this, state, options, assistantMessageId);
      telemetry.finishCompleted(outcome === "output_continuation" ? "model_completed"
        : outcome === "continue" ? "tool_requested" : "turn_completed");
      return outcome;
    } catch (error) {
      if (isTurnCancellationError(error, state.turnAbortSignal)) telemetry.finishCancelled("abort_signal");
      else telemetry.finishFailed("unhandled", "unknown", error);
      throw error;
    }
  });
}

async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: Parameters<typeof runModelBackedTurnStep>[1],
  assistantMessageId: MessageId,
): Promise<ModelStepResult> {
  const model = state.model;
  const modelStepIndex = state.modelStepCount;
  const startedAt = Date.now();
  const assistantPersistenceAnchor = captureAssistantPersistenceAnchor(runtime);
  const querySource = querySourceForTask(runtime.config.taskType);
  const modelSelection = { providerId: model.providerId, modelId: model.modelId };
  const modelMaxOutputTokens = model.optionSpecs.maxOutputTokens.max;
  const contextWindow = model.properties.contextWindow;
  const modelTraceContext = createChildTraceContext(state.turnTraceContext, {
    attributes: {
      providerId: String(model.providerId),
      modelId: String(model.modelId),
      iteration: state.toolCallCount === 0 ? 0 : Math.ceil(state.toolCallCount / 10),
      querySource,
    },
  });
  runtime.logModelRequestSteeringContext({
    activeTurn: state.activeTurn,
    drained: options.drainedSteerForNextRequest,
    messages: options.messages,
    modelStepCount: state.modelStepCount,
    traceContext: modelTraceContext,
  });
  const finishPreparation = beginLocalTurnPreparation(modelTraceContext, "persistence");
  await runtime.persistAssistantMessage(assistantMessageId, state.currentUserMessageId,
    startedAt, undefined, modelTraceContext, model);
  await runtime.persistPart({
    id: createPartId(), sessionID: runtime.sessionId, messageID: assistantMessageId, type: "step-start",
  }, modelTraceContext);
  const requestEvent = runtime.createEvent(SessionEventType.ModelRequest, {
    messages: options.recordedMessages,
    providerId: String(model.providerId),
    modelId: String(model.modelId),
    querySource,
    toolCount: options.tools.length,
    iteration: state.toolCallCount === 0 ? 0 : Math.ceil(state.toolCallCount / 10),
  }, modelTraceContext);
  await runtime.appendEvent(requestEvent, modelTraceContext);
  state.events.push(requestEvent);
  finishPreparation();
  const coordinator = createStreamingToolCoordinator(runtime, state, {
    assistantMessageId, model, traceContext: modelTraceContext,
  });
  const networkEventStartIndex = state.events.length;
  let snapshot: RuntimeModelStreamSnapshot = { reasoning: [], text: "" };
  const streamRecovery = state.pendingStreamRecoveryRequest;
  state.pendingStreamRecoveryRequest = undefined;
  let startedRequestId: string | undefined;
  let failedRequestId: string | undefined;
  let result: RuntimeModelTextResult;
  try {
    const normalBudget = resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens });
    result = await runtime.runModelTextRequest({
      abortSignal: state.turnAbortSignal,
      assistantMessageId,
      events: state.events,
      maxOutputTokens: resolveModelStepMaxOutputTokens({
        baselineMaxOutputTokens: normalBudget,
        contextWindow,
        estimatedCurrentUsage: estimateCurrentModelInputTokens(options.messages, options.sourceEntries),
        modelContextBudgetStrategy: runtime.config.modelContextBudgetStrategy,
      }),
      latestRealUserMessageIndex: options.latestRealUserMessageIndex,
      messages: options.messages,
      sourceEntries: options.sourceEntries,
      model,
      onStreamSnapshot: (next) => { snapshot = next; },
      onModelNetworkStatus: (event) => {
        if (event.type === "model_request_started") startedRequestId = event.requestId;
        else if (event.type === "model_stream_stalled" || event.type === "model_request_failed") {
          failedRequestId = event.requestId;
        }
      },
      onStreamReasoningDelta: (text) => coordinator.recordReasoningDelta(text),
      onStreamTextDelta: (text) => coordinator.recordTextDelta(text),
      onStreamToolCall: (toolCall) => coordinator.accept(toolCall),
      streamRecovery,
      tools: options.tools,
      traceContext: modelTraceContext,
    });
    throwIfTurnAborted(state.turnAbortSignal);
  } catch (error) {
    const requestFailureId = failedRequestId ?? startedRequestId;
    await recordMainTurnModelUsage(runtime, state, {
      assistantMessageId: assistantMessageId,
      error: error,
      model: model,
      modelTraceContext: modelTraceContext,
      networkEventStartIndex: networkEventStartIndex,
      startedAt: startedAt,
      status: state.turnAbortSignal.aborted ? "cancelled" : "error",
    });
    const toolCount = state.toolCallCount;
    if (await coordinator.recoverFromModelFailure(error, startedAt, {
      ...(requestFailureId ? { failedRequestId: requestFailureId } : {}),
    })) {
      if (state.toolCallCount > toolCount) completeOutputTokenRecovery(state.turnRequestState);
      return "continue";
    }
    const retryDelayMs = getStartPlanBusyAdmissionRetryDelayMs({
      error: error,
      providerId: modelSelection.providerId,
      state,
      turnNumber: runtime.turnNumber,
    });
    let finalError = error;
    if (!state.turnAbortSignal.aborted && retryDelayMs !== undefined) {
      const attempt = beginStartPlanBusyAdmissionRetryAttempt(state);
      runtime.logger?.warn("Main turn retrying after Start Plan admission busy", {
        ...traceContextToLogContext(modelTraceContext),
        event: "model.main_turn.retry_start_plan_admission_busy",
        module: "core.runtime",
        retryDelayMs,
        retryNumber: attempt.retryNumber,
        maxRetries: attempt.maxRetries,
        status: "waiting",
      });
      const recoveryOptions = {
        assistantMessageId: assistantMessageId,
        ...(requestFailureId ? { failedRequestId: requestFailureId } : {}),
        traceContext: modelTraceContext,
      };
      await emitStreamRecoveryStarted(runtime, state, recoveryOptions, error, attempt);
      await runtime.persistAssistantMessage(assistantMessageId, state.userMessageId,
        startedAt, { completed: Date.now(), finish: "start_plan_admission_retry_discarded" },
        modelTraceContext, model);
      state.modelResponse = "";
      state.modelStepCount += 1;
      recordModelHistoryRound(state);
      state.turnMachine.receiveModelResponse("");
      state.turnMachine.aggregateResults();
      await emitStreamRecoveryRetryEvents(runtime, state, recoveryOptions, {
        ...attempt,
        discardedReasoningBytes: 0,
        discardedTextBytes: 0,
        reason: "no_tool_committed",
        toolCallIds: [],
      });
      await coordinator.abandon("model_failed");
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      throwIfTurnAborted(state.turnAbortSignal);
      return "continue";
    }
    if (state.streamRecoveryRetryCount > 0 && !state.turnAbortSignal.aborted
      && isStartPlanBusyStreamRecoveryFailure(error)) {
      finalError = createStartPlanBusyAutoRetryExhaustedError(error);
    }
    await coordinator.abandon(state.turnAbortSignal.aborted ? "cancelled" : "model_failed");
    if (state.turnAbortSignal.aborted && isTurnCancellationError(finalError, state.turnAbortSignal)) {
      await persistCancelledStreamSnapshot(runtime, {
        assistantCreatedAt: startedAt,
        assistantMessageId: assistantMessageId,
        snapshot: snapshot,
        traceContext: modelTraceContext,
      });
      const reasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
      if (snapshot.text || reasoning.length > 0) {
        const entry = createRuntimeAssistantEntry(snapshot.text, undefined, reasoning,
          state.model ? { providerId: state.model.providerId, modelId: state.model.modelId } : undefined);
        commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
        recordModelHistoryRound(state);
      }
    }
    await runtime.persistAssistantMessage(assistantMessageId, state.userMessageId,
      startedAt, {
        completed: Date.now(),
        error: persistedFailure(finalError, state.turnAbortSignal),
      }, modelTraceContext, model);
    if (isModelContextExceededError(finalError) && await recoverTurnModelContext(runtime, state, finalError, modelStepIndex, options.requestEntries)) {
      return "continue";
    }
    throw finalError;
  }
  state.modelResponse = result.text;
  state.modelStepCount += 1;
  state.tokenCount += getModelUsageTotalTokens(result.usage);
  if (result.usage.cacheReadTokens && result.usage.cacheReadTokens > 0) {
    runtime.messageHistory.setCacheHit(result.usage.cacheReadTokens);
  }
  let toolCalls = runtime.extractToolCallsFromResult(result);
  const providerToolCallCount = toolCalls.length;
  const localTerminal = state.automationCreateLimitReached === true;
  if (state.automationCreateLimitReached && toolCalls.length > 0) {
    runtime.logger?.warn("Ignored tool calls after automation create limit was reached", {
      event: "automation.create_limit.tool_calls_ignored",
      module: "core.runtime",
      status: "completed",
      toolCallCount: toolCalls.length,
    });
    toolCalls = [];
    state.modelResponse = automationLimitResponse(state.input);
  } else if (state.automationCreateLimitReached && !state.modelResponse.trim()) {
    state.modelResponse = automationLimitResponse(state.input);
  }
  const usage = result.usage ?? {};
  const responseLength = state.modelResponse.length;
  const rawFinishReason = readRawFinishReason(result.providerMetadata);
  const continuation = localTerminal ? "none" : classifyOutputTokenContinuation({
    continuationCount: state.turnRequestState.outputTokenContinuationCount,
    finishReason: result.finishReason,
    rawFinishReason,
    toolCallCount: providerToolCallCount,
  });
  logTurnModelDiagnostics(runtime, modelTraceContext, result, usage, rawFinishReason, responseLength, toolCalls);
  if (!localTerminal && continuation === "none" && toolCalls.length === 0
    && isContextExceededFinishReason(result.finishReason, rawFinishReason)) {
    const contextError = createModelContextExceededFinishError({ finishReason: result.finishReason, rawFinishReason });
    if (await recoverTurnModelContext(runtime, state, contextError, modelStepIndex, options.requestEntries)) return "continue";
    throw contextError;
  }
  if (!localTerminal && continuation === "none"
    && isSuspiciousEmptyModelResult(result.finishReason, responseLength, toolCalls.length, usage)) {
    logTurnModelSuspiciousEmpty(runtime, modelTraceContext, result, usage, rawFinishReason, responseLength, toolCalls);
    finalizeSuspiciousEmptyModelResult({
      finishReason: result.finishReason, model: modelSelection,
      providerMetadata: result.providerMetadata, rawFinishReason,
    });
  }
  if (continuation !== "none") result.finishReason = "length";
  for (const reasoning of result.reasoning ?? []) {
    if (!hasAssistantReasoningContent(reasoning)) continue;
    await runtime.persistPart({
      id: createPartId(), sessionID: runtime.sessionId, messageID: assistantMessageId,
      type: "reasoning", text: reasoning.text, metadata: reasoning.providerOptions,
      time: { start: startedAt, end: Date.now() },
    }, modelTraceContext);
  }
  if (state.modelResponse) {
    await runtime.persistPart({
      id: createPartId(), sessionID: runtime.sessionId, messageID: assistantMessageId,
      type: "text", text: state.modelResponse, time: { start: startedAt, end: Date.now() },
    }, modelTraceContext);
  }
  const cacheHit = querySource === "main_turn" ? recordMainTurnCacheHitUsage(runtime, result.usage) : undefined;
  const fileChanges = (querySource === "main_turn" || querySource === "subagent") && toolCalls.length === 0
    ? buildTurnFileChangeSummary(runtime.currentTurnFileChanges) : undefined;
  const completedEvent = runtime.createEvent(SessionEventType.ModelComplete, {
    content: state.modelResponse,
    ...(querySource === "main_turn" && contextWindow !== undefined ? { contextWindow } : {}),
    querySource,
    stopReason: result.finishReason,
    usage: result.usage,
    ...(cacheHit ? { cacheHit } : {}),
    ...(fileChanges ? { fileChanges } : {}),
    ...(querySource === "main_turn" && result.contextUsageBreakdown
      ? { contextUsageBreakdown: result.contextUsageBreakdown } : {}),
    toolCallCount: toolCalls.length,
  }, modelTraceContext);
  await runtime.appendEvent(completedEvent, modelTraceContext);
  state.events.push(completedEvent);
  runtime.lastAssistantCompletedAtMs = Date.now();
  await recordMainTurnModelUsage(runtime, state, {
    assistantMessageId, model, modelTraceContext, networkEventStartIndex, result,
    startedAt, status: "completed", toolCallCount: toolCalls.length,
  });
  state.turnMachine.receiveModelResponse(state.modelResponse);
  throwIfTurnAborted(state.turnAbortSignal);
  runtime.logger?.info("Model request completed", {
    ...traceContextToLogContext(modelTraceContext),
    durationMs: Date.now() - startedAt,
    event: "model.request.completed",
    module: "core.runtime",
    status: "completed",
    totalTokens: state.tokenCount,
    toolCallCount: toolCalls.length,
  });
  const executable = toolCalls.filter((toolCall) => !toolCall.providerExecuted);
  const streamedToolResults = await coordinator.drain(executable);
  if (continuation !== "none") {
    state.turnRequestState.entries = options.requestEntries;
    const committed = await persistCompletedAssistantStep(runtime, state, {
      assistantPersistenceAnchor, assistantCreatedAt: startedAt, assistantMessageId,
      includeEmptyAssistant: false, modelTraceContext, result,
    });
    if (committed) recordModelHistoryRound(state);
    if (continuation === "continue") {
      appendOutputTokenContinuation(state.turnRequestState);
      state.reactiveCompactAttemptedInCurrentModelStep = false;
      state.turnMachine.aggregateResults();
      return "output_continuation";
    }
    const exhausted = createCoreError(CoreErrorType.ModelError, OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE, {
      recoverable: true,
      context: { providerCode: "model_output_limit_exceeded", reason: "model_output_limit_exceeded", source: "provider" },
    });
    const projected = projectExecutionErrorPayload(exhausted);
    completeOutputTokenRecovery(state.turnRequestState);
    await persistOutputTokenLimitErrorCarrier(runtime, state, {
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
    });
    if (state.activeTurn) state.activeTurn.steerable = false;
    throw exhausted;
  }
  completeOutputTokenRecovery(state.turnRequestState);
  if (executable.length === 0) {
    return await finishModelStepWithoutToolCalls.call(runtime, state, {
      assistantPersistenceAnchor, assistantCreatedAt: startedAt, assistantMessageId,
      modelTraceContext, result,
    });
  }
  state.toolCallCount += executable.length;
  if (commitAssistantToTurnRequest(runtime, state, result, executable)) recordModelHistoryRound(state);
  return await executeToolCallsForModelStep.call(runtime, state, {
    assistantCreatedAt: startedAt, assistantMessageId, modelTraceContext, result,
    toolCalls: executable, streamedToolResults,
  });
}

function automationLimitResponse(input: string): string {
  return /\p{Script=Han}/u.test(input)
    ? "定时任务已达到 20 个上限，本次未创建。请前往“自动化”手动删除一个已有任务后重试。"
    : "The limit of 20 scheduled tasks has been reached, so no task was created. Manually delete an existing task on the Automations page, then try again.";
}
