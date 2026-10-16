// SPDX-License-Identifier: Apache-2.0
// 手动、自动、反应式三条压缩路，以及 provider usage 的增量覆盖。
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import {
  CompactPhase,
  CompactReason,
  CompactTrigger,
  CoreErrorType,
  DEFAULT_COMPACT_CONTEXT_WINDOW,
  SessionEventType,
  createModelUsageSummaryFromEvents,
  estimateMessageTokens,
  hasEnoughMessagesToCompact,
  runWithContextAsync,
  shouldAutoCompact,
  traceContextToLogContext,
  type AutoCompactPolicyConfig,
  type AutoCompactTokenOverride,
  type Model,
  type SessionEvent,
  type TraceContext,
  type TurnId,
} from "../../deps.js";
import {
  appendTurnOutcomeEvent,
  buildRuntimeProviderRequestMessages,
  createTurnFailureError,
  isTurnCancellationError,
  throwIfTurnAborted,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RunModelTextRequestOptions, TurnResult } from "../../types.js";
import { resolveNormalRequestMaxOutputTokens } from "../model-token-limits.js";
import { recordTurnUsageFact } from "../usage-observability.js";
import { autoCompactDecisionLogContext } from "./m02-context.js";
import type {
  AutoCompactLoopContext,
  AutoCompactOutcome,
  CompactAttemptOutcome,
  ReactiveCompactLoopContext,
} from "./m02-loop-state.js";
import { phrase, report } from "./m02-record.js";
import { findLatestCommittedAssistantUsage } from "./m02-step-usage.js";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function traced(trace: TraceContext, fields: Record<string, unknown>) {
  return { ...traceContextToLogContext(trace), ...fields, module: "core.runtime" };
}

function buildProviderUsageTokenOverride(
  messages: RunModelTextRequestOptions["messages"],
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[],
): AutoCompactTokenOverride | undefined {
  const latest = findLatestCommittedAssistantUsage(sourceEntries);
  if (!latest || latest.messageIndex >= messages.length) return undefined;
  const { baseline, messageIndex } = latest;
  // 没有 context usage 时，assistant 自己仍算进本地增量。
  const incrementalStart = baseline.contextUsageTokens === undefined ? messageIndex : messageIndex + 1;
  const incrementalTokenCount = estimateMessageTokens(messages.slice(incrementalStart));
  const providerBaseTokenCount = baseline.contextUsageTokens ?? baseline.inputTokens;
  return {
    baseTokenCount: providerBaseTokenCount,
    cacheReadTokens: baseline.cacheReadTokens,
    cacheWriteTokens: baseline.cacheWriteTokens,
    contextUsageTokenCount: baseline.contextUsageTokens,
    incrementalTokenCount,
    outputTokens: baseline.outputTokens,
    source: "provider_usage",
    tokenCount: providerBaseTokenCount + incrementalTokenCount,
  };
}

export function estimateCurrentModelInputTokens(
  messages: RunModelTextRequestOptions["messages"],
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[] = [],
): number {
  return buildProviderUsageTokenOverride(messages, sourceEntries)?.tokenCount ?? estimateMessageTokens(messages);
}

function projectActive(
  runtime: AgentRuntimeInternal,
  entries: readonly RuntimeMessageEntry[],
  model: Model,
) {
  return buildRuntimeProviderRequestMessages(runtime, {
    entries,
    applyCacheControl: false,
    model,
  });
}

