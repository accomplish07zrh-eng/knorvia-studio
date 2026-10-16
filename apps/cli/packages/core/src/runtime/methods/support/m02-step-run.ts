// SPDX-License-Identifier: Apache-2.0
// 回合模型步：遥测包装、请求准备、失败六路、成功收尾。
import { beginLocalTurnPreparation } from "@knorvia/contracts";
import {
  SessionEventType,
  TurnMachineImpl,
  createMessageId,
  getModelUsageTotalTokens,
  type MessageId,
  type ModelToolContract,
} from "../../deps.js";
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import * as helpers from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type {
  DrainedPendingInputDiagnostics,
  RunModelTextRequestOptions,
  RuntimeModelStreamSnapshot,
  RuntimeModelTextResult,
} from "../../types.js";
import { resolveNormalRequestMaxOutputTokens } from "../model-token-limits.js";
import { createStreamingToolCoordinator } from "../streaming-tool-coordinator.js";
import { persistCancelledStreamSnapshot } from "../cancelled-stream-persistence.js";
import * as retry from "../streaming-recovery.js";
import * as output from "./m02-continuation.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";
import * as shapes from "./m02-step-shapes.js";
import {
  commitCancelledAssistantSnapshot,
  logTurnModelDiagnostics,
  logTurnModelSuspiciousEmpty,
  persistedFailure,
  prepareFailureFacts,
} from "./m02-step-records.js";
import { recoverTurnModelContext } from "./m02-step-recover.js";
import {
  querySourceForTask,
  recordMainTurnCacheHitUsage,
  recordMainTurnModelUsage,
} from "./m02-step-usage.js";
import {
  finishModelStepWithoutToolCalls,
  persistCompletedAssistantStep,
  persistOutputTokenLimitErrorCarrier,
  captureAssistantPersistenceAnchor,
} from "./m02-stop.js";
import { executeToolCallsForModelStep } from "./m02-tool-batch.js";

type ModelStepResult = "continue" | "output_continuation" | "break";

type StepOptions = {
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
  latestRealUserMessageIndex?: number;
  messages: RunModelTextRequestOptions["messages"];
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
  recordedMessages: RunModelTextRequestOptions["messages"];
  requestEntries: readonly RuntimeMessageEntry[];
  tools: ModelToolContract[];
};

function outcomeLabel(
  outcome: ModelStepResult,
): "model_completed" | "tool_requested" | "turn_completed" {
  if (outcome === "output_continuation") return "model_completed";
  if (outcome === "continue") return "tool_requested";
  return "turn_completed";
}

export async function runModelBackedTurnStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: StepOptions,
): Promise<ModelStepResult> {
  const assistantMessageId = createMessageId();
  const telemetry = this.agentTelemetry.step({
    stepId: assistantMessageId,
    stepIndex: state.modelStepCount,
  });
  return telemetry.run(async () => {
    try {
      const outcome = await performModelStep(this, state, options, assistantMessageId);
      telemetry.finishCompleted(outcomeLabel(outcome));
      return outcome;
    } catch (error) {
      if (helpers.isTurnCancellationError(error, state.turnAbortSignal)) {
        telemetry.finishCancelled("abort_signal");
      } else {
        telemetry.finishFailed("unhandled", "unknown", error);
      }
      throw error;
    }
  });
}

function adopt(state: RegularTurnLoopState, next: unknown): void {
  state.turnMachine = new TurnMachineImpl(next as never);
}

