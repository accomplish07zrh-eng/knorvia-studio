import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { SessionEventType, getModelUsageTotalTokens, TurnMachineImpl } from "../deps.js";
import type { MessageId } from "../deps.js";
import * as helpers from "../helpers/index.js";
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
import * as output from "./turn-output-token-continuation.js";
import { persistCancelledStreamSnapshot } from "./cancelled-stream-persistence.js";
import * as retry from "./streaming-recovery.js";
import {
  logTurnModelDiagnostics,
  logTurnModelSuspiciousEmpty,
  persistedFailure,
  prepareFailureFacts,
  commitCancelledAssistantSnapshot,
} from "./turn-model-step-records.js";
import { recoverTurnModelContext } from "./turn-model-step-recovery.js";
import * as stepFields from "./turn-model-step-fields.js";
type ModelStepResult = "continue" | "output_continuation" | "break";
export async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: stepFields.ModelStepInputs,
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
  const recoverContext = (error: unknown) =>
    recoverTurnModelContext(runtime, state, error, modelStepIndex, options.requestEntries);
  const modelTraceContext = stepFields.modelStepTrace(state, model, querySource);
  runtime.logModelRequestSteeringContext(
    stepFields.steeringFields(state, options, modelTraceContext),
  );
  const finishPreparation = beginLocalTurnPreparation(modelTraceContext, "persistence");
  await runtime.persistAssistantMessage(
    assistantMessageId,
    state.currentUserMessageId,
    startedAt,
    undefined,
    modelTraceContext,
    model,
  );
  await runtime.persistPart(
    stepFields.stepStartPart(runtime, assistantMessageId),
    modelTraceContext,
  );
  const requestEvent = runtime.createEvent(
    SessionEventType.ModelRequest,
    stepFields.modelRequestPayload(state, options, model, querySource),
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
      stepFields.buildTurnModelRequest(runtime, state, options, {
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
    helpers.throwIfTurnAborted(state.turnAbortSignal);
  } catch (error) {
    await recordMainTurnModelUsage(
      runtime,
      state,
      stepFields.failedUsage(state, usageFields, error),
    );
    const requestFailureId = failedRequestId ?? startedRequestId;
    const toolCount = state.toolCallCount;
    if (
      await coordinator.recoverFromModelFailure(
        error,
        startedAt,
        requestFailureId ? { failedRequestId: requestFailureId } : undefined,
      )
    ) {
      if (state.toolCallCount > toolCount)
        output.completeOutputTokenRecovery(state.turnRequestState);
      return "continue";
    }
    const retryDelayMs = retry.getStartPlanBusyAdmissionRetryDelayMs({
      error,
      providerId: modelSelection.providerId,
      state,
      turnNumber: runtime.turnNumber,
    });
    let finalError = error;
    if (!state.turnAbortSignal.aborted && retryDelayMs !== undefined) {
      const attempt = retry.beginStartPlanBusyAdmissionRetryAttempt(state);
      stepFields.logStartPlanRetry(runtime, modelTraceContext, retryDelayMs, attempt);
      const recoveryOptions = stepFields.recoveryFields(
        assistantMessageId,
        requestFailureId,
        modelTraceContext,
      );
      await retry.emitStreamRecoveryStarted(runtime, state, recoveryOptions, error, attempt);
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
      state.turnMachine = new TurnMachineImpl(state.turnMachine.receiveModelResponse(""));
      state.turnMachine = new TurnMachineImpl(state.turnMachine.aggregateResults());
      await retry.emitStreamRecoveryRetryEvents(
        runtime,
        state,
        stepFields.recoveryFields(assistantMessageId, requestFailureId, modelTraceContext),
        {
          ...attempt,
          discardedReasoningBytes: 0,
          discardedTextBytes: 0,
          reason: "no_tool_committed",
          toolCallIds: [],
        },
      );
      await coordinator.abandon("model_failed");
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      helpers.throwIfTurnAborted(state.turnAbortSignal);
      return "continue";
    }
    if (
      state.streamRecoveryRetryCount > 0 &&
      !state.turnAbortSignal.aborted &&
      retry.isStartPlanBusyStreamRecoveryFailure(error)
    ) {
      finalError = retry.createStartPlanBusyAutoRetryExhaustedError(error);
    }
    await coordinator.abandon(state.turnAbortSignal.aborted ? "cancelled" : "model_failed");
    if (
      state.turnAbortSignal.aborted &&
      helpers.isTurnCancellationError(finalError, state.turnAbortSignal)
    ) {
      await persistCancelledStreamSnapshot(runtime, {
        assistantCreatedAt: startedAt,
        assistantMessageId,
        snapshot,
        traceContext: modelTraceContext,
      });
      commitCancelledAssistantSnapshot(runtime, state, snapshot);
    }
    const failureFacts = prepareFailureFacts(finalError, state);
    await runtime.persistAssistantMessage(
      assistantMessageId,
      state.userMessageId,
      startedAt,
      {
        completed: Date.now(),
        error: persistedFailure(finalError, failureFacts),
      },
      modelTraceContext,
      model,
    );
    if (helpers.isModelContextExceededError(finalError) && (await recoverContext(finalError))) {
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
    stepFields.warnAutomationTools(runtime, toolCalls);
    toolCalls = [];
    state.modelResponse = stepFields.automationLimitResponse(state.input);
  } else if (state.automationCreateLimitReached && state.modelResponse.trim().length === 0) {
    state.modelResponse = stepFields.automationLimitResponse(state.input);
  }
  const usage = result.usage ?? {};
  const responseLength = state.modelResponse.length;
  const rawFinishReason = helpers.readRawFinishReason(result.providerMetadata);
  const continuation = localTerminal
    ? "none"
    : output.classifyOutputTokenContinuation({
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
    helpers.isContextExceededFinishReason(result.finishReason, rawFinishReason)
  ) {
    const contextError = helpers.createModelContextExceededFinishError({
      finishReason: result.finishReason,
      rawFinishReason,
    });
    if (await recoverContext(contextError)) return "continue";
    throw contextError;
  }
  if (
    !localTerminal &&
    continuation === "none" &&
    helpers.isSuspiciousEmptyModelResult(
      result.finishReason,
      responseLength,
      toolCalls.length,
      usage,
    )
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
    helpers.finalizeSuspiciousEmptyModelResult(
      stepFields.suspiciousResultFields(result, modelSelection, rawFinishReason),
    );
  }
  if (continuation !== "none") result.finishReason = "length";
  for (const reasoning of result.reasoning ?? []) {
    if (!output.hasAssistantReasoningContent(reasoning)) continue;
    await runtime.persistPart(
      stepFields.reasoningPart(runtime, assistantMessageId, startedAt, reasoning),
      modelTraceContext,
    );
  }
  if (state.modelResponse.length > 0) {
    await runtime.persistPart(
      stepFields.textPart(runtime, state, assistantMessageId, startedAt),
      modelTraceContext,
    );
  }
  const cacheHit =
    querySource === "main_turn" ? recordMainTurnCacheHitUsage(runtime, result.usage) : undefined;
  const fileChanges =
    (querySource === "main_turn" || querySource === "subagent") && toolCalls.length === 0
      ? helpers.buildTurnFileChangeSummary(runtime.currentTurnFileChanges)
      : undefined;
  const completedEvent = runtime.createEvent(
    SessionEventType.ModelComplete,
    stepFields.modelCompletePayload(
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
  await recordMainTurnModelUsage(
    runtime,
    state,
    stepFields.completedUsage(usageFields, result, toolCalls),
  );
  // machine-red 保留了旧状态身份未被替换的失败；这里接纳状态机返回值。
  state.turnMachine = new TurnMachineImpl(
    state.turnMachine.receiveModelResponse(state.modelResponse),
  );
  helpers.throwIfTurnAborted(state.turnAbortSignal);
  stepFields.logModelCompletion(runtime, state, modelTraceContext, startedAt, toolCalls);
  const executable = toolCalls.filter((toolCall) => !toolCall.providerExecuted);
  const streamedToolResults = await coordinator.drain(executable);
  if (continuation !== "none") {
    state.turnRequestState.entries = options.requestEntries;
    const committed = await persistCompletedAssistantStep(
      runtime,
      state,
      stepFields.completedAssistantFields(
        assistantPersistenceAnchor,
        startedAt,
        assistantMessageId,
        modelTraceContext,
        result,
      ),
    );
    if (committed) recordModelHistoryRound(state);
    if (continuation === "continue") {
      output.appendOutputTokenContinuation(state.turnRequestState);
      state.reactiveCompactAttemptedInCurrentModelStep = false;
      state.turnMachine = new TurnMachineImpl(state.turnMachine.aggregateResults());
      return "output_continuation";
    }
    const exhausted = stepFields.outputLimitError();
    const projected = helpers.projectExecutionErrorPayload(
      exhausted,
      output.OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE,
    );
    output.completeOutputTokenRecovery(state.turnRequestState);
    await persistOutputTokenLimitErrorCarrier(
      runtime,
      state,
      stepFields.outputLimitCarrier(exhausted, projected, result, model, modelTraceContext),
    );
    if (state.activeTurn) state.activeTurn.steerable = false;
    throw exhausted;
  }
  output.completeOutputTokenRecovery(state.turnRequestState);
  if (executable.length === 0) {
    return await finishModelStepWithoutToolCalls.call(
      runtime,
      state,
      stepFields.stopFields(
        assistantPersistenceAnchor,
        startedAt,
        assistantMessageId,
        modelTraceContext,
        result,
      ),
    );
  }
  state.toolCallCount += executable.length;
  if (output.commitAssistantToTurnRequest(runtime, state, result, executable))
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