export async function executeManualCompact(
  this: AgentRuntimeInternal,
  input: string,
  customInstructions: string | undefined,
  turnId: TurnId,
  turnTraceContext: TraceContext,
  abortSignal?: AbortSignal,
  inputId?: string,
  model?: Model,
): Promise<TurnResult> {
  const events: SessionEvent[] = [];
  const startedAt = Date.now();
  const activeTurn = this.beginActiveTurn(turnId, turnTraceContext, "compact", false);
  const runtime = this;
  return runWithContextAsync(turnTraceContext, async () => {
    report(runtime, "info", phrase(["Compact ", "started"]), traced(turnTraceContext, {
      event: phrase(["compact.", "started"]),
      inputLength: input.length,
      status: "started",
    }));
    await runtime.ensureSessionPersisted(input, turnTraceContext);
    const started = runtime.createEvent(
      SessionEventType.TurnStarted,
      {
        turnNumber: runtime.turnNumber,
        input,
        inputId,
        inputVisibility: "model-only",
      },
      turnTraceContext,
    );
    await runtime.appendEvent(started, turnTraceContext);
    events.push(started);
    try {
      throwIfTurnAborted(abortSignal);
      const compactResult = await runtime.compactActiveConversation(
        customInstructions,
        turnTraceContext,
        events,
        {
          abortSignal,
          compactReason: CompactReason.UserRequested,
          phase: CompactPhase.StandaloneTurn,
          ...(inputId ? { sourceCommandId: inputId } : {}),
          ...(model ? { model } : {}),
        },
      );
      throwIfTurnAborted(abortSignal);
      const turnUsage = createModelUsageSummaryFromEvents(events);
      const completeEvent = runtime.createEvent(
        SessionEventType.TurnComplete,
        {
          response: compactResult.displayText,
          tokenCount: compactResult.tokenCount,
          usage: turnUsage,
          toolCallCount: 0,
          historyRoundCount: 1,
          duration: Date.now() - startedAt,
          resultType: "success",
          cacheStats: runtime.messageHistory.getCacheStats(),
          inputId,
        },
        turnTraceContext,
      );
      await runtime.appendEvent(completeEvent, turnTraceContext);
      events.push(completeEvent);
      await recordTurnUsageFact(runtime, {
        completedAt: Date.now(),
        events,
        startedAt,
        status: "completed",
        traceContext: turnTraceContext,
        turnId,
      });
      runtime.turnNumber += 1;
      const projection = await runtime.rebuildProjection();
      report(runtime, "info", phrase(["Compact ", "completed"]), traced(turnTraceContext, {
        durationMs: Date.now() - startedAt,
        event: phrase(["compact.", "completed"]),
        status: "completed",
      }));
      return {
        response: compactResult.displayText,
        turnId,
        traceId: turnTraceContext.traceId,
        usage: turnUsage,
        events,
        projection,
      };
    } catch (error) {
      const coreError = createTurnFailureError(error, abortSignal, phrase(["Compact ", "failed"]));
      const preserve =
        coreError.type === CoreErrorType.TurnCancelled &&
        runtime.activeForegroundExecution?.preserveQueueAutoDrainOnCancel === true;
      if (coreError.type === CoreErrorType.TurnCancelled && !preserve) {
        runtime.queueAutoDrain = false;
        runtime.queueExternalDrainActive = false;
      }
      await appendTurnOutcomeEvent(runtime, {
        coreError,
        events,
        durationMs: Date.now() - startedAt,
        turnPhase: "compact",
        inputId,
        traceContext: turnTraceContext,
        fallbackMessage: phrase(["Compact ", "failed"]),
        logEvent: phrase(["compact.", "failed"]),
        logLabel: "Compact",
        preserveQueueAutoDrainOnCancel: preserve,
      });
      await recordTurnUsageFact(runtime, {
        completedAt: Date.now(),
        error: coreError,
        events,
        startedAt,
        status: coreError.type === CoreErrorType.TurnCancelled ? "cancelled" : "error",
        traceContext: turnTraceContext,
        turnId,
      });
      throw coreError;
    }
  }).finally(() => {
    runtime.finishActiveTurn(activeTurn);
  });
}