export async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: shapes.ModelStepInputs,
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
  const modelTraceContext = shapes.modelStepTrace(state, model, querySource);
  runtime.logModelRequestSteeringContext(shapes.steeringFields(state, options, modelTraceContext));
  const finishPreparation = beginLocalTurnPreparation(modelTraceContext, "persistence");
  await runtime.persistAssistantMessage(
    assistantMessageId,
    state.currentUserMessageId,
    startedAt,
    undefined,
    modelTraceContext,
    model,
  );
  await runtime.persistPart(shapes.stepStartPart(runtime, assistantMessageId), modelTraceContext);
  const requestEvent = runtime.createEvent(
    SessionEventType.ModelRequest,
    shapes.modelRequestPayload(state, options, model, querySource),
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
  const recoverContext = (error: unknown) =>
    recoverTurnModelContext(runtime, state, error, modelStepIndex, options.requestEntries);
  try {
    const normalBudget = resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens });
    result = await runtime.runModelTextRequest(
      shapes.buildTurnModelRequest(runtime, state, options, {
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
    await recordMainTurnModelUsage(runtime, state, shapes.failedUsage(state, usageFields, error));
    const requestFailureId = failedRequestId ?? startedRequestId;
    const toolCountBefore = state.toolCallCount;
    const recovered = await coordinator.recoverFromModelFailure(
      error,
      startedAt,
      requestFailureId ? { failedRequestId: requestFailureId } : undefined,
    );
    if (recovered) {
      if (state.toolCallCount > toolCountBefore) output.completeOutputTokenRecovery(state.turnRequestState);
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
      shapes.logStartPlanRetry(runtime, modelTraceContext, retryDelayMs, attempt);
      await retry.emitStreamRecoveryStarted(
        runtime,
        state,
        shapes.recoveryFields(assistantMessageId, requestFailureId, modelTraceContext),
        error,
        attempt,
      );
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
      adopt(state, state.turnMachine.receiveModelResponse(""));
      adopt(state, state.turnMachine.aggregateResults());
      await retry.emitStreamRecoveryRetryEvents(
        runtime,
        state,
        shapes.recoveryFields(assistantMessageId, requestFailureId, modelTraceContext),
        {
          ...attempt,
          discardedReasoningBytes: 0,
          discardedTextBytes: 0,
          reason: "no_tool_committed",
          toolCallIds: [],
        },
      );
      await coordinator.abandon("model_failed");
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs);
      });
      helpers.throwIfTurnAborted(state.turnAbortSignal);
      return "continue";
    }
    const busyExhausted =
      state.streamRecoveryRetryCount > 0 &&
      !state.turnAbortSignal.aborted &&
      retry.isStartPlanBusyStreamRecoveryFailure(error);
    if (busyExhausted) finalError = retry.createStartPlanBusyAutoRetryExhaustedError(error);
    await coordinator.abandon(state.turnAbortSignal.aborted ? "cancelled" : "model_failed");
    const cancelled =
      state.turnAbortSignal.aborted && helpers.isTurnCancellationError(finalError, state.turnAbortSignal);
    if (cancelled) {
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
      { completed: Date.now(), error: persistedFailure(finalError, failureFacts) },
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
  const usageNow = result.usage;
  if (usageNow.cacheReadTokens && usageNow.cacheReadTokens > 0) {
    runtime.messageHistory.setCacheHit(usageNow.cacheReadTokens);
  }
  let toolCalls = runtime.extractToolCallsFromResult(result);
  const providerToolCallCount = toolCalls.length;
  const localTerminal = state.automationCreateLimitReached === true;
  if (state.automationCreateLimitReached && toolCalls.length > 0) {
    shapes.warnAutomationTools(runtime, toolCalls);
    toolCalls = [];
    state.modelResponse = shapes.automationLimitResponse(state.input);
  } else if (state.automationCreateLimitReached && state.modelResponse.trim().length === 0) {
    state.modelResponse = shapes.automationLimitResponse(state.input);
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
  logTurnModelDiagnostics(runtime, modelTraceContext, result, usage, rawFinishReason, responseLength, toolCalls);
  const contextStop =
    !localTerminal &&
    continuation === "none" &&
    toolCalls.length === 0 &&
    helpers.isContextExceededFinishReason(result.finishReason, rawFinishReason);
  if (contextStop) {
    const contextError = helpers.createModelContextExceededFinishError({
      finishReason: result.finishReason,
      rawFinishReason,
    });
    if (await recoverContext(contextError)) return "continue";
    throw contextError;
  }
  const suspicious =
    !localTerminal &&
    continuation === "none" &&
    helpers.isSuspiciousEmptyModelResult(result.finishReason, responseLength, toolCalls.length, usage);
  if (suspicious) {
    logTurnModelSuspiciousEmpty(runtime, modelTraceContext, result, usage, rawFinishReason, responseLength, toolCalls);
    helpers.finalizeSuspiciousEmptyModelResult(shapes.suspiciousResultFields(result, modelSelection, rawFinishReason));
  }
  if (continuation !== "none") result.finishReason = "length";
  for (const reasoning of result.reasoning ?? []) {
    if (!output.hasAssistantReasoningContent(reasoning)) continue;
    await runtime.persistPart(
      shapes.reasoningPart(runtime, assistantMessageId, startedAt, reasoning),
      modelTraceContext,
    );
  }
  if (state.modelResponse.length > 0) {
    await runtime.persistPart(shapes.textPart(runtime, state, assistantMessageId, startedAt), modelTraceContext);
  }
  const cacheHit = querySource === "main_turn" ? recordMainTurnCacheHitUsage(runtime, result.usage) : undefined;
  const fileChanges =
    (querySource === "main_turn" || querySource === "subagent") && toolCalls.length === 0
      ? helpers.buildTurnFileChangeSummary(runtime.currentTurnFileChanges)
      : undefined;
  const completedEvent = runtime.createEvent(
    SessionEventType.ModelComplete,
    shapes.modelCompletePayload(state, result, querySource, contextWindow, cacheHit, fileChanges, toolCalls),
    modelTraceContext,
  );
  await runtime.appendEvent(completedEvent, modelTraceContext);
  state.events.push(completedEvent);
  runtime.lastAssistantCompletedAtMs = Date.now();
  await recordMainTurnModelUsage(runtime, state, shapes.completedUsage(usageFields, result, toolCalls));
  adopt(state, state.turnMachine.receiveModelResponse(state.modelResponse));
  helpers.throwIfTurnAborted(state.turnAbortSignal);
  shapes.logModelCompletion(runtime, state, modelTraceContext, startedAt, toolCalls);
  const executable = toolCalls.filter((toolCall) => !toolCall.providerExecuted);
  const streamedToolResults = await coordinator.drain(executable);
  if (continuation !== "none") {
    state.turnRequestState.entries = options.requestEntries;
    const committed = await persistCompletedAssistantStep(
      runtime,
      state,
      shapes.completedAssistantFields(
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
      adopt(state, state.turnMachine.aggregateResults());
      return "output_continuation";
    }
    const exhausted = shapes.outputLimitError();
    const projected = helpers.projectExecutionErrorPayload(exhausted, output.OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE);
    output.completeOutputTokenRecovery(state.turnRequestState);
    await persistOutputTokenLimitErrorCarrier(
      runtime,
      state,
      shapes.outputLimitCarrier(exhausted, projected, result, model, modelTraceContext),
    );
    if (state.activeTurn) state.activeTurn.steerable = false;
    throw exhausted;
  }
  output.completeOutputTokenRecovery(state.turnRequestState);
  if (executable.length === 0) {
    return finishModelStepWithoutToolCalls.call(
      runtime,
      state,
      shapes.stopFields(assistantPersistenceAnchor, startedAt, assistantMessageId, modelTraceContext, result),
    );
  }
  state.toolCallCount += executable.length;
  if (output.commitAssistantToTurnRequest(runtime, state, result, executable)) recordModelHistoryRound(state);
  return executeToolCallsForModelStep.call(runtime, state, {
    assistantCreatedAt: startedAt,
    assistantMessageId,
    modelTraceContext,
    result,
    toolCalls: executable,
    streamedToolResults,
  });
}
