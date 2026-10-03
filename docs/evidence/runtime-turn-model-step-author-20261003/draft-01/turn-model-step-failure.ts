import { createRuntimeAssistantEntry } from "../../agent/message-history.js";
import { traceContextToLogContext } from "../deps.js";
import type { MessageId, Model, TraceContext } from "../deps.js";
import { isModelContextExceededError, isTurnCancellationError, projectExecutionErrorPayload,
  throwIfTurnAborted } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelStreamSnapshot } from "../types.js";
import { persistCancelledStreamSnapshot } from "./cancelled-stream-persistence.js";
import { createStreamingToolCoordinator } from "./streaming-tool-coordinator.js";
import { beginStartPlanBusyAdmissionRetryAttempt, createStartPlanBusyAutoRetryExhaustedError,
  emitStreamRecoveryRetryEvents, emitStreamRecoveryStarted, getStartPlanBusyAdmissionRetryDelayMs,
  isStartPlanBusyStreamRecoveryFailure } from "./streaming-recovery.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";
import { recordMainTurnModelUsage } from "./turn-model-step-usage.js";
import { commitTurnRequestEntries, completeOutputTokenRecovery,
  hasAssistantReasoningContent } from "./turn-output-token-continuation.js";
import { recoverTurnModelContext } from "./turn-model-step-recovery.js";

interface FailedStep {
  assistantMessageId: MessageId;
  model: Model;
  providerId: Model["providerId"];
  modelTraceContext: TraceContext;
  startedAt: number;
  networkEventStartIndex: number;
  coordinator: ReturnType<typeof createStreamingToolCoordinator>;
  snapshot: RuntimeModelStreamSnapshot;
  failedRequestId?: string;
}

export async function handleTurnModelFailure(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  originalError: unknown,
  step: FailedStep,
): Promise<"continue"> {
  await recordMainTurnModelUsage(runtime, state, {
    assistantMessageId: step.assistantMessageId,
    error: originalError,
    model: step.model,
    modelTraceContext: step.modelTraceContext,
    networkEventStartIndex: step.networkEventStartIndex,
    startedAt: step.startedAt,
    status: state.turnAbortSignal.aborted ? "cancelled" : "error",
  });
  const toolCount = state.toolCallCount;
  if (await step.coordinator.recoverFromModelFailure(originalError, step.startedAt, {
    ...(step.failedRequestId ? { failedRequestId: step.failedRequestId } : {}),
  })) {
    if (state.toolCallCount > toolCount) completeOutputTokenRecovery(state.turnRequestState);
    return "continue";
  }
  const retryDelayMs = getStartPlanBusyAdmissionRetryDelayMs({
    error: originalError,
    providerId: step.providerId,
    state,
    turnNumber: runtime.turnNumber,
  });
  let finalError = originalError;
  if (!state.turnAbortSignal.aborted && retryDelayMs !== undefined) {
    const attempt = beginStartPlanBusyAdmissionRetryAttempt(state);
    runtime.logger?.warn("Main turn retrying after Start Plan admission busy", {
      ...traceContextToLogContext(step.modelTraceContext),
      event: "model.main_turn.retry_start_plan_admission_busy",
      module: "core.runtime",
      retryDelayMs,
      retryNumber: attempt.retryNumber,
      maxRetries: attempt.maxRetries,
      status: "waiting",
    });
    const recoveryOptions = {
      assistantMessageId: step.assistantMessageId,
      ...(step.failedRequestId ? { failedRequestId: step.failedRequestId } : {}),
      traceContext: step.modelTraceContext,
    };
    await emitStreamRecoveryStarted(runtime, state, recoveryOptions, originalError, attempt);
    await runtime.persistAssistantMessage(step.assistantMessageId, state.userMessageId,
      step.startedAt, { completed: Date.now(), finish: "start_plan_admission_retry_discarded" },
      step.modelTraceContext, step.model);
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
    await step.coordinator.abandon("model_failed");
    await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    throwIfTurnAborted(state.turnAbortSignal);
    return "continue";
  }
  if (state.streamRecoveryRetryCount > 0 && !state.turnAbortSignal.aborted
    && isStartPlanBusyStreamRecoveryFailure(originalError)) {
    finalError = createStartPlanBusyAutoRetryExhaustedError(originalError);
  }
  await step.coordinator.abandon(state.turnAbortSignal.aborted ? "cancelled" : "model_failed");
  if (state.turnAbortSignal.aborted && isTurnCancellationError(finalError, state.turnAbortSignal)) {
    await persistCancelledStreamSnapshot(runtime, {
      assistantCreatedAt: step.startedAt,
      assistantMessageId: step.assistantMessageId,
      snapshot: step.snapshot,
      traceContext: step.modelTraceContext,
    });
    const reasoning = step.snapshot.reasoning.filter(hasAssistantReasoningContent);
    if (step.snapshot.text || reasoning.length > 0) {
      const entry = createRuntimeAssistantEntry(step.snapshot.text, undefined, reasoning,
        state.model ? { providerId: state.model.providerId, modelId: state.model.modelId } : undefined);
      commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
      recordModelHistoryRound(state);
    }
  }
  await runtime.persistAssistantMessage(step.assistantMessageId, state.userMessageId,
    step.startedAt, {
      completed: Date.now(),
      error: persistedFailure(finalError, state.turnAbortSignal),
    }, step.modelTraceContext, step.model);
  if (isModelContextExceededError(finalError) && await recoverTurnModelContext(runtime, state, finalError)) {
    return "continue";
  }
  throw finalError;
}

function persistedFailure(error: unknown, signal: AbortSignal) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : undefined;
  const attribution = projectExecutionErrorPayload(error).attribution;
  return {
    name,
    data: {
      message,
      ...(code ? { code } : {}),
      ...(attribution ? { attribution } : {}),
      ...(isTurnCancellationError(error, signal) ? { turnResult: "cancelled" } : {}),
    },
  };
}