export async function autoCompactIfNeeded(
  this: AgentRuntimeInternal,
  turnTraceContext: TraceContext,
  events: SessionEvent[],
  abortSignal: AbortSignal | undefined,
  context: AutoCompactLoopContext,
): Promise<AutoCompactOutcome> {
  throwIfTurnAborted(abortSignal);
  const runtime = this;
  const config: AutoCompactPolicyConfig = {
    contextWindow: context.model.properties.contextWindow,
    ...runtime.config.compact,
    maxOutputTokens: resolveNormalRequestMaxOutputTokens({
      modelMaxOutputTokens: context.model.optionSpecs.maxOutputTokens.max,
    }),
    modelContextBudgetStrategy: runtime.config.modelContextBudgetStrategy,
  };
  const activeEntries = context.turnRequestState.entries;
  const projection = projectActive(runtime, activeEntries, context.model);
  const tokenOverride = buildProviderUsageTokenOverride(projection.messages, projection.sourceEntries);
  const decision = shouldAutoCompact({
    messages: projection.messages,
    config,
    consecutiveFailures: runtime.autoCompactConsecutiveFailures,
    tokenOverride,
  });
  const decisionFields = autoCompactDecisionLogContext(decision);
  if (!decision.shouldCompact) {
    report(runtime, "debug", phrase(["Auto compact ", "skipped"]), traced(turnTraceContext, {
      event: phrase(["compact.auto.", "skipped"]),
      compactReason: context.compactReason,
      modelStepIndex: context.modelStepIndex,
      phase: context.phase,
      reason: decision.reason,
      ...decisionFields,
    }));
    return "skipped";
  }
  if (context.rapidRefill.shouldBlock) {
    report(runtime, "warn", phrase(["Autocompact ", "rapid-refill breaker tripped"]), traced(turnTraceContext, {
      event: phrase(["compact.", "rapid_refill_breaker"]),
      compactReason: context.compactReason,
      consecutiveRapidRefills: context.rapidRefill.consecutiveRapidRefills,
      modelStepIndex: context.modelStepIndex,
      phase: context.phase,
      status: "failed",
      toolTurnsSinceCompact: context.rapidRefill.toolTurnsSinceCompact,
      trigger: CompactTrigger.Auto,
      ...decisionFields,
    }));
    return "rapid_refill_blocked";
  }
  report(runtime, "info", phrase(["Auto compact ", "started"]), traced(turnTraceContext, {
    event: phrase(["compact.auto.", "started"]),
    compactReason: context.compactReason,
    modelStepIndex: context.modelStepIndex,
    phase: context.phase,
    ...decisionFields,
  }));
  try {
    const compactResult = await runtime.compactActiveConversation(undefined, turnTraceContext, events, {
      abortSignal,
      compactContextTelemetry: {
        inputTokens: decision.tokenCount,
        policyContextWindowTokens: decision.contextWindow,
        thresholdTokens: decision.threshold,
        tokenSource: decision.tokenSource,
      },
      autoCompactThreshold: decision.threshold,
      compactReason: context.compactReason,
      phase: context.phase,
      trigger: CompactTrigger.Auto,
      activeEntries,
      ...(context.model ? { model: context.model } : {}),
    });
    if (compactResult.outcome === "skipped") return "skipped";
    context.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    report(runtime, "info", phrase(["Auto compact ", "completed"]), traced(turnTraceContext, {
      event: phrase(["compact.auto.", "completed"]),
      compactReason: context.compactReason,
      modelStepIndex: context.modelStepIndex,
      phase: context.phase,
      ...decisionFields,
    }));
    return "compacted";
  } catch (error) {
    if (isTurnCancellationError(error, abortSignal)) throw error;
    runtime.autoCompactConsecutiveFailures += 1;
    report(runtime, "warn", phrase(["Auto compact ", "failed"]), traced(turnTraceContext, {
      errorMessage: errorText(error),
      event: phrase(["compact.auto.", "failed"]),
      failureCount: runtime.autoCompactConsecutiveFailures,
      compactReason: context.compactReason,
      modelStepIndex: context.modelStepIndex,
      phase: context.phase,
      ...decisionFields,
    }));
    return "failed";
  }
}

