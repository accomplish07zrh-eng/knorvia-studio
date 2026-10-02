import {
  SessionEventType,
  GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
  createChildTraceContext,
  failOpenGoalCompletionVerification,
  failedGoalCompletionVerification,
  formatGoalCompletionVerificationPrompt,
  parseGoalCompletionVerificationText,
  runWithModelInvocationContext,
  traceContextToLogContext,
} from "../deps.js";
import type {
  GoalCompletionVerificationOutput,
  Model,
  SessionEvent,
  SessionGoal,
  TraceContext,
} from "../deps.js";
import { buildRuntimeProviderRequestMessages, throwIfTurnAborted } from "../helpers/index.js";
import { projectMessagesForModelMediaPolicy } from "../helpers/media-budget.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { isRuntimeAttachmentEntry, type RuntimeMessageEntry } from "../../agent/message-history.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "./model-runtime-headers.js";
import { resolveModelRequestSessionTypeFromTaskType } from "./model-request-session-type.js";
import { createRuntimeModel } from "./runtime-model.js";
import { isStartPlanBusyStreamRecoveryFailure } from "./streaming-recovery.js";
import { recordModelUsageFact } from "./usage-observability.js";
import { runTargetCompletionVerificationWithTelemetry } from "./target-completion-verification-telemetry.js";

export interface TargetCompletionVerificationResult {
  target: SessionGoal;
  verification: GoalCompletionVerificationOutput;
}

type VerificationInput = {
  abortSignal?: AbortSignal;
  events: SessionEvent[];
  target: SessionGoal;
  traceContext: TraceContext;
};

type GenerationInput = {
  abortSignal?: AbortSignal;
  events: SessionEvent[];
  messages: Parameters<Model["generateText"]>[0]["messages"];
  model: Model;
  traceContext: TraceContext;
};

export async function verifyActiveTargetCompletionForContinuation(
  this: AgentRuntimeInternal,
  input: {
    abortSignal?: AbortSignal;
    target: SessionGoal;
    traceContext: TraceContext;
  },
): Promise<TargetCompletionVerificationResult | null> {
  if (this.config.targetCompletionVerification?.enabled === false) return null;
  if (!this.sessionStore) return null;
  if (input.target.status !== "active") return null;

  const execute = async (): Promise<TargetCompletionVerificationResult> => {
    const events: SessionEvent[] = [];
    const verification = await verifyTargetCompletion(this, {
      abortSignal: input.abortSignal,
      events,
      target: input.target,
      traceContext: input.traceContext,
    });
    if (!verification.passed) return { target: input.target, verification };

    const previousTarget = await this.readSessionTargetForContext(input.traceContext);
    const completedTarget =
      (await this.sessionStore!.updateTargetStatus({
        sessionID: this.sessionId,
        status: "complete",
      })) ?? input.target;
    await this.recordTargetChanged({
      action: "status_updated",
      previousTarget,
      source: "runtime",
      target: completedTarget,
      traceContext: input.traceContext,
    });
    return { target: completedTarget, verification };
  };
  return runTargetCompletionVerificationWithTelemetry(this, input, execute);
}

async function nextGoalIteration(runtime: AgentRuntimeInternal, targetId: string): Promise<number> {
  const projection = await runtime.rebuildProjection();
  const timeline = projection.targetCompletionVerificationTimeline.filter(
    (item) => item.targetId === targetId,
  );
  return (
    timeline.reduce(
      (previous, item, index) => Math.max(previous, item.goalIteration ?? index + 1),
      0,
    ) + 1
  );
}

