import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { SessionEventType, getModelUsageTotalTokens } from "../deps.js";
import type { MessageId } from "../deps.js";
import { createRuntimeAssistantEntry } from "../../agent/message-history.js";
import {
  createModelContextExceededFinishError,
  projectExecutionErrorPayload,
  finalizeSuspiciousEmptyModelResult,
  isContextExceededFinishReason,
  isSuspiciousEmptyModelResult,
  readRawFinishReason,
  throwIfTurnAborted,
  isTurnCancellationError,
  isModelContextExceededError,
  buildTurnFileChangeSummary,
} from "../helpers/index.js";
import type { RuntimeModelStreamSnapshot, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { executeToolCallsForModelStep } from "./turn-tools.js";
import {
  captureAssistantPersistenceAnchor,
  finishModelStepWithoutToolCalls,
  persistCompletedAssistantStep,
  persistOutputTokenLimitErrorCarrier,
} from "./turn-stop.js";
import { createStreamingToolCoordinator } from "./streaming-tool-coordinator.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";
import {
  querySourceForTask,
  recordMainTurnCacheHitUsage,
  recordMainTurnModelUsage,
} from "./turn-model-step-usage.js";
import { resolveNormalRequestMaxOutputTokens } from "./model-token-limits.js";
import {
  appendOutputTokenContinuation,
  classifyOutputTokenContinuation,
  commitAssistantToTurnRequest,
  commitTurnRequestEntries,
  completeOutputTokenRecovery,
  hasAssistantReasoningContent,
} from "./turn-output-token-continuation.js";
import { persistCancelledStreamSnapshot } from "./cancelled-stream-persistence.js";
import {
  beginStartPlanBusyAdmissionRetryAttempt,
  createStartPlanBusyAutoRetryExhaustedError,
  emitStreamRecoveryRetryEvents,
  emitStreamRecoveryStarted,
  getStartPlanBusyAdmissionRetryDelayMs,
  isStartPlanBusyStreamRecoveryFailure,
} from "./streaming-recovery.js";
import {
  logTurnModelDiagnostics,
  logTurnModelSuspiciousEmpty,
  persistedFailure,
} from "./turn-model-step-records.js";
import { recoverTurnModelContext } from "./turn-model-step-recovery.js";

import {
  buildTurnModelRequest,
  reasoningPart,
  textPart,
  stepStartPart,
  modelCompletePayload,
  outputLimitCarrier,
  logStartPlanRetry,
  logModelCompletion,
  automationLimitResponse,
  modelStepTrace,
  steeringFields,
  modelRequestPayload,
  outputLimitError,
  failedUsage,
  completedUsage,
  suspiciousResultFields,
  warnAutomationTools,
  stopFields,
  completedAssistantFields,
  recoveryFields,
  type ModelStepInputs,
} from "./turn-model-step-fields.js";

type ModelStepResult = "continue" | "output_continuation" | "break";

export async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: ModelStepInputs,
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
  const modelTraceContext = modelStepTrace(state, model, querySource);
  runtime.logModelRequestSteeringContext(steeringFields(state, options, modelTraceContext));
  const finishPreparation = beginLocalTurnPreparation(modelTraceContext, "persistence");
  await runtime.persistAssistantMessage(
    assistantMessageId,
    state.currentUserMessageId,
    startedAt,
    undefined,
    modelTraceContext,
    model,
  );
  await runtime.persistPart(stepStartPart(runtime, assistantMessageId), modelTraceContext);
  const requestEvent = runtime.createEvent(
    SessionEventType.ModelRequest,
    modelRequestPayload(state, options, model, querySource),
    modelTraceContext,
  );
  await runtime.appendEvent(requestEvent, modelTraceContext);
  state.events.push(requestEvent);
  finishPreparation();
  const coordinator = createStreamingToolCoordinator(runtime, state, {
    assistantMessageId,
    model,
    traceContext: modelTraceContext,
  });
  const networkEventStartIndex = state.events.length;
  const usageFields = {
    assistantMessageId,
    model,
    modelTraceContext,
    networkEventStartIndex,
    startedAt,
  };
  let snapshot: RuntimeModelStreamSnapshot = { reasoning: [], text: "" };
  const streamRecovery = state.pendingStreamRecoveryRequest;
  state.pendingStreamRecoveryRequest = undefined;
  let startedRequestId: string | undefined;
  let failedRequestId: string | undefined;
  let result: RuntimeModelTextResult;
  try {
    const normalBudget = resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens });
    result = await runtime.runModelTextRequest(
      buildTurnModelRequest(runtime, state, options, {
        assistantMessageId,
        model,
        modelTraceContext,
        normalBudget,
        contextWindow,
        streamRecovery,
        coordinator,
        onStreamSnapshot: (next) => {
          snapshot = next;
        },
        onModelNetworkStatus: (event) => {
          if (event.type === "model_request_started") startedRequestId = event.requestId;
          else if (event.type === "model_stream_stalled" || event.type === "model_request_failed") {
            failedRequestId = event.requestId;
          }
        },
      }),
    );
    throwIfTurnAborted(state.turnAbortSignal);
  } catch (error) {
    await recordMainTurnModelUsage(runtime, state, failedUsage(state, usageFields, error));
    const requestFailureId = failedRequestId ?? startedRequestId;
    const toolCount = state.toolCallCount;
    if (
      await coordinator.recoverFromModelFailure(error, startedAt, {
        ...(requestFailureId ? { failedRequestId: requestFailureId } : {}),
      })
    ) {
      if (state.toolCallCount > toolCount) completeOutputTokenRecovery(state.turnRequestState);
      return "continue";
    }
    const retryDelayMs = getStartPlanBusyAdmissionRetryDelayMs({
      error,
      providerId: modelSelection.providerId,
      state,
      turnNumber: runtime.turnNumber,
    });
    let finalError = error;
    if (!state.turnAbortSignal.aborted && retryDelayMs !== undefined) {
      const attempt = beginStartPlanBusyAdmissionRetryAttempt(state);
      logStartPlanRetry(runtime, modelTraceContext, retryDelayMs, attempt);
      const recoveryOptions = recoveryFields(
        assistantMessageId,
        requestFailureId,
        modelTraceContext,
      );
      await emitStreamRecoveryStarted(runtime, state, recoveryOptions, error, attempt);
      await runtime.persistAssistantMessage(
        assistantMessageId,
        state.userMessageId,
        startedAt,
        { completed: Date.now(), finish: "start_plan_admission_retry_discarded" },
        modelTraceContext,
        model,
      );
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
    if (
      state.streamRecoveryRetryCount > 0 &&
      !state.turnAbortSignal.aborted &&
      isStartPlanBusyStreamRecoveryFailure(error)
    ) {
      finalError = createStartPlanBusyAutoRetryExhaustedError(error);
    }
    await coordinator.abandon(state.turnAbortSignal.aborted ? "cancelled" : "model_failed");
    if (
      state.turnAbortSignal.aborted &&
      isTurnCancellationError(finalError, state.turnAbortSignal)
    ) {
      await persistCancelledStreamSnapshot(runtime, {
        assistantCreatedAt: startedAt,
        assistantMessageId,
        snapshot,
        traceContext: modelTraceContext,
      });
      const reasoning = snapshot.reasoning.filter(hasAssistantReasoningContent);
      if (snapshot.text || reasoning.length > 0) {
        const entry = createRuntimeAssistantEntry(
          snapshot.text,
          undefined,
          reasoning,
          state.model
            ? { providerId: state.model.providerId, modelId: state.model.modelId }
            : undefined,
        );
        commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
        recordModelHistoryRound(state);
      }
    }
    await runtime.persistAssistantMessage(
      assistantMessageId,
      state.userMessageId,
      startedAt,
      {
        completed: Date.now(),
        error: persistedFailure(finalError, state),
      },
      modelTraceContext,
      model,
    );
    if (
      isModelContextExceededError(finalError) &&
      (await recoverTurnModelContext(
        runtime,
        state,
        finalError,
        modelStepIndex,
        options.requestEntries,
      ))
    ) {
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
    warnAutomationTools(runtime, toolCalls);
    toolCalls = [];
    state.modelResponse = automationLimitResponse(state.input);
  } else if (state.automationCreateLimitReached && !state.modelResponse.trim()) {
    state.modelResponse = automationLimitResponse(state.input);
  }
  const usage = result.usage ?? {};
  const responseLength = state.modelResponse.length;
  const rawFinishReason = readRawFinishReason(result.providerMetadata);
  const continuation = localTerminal
    ? "none"
    : classifyOutputTokenContinuation({
        continuationCount: state.turnRequestState.outputTokenContinuationCount,
        finishReason: result.finishReason,
        rawFinishReason,
        toolCallCount: providerToolCallCount,
      });
  logTurnModelDiagnostics(
    runtime,
    modelTraceContext,
    result,
    usage,
    rawFinishReason,
    responseLength,
    toolCalls,
  );
  if (
    !localTerminal &&
    continuation === "none" &&
    toolCalls.length === 0 &&
    isContextExceededFinishReason(result.finishReason, rawFinishReason)
  ) {
    const contextError = createModelContextExceededFinishError({
      finishReason: result.finishReason,
      rawFinishReason,
    });
    if (
      await recoverTurnModelContext(
        runtime,
        state,
        contextError,
        modelStepIndex,
        options.requestEntries,
      )
    )
      return "continue";
    throw contextError;
  }
  if (
    !localTerminal &&
    continuation === "none" &&
    isSuspiciousEmptyModelResult(result.finishReason, responseLength, toolCalls.length, usage)
  ) {
    logTurnModelSuspiciousEmpty(
      runtime,
      modelTraceContext,
      result,
      usage,
      rawFinishReason,
      responseLength,
      toolCalls,
    );
    finalizeSuspiciousEmptyModelResult(
      suspiciousResultFields(result, modelSelection, rawFinishReason),
    );
  }
  if (continuation !== "none") result.finishReason = "length";
  for (const reasoning of result.reasoning ?? []) {
    if (!hasAssistantReasoningContent(reasoning)) continue;
    await runtime.persistPart(
      reasoningPart(runtime, assistantMessageId, startedAt, reasoning),
      modelTraceContext,
    );
  }
  if (state.modelResponse) {
    await runtime.persistPart(
      textPart(runtime, state, assistantMessageId, startedAt),
      modelTraceContext,
    );
  }
  const cacheHit =
    querySource === "main_turn" ? recordMainTurnCacheHitUsage(runtime, result.usage) : undefined;
  const fileChanges =
    (querySource === "main_turn" || querySource === "subagent") && toolCalls.length === 0
      ? buildTurnFileChangeSummary(runtime.currentTurnFileChanges)
      : undefined;
  const completedEvent = runtime.createEvent(
    SessionEventType.ModelComplete,
    modelCompletePayload(
      state,
      result,
      querySource,
      contextWindow,
      cacheHit,
      fileChanges,
      toolCalls,
    ),
    modelTraceContext,
  );
  await runtime.appendEvent(completedEvent, modelTraceContext);
  state.events.push(completedEvent);
  runtime.lastAssistantCompletedAtMs = Date.now();
  await recordMainTurnModelUsage(runtime, state, completedUsage(usageFields, result, toolCalls));
  state.turnMachine.receiveModelResponse(state.modelResponse);
  throwIfTurnAborted(state.turnAbortSignal);
  logModelCompletion(runtime, state, modelTraceContext, startedAt, toolCalls);
  const executable = toolCalls.filter((toolCall) => !toolCall.providerExecuted);
  const streamedToolResults = await coordinator.drain(executable);
  if (continuation !== "none") {
    state.turnRequestState.entries = options.requestEntries;
    const committed = await persistCompletedAssistantStep(
      runtime,
      state,
      completedAssistantFields(
        assistantPersistenceAnchor,
        startedAt,
        assistantMessageId,
        modelTraceContext,
        result,
      ),
    );
    if (committed) recordModelHistoryRound(state);
    if (continuation === "continue") {
      appendOutputTokenContinuation(state.turnRequestState);
      state.reactiveCompactAttemptedInCurrentModelStep = false;
      state.turnMachine.aggregateResults();
      return "output_continuation";
    }
    const exhausted = outputLimitError();
    const projected = projectExecutionErrorPayload(exhausted);
    completeOutputTokenRecovery(state.turnRequestState);
    await persistOutputTokenLimitErrorCarrier(
      runtime,
      state,
      outputLimitCarrier(exhausted, projected, result, model, modelTraceContext),
    );
    if (state.activeTurn) state.activeTurn.steerable = false;
    throw exhausted;
  }
  completeOutputTokenRecovery(state.turnRequestState);
  if (executable.length === 0) {
    return await finishModelStepWithoutToolCalls.call(
      runtime,
      state,
      stopFields(
        assistantPersistenceAnchor,
        startedAt,
        assistantMessageId,
        modelTraceContext,
        result,
      ),
    );
  }
  state.toolCallCount += executable.length;
  if (commitAssistantToTurnRequest(runtime, state, result, executable))
    recordModelHistoryRound(state);
  return await executeToolCallsForModelStep.call(runtime, state, {
    assistantCreatedAt: startedAt,
    assistantMessageId,
    modelTraceContext,
    result,
    toolCalls: executable,
    streamedToolResults,
  });
}