function policyWindow(contextWindow: number | undefined): number {
  if (contextWindow !== undefined && Number.isFinite(contextWindow) && contextWindow > 0) {
    return Math.floor(contextWindow);
  }
  return DEFAULT_COMPACT_CONTEXT_WINDOW;
}

export async function reactiveCompactAfterContextExceeded(
  this: AgentRuntimeInternal,
  originalError: unknown,
  turnTraceContext: TraceContext,
  events: SessionEvent[],
  abortSignal: AbortSignal | undefined,
  context: ReactiveCompactLoopContext,
): Promise<CompactAttemptOutcome> {
  throwIfTurnAborted(abortSignal);
  const runtime = this;
  const skipped = (message: string, reason: string, extra: Record<string, unknown> = {}) => {
    report(runtime, "warn", message, traced(turnTraceContext, {
      errorMessage: errorText(originalError),
      event: phrase(["compact.reactive.", "skipped"]),
      modelStepIndex: context.modelStepIndex,
      rapidRefillCount: context.rapidRefillCount,
      reason,
      ...extra,
    }));
    return "skipped" as const;
  };
  if (runtime.config.compact?.enabled === false) {
    return skipped(
      phrase(["Reactive compact skipped because ", "compact is disabled"]),
      "disabled",
    );
  }
  const activeEntries = context.activeEntries ?? context.turnRequestState.entries;
  const projection = projectActive(runtime, activeEntries, context.model);
  const activeMessages = projection.messages;
  if (!hasEnoughMessagesToCompact(activeMessages)) {
    return skipped(
      phrase(["Reactive compact skipped because ", "there is not enough history"]),
      "not_enough_messages",
      { messageCount: activeMessages.length },
    );
  }
  const tokenOverride = buildProviderUsageTokenOverride(activeMessages, projection.sourceEntries);
  report(runtime, "warn", phrase(["Reactive compact started ", "after model context overflow"]), traced(turnTraceContext, {
    errorMessage: errorText(originalError),
    event: phrase(["compact.reactive.", "started"]),
    messageCount: activeMessages.length,
    modelStepIndex: context.modelStepIndex,
    rapidRefillCount: context.rapidRefillCount,
    tokenCount: estimateMessageTokens(activeMessages),
  }));
  try {
    const compactResult = await runtime.compactActiveConversation(undefined, turnTraceContext, events, {
      abortSignal,
      compactContextTelemetry: {
        inputTokens: tokenOverride?.tokenCount ?? estimateMessageTokens(activeMessages),
        policyContextWindowTokens: policyWindow(context.model.properties.contextWindow),
        tokenSource: tokenOverride?.source ?? "estimate",
      },
      compactReason: CompactReason.ProviderOverflow,
      initialPromptTooLongCause: originalError,
      phase: CompactPhase.Reactive,
      trigger: CompactTrigger.Reactive,
      activeEntries,
      model: context.model,
    });
    if (compactResult.outcome === "skipped") return "skipped";
    context.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    report(runtime, "info", phrase(["Reactive compact completed; ", "retrying model request"]), traced(turnTraceContext, {
      event: phrase(["compact.reactive.", "completed"]),
      modelStepIndex: context.modelStepIndex,
      rapidRefillCount: context.rapidRefillCount,
    }));
    return "compacted";
  } catch (error) {
    if (isTurnCancellationError(error, abortSignal)) throw error;
    runtime.autoCompactConsecutiveFailures += 1;
    report(runtime, "warn", phrase(["Reactive compact failed ", "after model context overflow"]), traced(turnTraceContext, {
      errorMessage: errorText(error),
      event: phrase(["compact.reactive.", "failed"]),
      failureCount: runtime.autoCompactConsecutiveFailures,
      modelStepIndex: context.modelStepIndex,
      rapidRefillCount: context.rapidRefillCount,
    }));
    return "failed";
  }
}