function trimPendingAssistantTools(
  entries: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[] {
  const last = entries[entries.length - 1];
  if (
    last &&
    !isRuntimeAttachmentEntry(last) &&
    last.message.role === "assistant" &&
    last.message.toolCalls &&
    last.message.toolCalls.length > 0
  ) {
    return entries.slice(0, -1);
  }
  return entries;
}

async function verifyTargetCompletion(
  runtime: AgentRuntimeInternal,
  input: VerificationInput,
): Promise<GoalCompletionVerificationOutput> {
  const selection = runtime.getSessionModelSelection();
  const model = createRuntimeModel(runtime, { selection });
  const childTrace = createChildTraceContext(input.traceContext, {
    attributes: {
      model: `${model.providerId}/${model.modelId}`,
      querySource: GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
      targetId: input.target.targetID,
    },
  });
  const verificationId = childTrace.spanId ?? childTrace.traceId;
  const foregroundExecutionId = runtime.activeForegroundExecution?.foregroundExecutionId;
  const goalIteration = await nextGoalIteration(runtime, input.target.targetID);
  const assistantId = runtime.latestAssistantMessageId;
  const turnId = runtime.latestAssistantTurnId ?? input.traceContext.turnId;
  const anchor = {
    ...(assistantId ? { anchorAssistantMessageId: assistantId } : {}),
    ...(turnId ? { anchorTurnId: turnId } : {}),
  };
  await runtime.appendEvent(
    runtime.createEvent(
      SessionEventType.TargetCompletionVerification,
      {
        ...anchor,
        ...(foregroundExecutionId ? { foregroundExecutionId } : {}),
        goalIteration,
        status: "started",
        targetId: input.target.targetID,
        verificationId,
      },
      childTrace,
    ),
    childTrace,
  );

  const entries = runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  const trimmed = trimPendingAssistantTools(entries);
  const providerMessages = buildRuntimeProviderRequestMessages(runtime, {
    entries: [
      ...trimmed,
      {
        message: { role: "user", content: formatGoalCompletionVerificationPrompt(input.target) },
      },
    ],
    applyCacheControl: true,
    model,
  }).messages;
  const messages = projectMessagesForModelMediaPolicy(
    providerMessages,
    model.properties.inputFormat,
  ).messages;
  const modelRequestEvent = runtime.createEvent(
    SessionEventType.ModelRequest,
    {
      messages,
      providerId: String(model.providerId),
      modelId: String(model.modelId),
      querySource: GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
      toolCount: 0,
    },
    childTrace,
  );
  await runtime.appendEvent(modelRequestEvent, childTrace);
  input.events.push(modelRequestEvent);
  const modelStartedAt = Date.now();
  const networkEventStartIndex = input.events.length;

  // Setup failures remain outside the recoverable model phase.
  try {
    const result = await generateVerification(runtime, {
      abortSignal: input.abortSignal,
      events: input.events,
      messages,
      model,
      traceContext: childTrace,
    });
    throwIfTurnAborted(input.abortSignal);
    const toolCalls = runtime.extractToolCallsFromResult(result);
    const modelCompleteEvent = runtime.createEvent(
      SessionEventType.ModelComplete,
      {
        content: result.text,
        querySource: GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
        stopReason: result.finishReason,
        toolCallCount: toolCalls.length,
        usage: result.usage,
      },
      childTrace,
    );
    await runtime.appendEvent(modelCompleteEvent, childTrace);
    input.events.push(modelCompleteEvent);
    await recordModelUsageFact(runtime, {
      events: input.events,
      model,
      networkEventStartIndex,
      querySource: GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
      result,
      startedAt: modelStartedAt,
      status: "completed",
      toolCallCount: toolCalls.length,
      traceContext: childTrace,
    });
    const verification =
      toolCalls.length > 0
        ? failOpenGoalCompletionVerification(
            "The completion verifier attempted to call tools instead of returning a verification result.",
          )
        : parseGoalCompletionVerificationText(result.text);
    await runtime.appendEvent(
      runtime.createEvent(
        SessionEventType.TargetCompletionVerification,
        {
          ...anchor,
          ...(foregroundExecutionId ? { foregroundExecutionId } : {}),
          goalIteration,
          status: "completed",
          targetId: input.target.targetID,
          verification,
          verificationId,
        },
        childTrace,
      ),
      childTrace,
    );
    return verification;
  } catch (error) {
    await recordModelUsageFact(runtime, {
      error,
      events: input.events,
      model,
      networkEventStartIndex,
      querySource: GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
      startedAt: modelStartedAt,
      status: input.abortSignal?.aborted ? "cancelled" : "error",
      traceContext: childTrace,
    });
    if (input.abortSignal?.aborted) {
      const preserveQueueAutoDrainOnCancel =
        runtime.activeForegroundExecution?.preserveQueueAutoDrainOnCancel === true;
      await runtime.appendEvent(
        runtime.createEvent(
          SessionEventType.TargetCompletionVerification,
          {
            ...anchor,
            ...(foregroundExecutionId ? { foregroundExecutionId } : {}),
            goalIteration,
            status: "cancelled",
            targetId: input.target.targetID,
            ...(preserveQueueAutoDrainOnCancel ? { preserveQueueAutoDrainOnCancel: true } : {}),
            verification: failedGoalCompletionVerification(
              "Completion verifier request was cancelled.",
            ),
            verificationId,
          },
          childTrace,
        ),
        childTrace,
      );
      await runtime.pauseActiveTargetForCancellation(childTrace);
      throw error;
    }
    runtime.logger?.warn("Goal completion verification failed open", {
      ...traceContextToLogContext(childTrace),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "target.completion_verification.failed_open",
      module: "core.runtime",
      status: "failed",
      targetId: input.target.targetID,
    });
    const verification = failOpenGoalCompletionVerification(
      error instanceof Error
        ? `Completion verifier request failed: ${error.message}`
        : "The completion verifier could not confirm that every goal requirement is complete.",
    );
    await runtime.appendEvent(
      runtime.createEvent(
        SessionEventType.TargetCompletionVerification,
        {
          ...anchor,
          ...(foregroundExecutionId ? { foregroundExecutionId } : {}),
          goalIteration,
          status: "failed_closed",
          targetId: input.target.targetID,
          verification,
          verificationId,
        },
        childTrace,
      ),
      childTrace,
    );
    return verification;
  }
}

async function generateVerification(runtime: AgentRuntimeInternal, input: GenerationInput) {
  const maxAttempts = 3;
  const delays = [1000, 2000];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const invocationContext: Parameters<typeof runWithModelInvocationContext>[0] = {
        metadata: traceContextToLogContext(input.traceContext),
        modelRequestSessionType: resolveModelRequestSessionTypeFromTaskType(
          runtime.config.taskType,
        ),
        modelCall: { operation: "goal_completion_verification" },
        statusSink: runtime.createModelStatusSink(input.traceContext, input.events),
        traceContext: input.traceContext,
        refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(runtime, {
          abortSignal: input.abortSignal,
          model: input.model,
          traceContext: input.traceContext,
        }),
      };
      return await runWithModelInvocationContext(invocationContext, () =>
        input.model.generateText({
          abortSignal: input.abortSignal,
          messages: input.messages,
          options: { maxOutputTokens: input.model.optionSpecs.maxOutputTokens.max },
          tools: [],
        }),
      );
    } catch (error) {
      const retryDelay = delays[attempt - 1];
      if (
        input.abortSignal?.aborted ||
        retryDelay === undefined ||
        !isRetryableVerificationFailure(error, input.model.providerId)
      ) {
        throw error;
      }
      runtime.logger?.warn("Goal completion verification retrying after Start Plan busy", {
        ...traceContextToLogContext(input.traceContext),
        attempt,
        event: "target.completion_verification.retry_start_plan_busy",
        maxAttempts,
        module: "core.runtime",
        retryDelayMs: retryDelay,
        status: "waiting",
      });
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
      throwIfTurnAborted(input.abortSignal);
    }
  }
  throw new Error("Goal completion verification retry loop exhausted unexpectedly.");
}

function isRetryableVerificationFailure(error: unknown, providerId: string): boolean {
  return (
    (providerId === "account:bigmodel-start-plan" || providerId === "account:zai-start-plan") &&
    isStartPlanBusyStreamRecoveryFailure(error)
  );
}
