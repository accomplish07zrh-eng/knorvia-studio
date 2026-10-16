// SPDX-License-Identifier: Apache-2.0
// 手动压缩、自动阈值压缩、反应式溢出压缩。失败计数只在真正成功时清零。
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
import type {
  ProviderContextUsageSnapshot,
  RunModelTextRequestOptions,
  TurnResult,
} from "../../types.js";
import { resolveNormalRequestMaxOutputTokens } from "../model-token-limits.js";
import { recordTurnUsageFact } from "../usage-observability.js";
import { autoCompactDecisionLogContext } from "../compact-log-context.js";
import type {
  AutoCompactLoopContext,
  AutoCompactOutcome,
  CompactAttemptOutcome,
  ReactiveCompactLoopContext,
} from "../turn-loop-state.js";
import { layer, report } from "./m02-record.js";
import { findLatestCommittedAssistantUsage } from "../turn-model-step-usage.js";

const RUNTIME_MODULE = "core.runtime";
const FAIL_TEXT = "Compact failed";

type NoticeLevel = "debug" | "info" | "warn";
type CompactNotice = { level: NoticeLevel; message: string; event: string };

// 压缩日志只在文案、事件名和级别上不同，字段骨架由 observe 补齐。
const NOTICE = {
  manualStarted: { level: "info", message: "Compact started", event: "compact.started" },
  manualDone: { level: "info", message: "Compact completed", event: "compact.completed" },
  autoSkipped: { level: "debug", message: "Auto compact skipped", event: "compact.auto.skipped" },
  autoRefill: {
    level: "warn",
    message: "Autocompact rapid-refill breaker tripped",
    event: "compact.rapid_refill_breaker",
  },
  autoStarted: { level: "info", message: "Auto compact started", event: "compact.auto.started" },
  autoDone: { level: "info", message: "Auto compact completed", event: "compact.auto.completed" },
  autoFailed: { level: "warn", message: "Auto compact failed", event: "compact.auto.failed" },
  reactiveSkipped: { level: "warn", message: "", event: "compact.reactive.skipped" },
  reactiveStarted: {
    level: "warn",
    message: "Reactive compact started after model context overflow",
    event: "compact.reactive.started",
  },
  reactiveDone: {
    level: "info",
    message: "Reactive compact completed; retrying model request",
    event: "compact.reactive.completed",
  },
  reactiveFailed: {
    level: "warn",
    message: "Reactive compact failed after model context overflow",
    event: "compact.reactive.failed",
  },
  manualFailed: { level: "warn", message: FAIL_TEXT, event: "compact.failed" },
} as const satisfies Record<string, CompactNotice>;

const REACTIVE_DISABLED = "Reactive compact skipped because compact is disabled";
const REACTIVE_SHORT = "Reactive compact skipped because there is not enough history";

type MessageList = RunModelTextRequestOptions["messages"];
type EntryList = readonly (RuntimeMessageEntry | undefined)[];

function observe(trace: TraceContext, detail: object): Record<string, unknown> {
  return layer(traceContextToLogContext(trace), detail, { module: RUNTIME_MODULE });
}

function notify(
  runtime: AgentRuntimeInternal,
  notice: CompactNotice,
  trace: TraceContext,
  detail: object,
) {
  report(runtime, notice.level, notice.message, observe(trace, detail));
}

function faultText(problem: unknown): string {
  if (problem instanceof Error) return problem.message;
  return String(problem);
}

function bumpFailures(runtime: AgentRuntimeInternal): number {
  const next = runtime.autoCompactConsecutiveFailures + 1;
  runtime.autoCompactConsecutiveFailures = next;
  return next;
}

function pauseQueue(runtime: AgentRuntimeInternal): void {
  runtime.queueAutoDrain = false;
  runtime.queueExternalDrainActive = false;
}

// KD-3：有 context usage 时从助手的下一条起算；否则助手正文仍算进本地增量。
function incrementalOrigin(cursor: number, contextUsageTokens: number | undefined): number {
  if (contextUsageTokens === undefined) return cursor;
  return cursor + 1;
}

function providerOverride(
  messages: MessageList,
  sourceEntries: EntryList,
): AutoCompactTokenOverride | undefined {
  const latest = findLatestCommittedAssistantUsage(sourceEntries);
  if (latest === undefined) return undefined;
  const cursor = latest.messageIndex;
  if (cursor >= messages.length) return undefined;
  const reading: Pick<
    ProviderContextUsageSnapshot,
    "cacheReadTokens" | "cacheWriteTokens" | "contextUsageTokens" | "inputTokens" | "outputTokens"
  > = latest.baseline;
  const { cacheReadTokens, cacheWriteTokens, contextUsageTokens, inputTokens, outputTokens } =
    reading;
  const origin = incrementalOrigin(cursor, contextUsageTokens);
  const incrementalTokenCount = estimateMessageTokens(messages.slice(origin));
  const baseTokenCount = contextUsageTokens ?? inputTokens;
  const source = "provider_usage" as const;
  return {
    baseTokenCount,
    cacheReadTokens,
    cacheWriteTokens,
    contextUsageTokenCount: contextUsageTokens,
    incrementalTokenCount,
    outputTokens,
    source,
    tokenCount: baseTokenCount + incrementalTokenCount,
  };
}

function projectActive(
  runtime: AgentRuntimeInternal,
  entries: readonly RuntimeMessageEntry[],
  model: Model,
) {
  const applyCacheControl = false;
  return buildRuntimeProviderRequestMessages(runtime, { entries, applyCacheControl, model });
}

function policyConfig(runtime: AgentRuntimeInternal, model: Model): AutoCompactPolicyConfig {
  const cap = resolveNormalRequestMaxOutputTokens({
    modelMaxOutputTokens: model.optionSpecs.maxOutputTokens.max,
  });
  const { contextWindow } = model.properties;
  const { compact, modelContextBudgetStrategy } = runtime.config;
  return layer<AutoCompactPolicyConfig>({ contextWindow }, compact, {
    maxOutputTokens: cap,
    modelContextBudgetStrategy,
  });
}

function flooredWindow(raw: number | undefined): number {
  const usable = raw !== undefined && Number.isFinite(raw) && raw > 0;
  if (usable) return Math.floor(raw as number);
  return DEFAULT_COMPACT_CONTEXT_WINDOW;
}

function manualOptions(
  signal: AbortSignal | undefined,
  sourceCommandId: string | undefined,
  selected: Model | undefined,
) {
  const compactReason = CompactReason.UserRequested;
  const phase = CompactPhase.StandaloneTurn;
  return layer(
    { abortSignal: signal, compactReason, phase },
    sourceCommandId ? { sourceCommandId } : undefined,
    selected ? { model: selected } : undefined,
  );
}

export function estimateCurrentModelInputTokens(
  messages: MessageList,
  sourceEntries: EntryList = [],
): number {
  const counted = providerOverride(messages, sourceEntries)?.tokenCount;
  return counted ?? estimateMessageTokens(messages);
}

export async function executeManualCompact(
  this: AgentRuntimeInternal,
  rawInput: string,
  instructions: string | undefined,
  turn: TurnId,
  trace: TraceContext,
  signal?: AbortSignal,
  commandId?: string,
  selected?: Model,
): Promise<TurnResult> {
  const events: SessionEvent[] = [];
  const startedAt = Date.now();
  const runtime: AgentRuntimeInternal = this;
  const activeTurn = runtime.beginActiveTurn(turn, trace, "compact", false);
  const elapsed = () => Date.now() - startedAt;
  const body = async (): Promise<TurnResult> => {
    const inputLength = rawInput.length;
    notify(runtime, NOTICE.manualStarted, trace, {
      event: NOTICE.manualStarted.event,
      inputLength,
      status: "started",
    });
    await runtime.ensureSessionPersisted(rawInput, trace);
    const turnNumber = runtime.turnNumber;
    const input = rawInput;
    const inputId = commandId;
    const inputVisibility = "model-only";
    const opened = runtime.createEvent(
      SessionEventType.TurnStarted,
      { turnNumber, input, inputId, inputVisibility },
      trace,
    );
    await runtime.appendEvent(opened, trace);
    events.push(opened);
    try {
      throwIfTurnAborted(signal);
      const compactResult = await runtime.compactActiveConversation(
        instructions,
        trace,
        events,
        manualOptions(signal, commandId, selected),
      );
      throwIfTurnAborted(signal);
      const turnUsage = createModelUsageSummaryFromEvents(events);
      const response = compactResult.displayText;
      const tokenCount = compactResult.tokenCount;
      const usage = turnUsage;
      const toolCallCount = 0;
      const historyRoundCount = 1;
      const duration = elapsed();
      const resultType = "success";
      const cacheStats = runtime.messageHistory.getCacheStats();
      const finished = runtime.createEvent(
        SessionEventType.TurnComplete,
        {
          response,
          tokenCount,
          usage,
          toolCallCount,
          historyRoundCount,
          duration,
          resultType,
          cacheStats,
          inputId,
        },
        trace,
      );
      await runtime.appendEvent(finished, trace);
      events.push(finished);
      const completedAt = Date.now();
      const status = "completed";
      const traceContext = trace;
      const turnId = turn;
      await recordTurnUsageFact(runtime, {
        completedAt,
        events,
        startedAt,
        status,
        traceContext,
        turnId,
      });
      runtime.turnNumber += 1;
      const projection = await runtime.rebuildProjection();
      const durationMs = elapsed();
      notify(runtime, NOTICE.manualDone, trace, {
        durationMs,
        event: NOTICE.manualDone.event,
        status: "completed",
      });
      const traceId = trace.traceId;
      return { response, turnId, traceId, usage, events, projection };
    } catch (failure) {
      const coreError = createTurnFailureError(failure, signal, FAIL_TEXT);
      const preserve =
        coreError.type === CoreErrorType.TurnCancelled &&
        runtime.activeForegroundExecution?.preserveQueueAutoDrainOnCancel === true;
      if (coreError.type === CoreErrorType.TurnCancelled && preserve === false) pauseQueue(runtime);
      const durationMs = elapsed();
      const turnPhase = "compact";
      const inputId = commandId;
      const traceContext = trace;
      const fallbackMessage = FAIL_TEXT;
      const logEvent = NOTICE.manualFailed.event;
      const logLabel = "Compact";
      const preserveQueueAutoDrainOnCancel = preserve;
      await appendTurnOutcomeEvent(runtime, {
        coreError,
        events,
        durationMs,
        turnPhase,
        inputId,
        traceContext,
        fallbackMessage,
        logEvent,
        logLabel,
        preserveQueueAutoDrainOnCancel,
      });
      const completedAt = Date.now();
      const error = coreError;
      const status = coreError.type === CoreErrorType.TurnCancelled ? "cancelled" : "error";
      const turnId = turn;
      await recordTurnUsageFact(runtime, {
        completedAt,
        error,
        events,
        startedAt,
        status,
        traceContext,
        turnId,
      });
      throw coreError;
    }
  };
  return runWithContextAsync(trace, body).finally(() => {
    runtime.finishActiveTurn(activeTurn);
  });
}

function autoRequest(
  signal: AbortSignal | undefined,
  loop: AutoCompactLoopContext,
  decision: {
    tokenCount: number;
    contextWindow: number;
    threshold: number;
    tokenSource: AutoCompactTokenOverride["source"] | "estimate";
  },
  activeEntries: readonly RuntimeMessageEntry[],
) {
  const { tokenCount, contextWindow, threshold, tokenSource } = decision;
  const compactContextTelemetry = {
    inputTokens: tokenCount,
    policyContextWindowTokens: contextWindow,
    thresholdTokens: threshold,
    tokenSource,
  };
  const { compactReason, phase, model } = loop;
  const trigger = CompactTrigger.Auto;
  const autoCompactThreshold = threshold;
  return layer(
    {
      abortSignal: signal,
      compactContextTelemetry,
      autoCompactThreshold,
      compactReason,
      phase,
      trigger,
      activeEntries,
    },
    model ? { model } : undefined,
  );
}

function autoDetail(
  loop: AutoCompactLoopContext,
  decisionFields: object,
  head: object,
  tail?: object,
) {
  const { compactReason, modelStepIndex, phase } = loop;
  return layer(head, { compactReason, modelStepIndex, phase }, tail, decisionFields);
}

export async function autoCompactIfNeeded(
  this: AgentRuntimeInternal,
  trace: TraceContext,
  events: SessionEvent[],
  signal: AbortSignal | undefined,
  loop: AutoCompactLoopContext,
): Promise<AutoCompactOutcome> {
  throwIfTurnAborted(signal);
  const runtime: AgentRuntimeInternal = this;
  const config = policyConfig(runtime, loop.model);
  const activeEntries = loop.turnRequestState.entries;
  const projection = projectActive(runtime, activeEntries, loop.model);
  const tokenOverride = providerOverride(projection.messages, projection.sourceEntries);
  const messages = projection.messages;
  const consecutiveFailures = runtime.autoCompactConsecutiveFailures;
  const decision = shouldAutoCompact({ messages, config, consecutiveFailures, tokenOverride });
  const decisionFields = autoCompactDecisionLogContext(decision);
  const route =
    decision.shouldCompact === false ? "skip" : loop.rapidRefill.shouldBlock ? "refill" : "run";
  if (route === "skip") {
    const reason = decision.reason;
    notify(
      runtime,
      NOTICE.autoSkipped,
      trace,
      autoDetail(loop, decisionFields, { event: NOTICE.autoSkipped.event }, { reason }),
    );
    return "skipped";
  }
  if (route === "refill") {
    const { compactReason, modelStepIndex, phase } = loop;
    const { consecutiveRapidRefills, toolTurnsSinceCompact } = loop.rapidRefill;
    const status = "failed";
    const trigger = CompactTrigger.Auto;
    notify(
      runtime,
      NOTICE.autoRefill,
      trace,
      layer(
        {
          event: NOTICE.autoRefill.event,
          compactReason,
          consecutiveRapidRefills,
          modelStepIndex,
          phase,
          status,
          toolTurnsSinceCompact,
          trigger,
        },
        decisionFields,
      ),
    );
    return "rapid_refill_blocked";
  }
  notify(
    runtime,
    NOTICE.autoStarted,
    trace,
    autoDetail(loop, decisionFields, { event: NOTICE.autoStarted.event }),
  );
  try {
    const compactResult = await runtime.compactActiveConversation(
      undefined,
      trace,
      events,
      autoRequest(signal, loop, decision, activeEntries),
    );
    if (compactResult.outcome === "skipped") return "skipped";
    loop.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    notify(
      runtime,
      NOTICE.autoDone,
      trace,
      autoDetail(loop, decisionFields, { event: NOTICE.autoDone.event }),
    );
    return "compacted";
  } catch (failure) {
    if (isTurnCancellationError(failure, signal)) throw failure;
    const failureCount = bumpFailures(runtime);
    const errorMessage = faultText(failure);
    notify(
      runtime,
      NOTICE.autoFailed,
      trace,
      autoDetail(loop, decisionFields, {
        errorMessage,
        event: NOTICE.autoFailed.event,
        failureCount,
      }),
    );
    return "failed";
  }
}

function warnReactiveSkip(
  runtime: AgentRuntimeInternal,
  trace: TraceContext,
  originalError: unknown,
  loop: ReactiveCompactLoopContext,
  message: string,
  reason: string,
  extra?: object,
): CompactAttemptOutcome {
  const errorMessage = faultText(originalError);
  const { modelStepIndex, rapidRefillCount } = loop;
  notify(
    runtime,
    { ...NOTICE.reactiveSkipped, message },
    trace,
    layer(
      {
        errorMessage,
        event: NOTICE.reactiveSkipped.event,
        modelStepIndex,
        rapidRefillCount,
        reason,
      },
      extra,
    ),
  );
  return "skipped";
}

export async function reactiveCompactAfterContextExceeded(
  this: AgentRuntimeInternal,
  originalError: unknown,
  trace: TraceContext,
  events: SessionEvent[],
  signal: AbortSignal | undefined,
  loop: ReactiveCompactLoopContext,
): Promise<CompactAttemptOutcome> {
  throwIfTurnAborted(signal);
  const runtime: AgentRuntimeInternal = this;
  if (runtime.config.compact?.enabled === false) {
    return warnReactiveSkip(runtime, trace, originalError, loop, REACTIVE_DISABLED, "disabled");
  }
  const activeEntries = loop.activeEntries ?? loop.turnRequestState.entries;
  const projection = projectActive(runtime, activeEntries, loop.model);
  const activeMessages = projection.messages;
  if (hasEnoughMessagesToCompact(activeMessages) === false) {
    return warnReactiveSkip(
      runtime,
      trace,
      originalError,
      loop,
      REACTIVE_SHORT,
      "not_enough_messages",
      { messageCount: activeMessages.length },
    );
  }
  const tokenOverride = providerOverride(activeMessages, projection.sourceEntries);
  const errorMessage = faultText(originalError);
  const messageCount = activeMessages.length;
  const { modelStepIndex, rapidRefillCount, model } = loop;
  const tokenCount = estimateMessageTokens(activeMessages);
  notify(runtime, NOTICE.reactiveStarted, trace, {
    errorMessage,
    event: NOTICE.reactiveStarted.event,
    messageCount,
    modelStepIndex,
    rapidRefillCount,
    tokenCount,
  });
  try {
    const inputTokens = tokenOverride?.tokenCount ?? tokenCount;
    const policyContextWindowTokens = flooredWindow(model.properties.contextWindow);
    const tokenSource: "estimate" | "provider_usage" = tokenOverride?.source ?? "estimate";
    const compactContextTelemetry = { inputTokens, policyContextWindowTokens, tokenSource };
    const compactReason = CompactReason.ProviderOverflow;
    const initialPromptTooLongCause = originalError;
    const phase = CompactPhase.Reactive;
    const trigger = CompactTrigger.Reactive;
    const compactResult = await runtime.compactActiveConversation(undefined, trace, events, {
      abortSignal: signal,
      compactContextTelemetry,
      compactReason,
      initialPromptTooLongCause,
      phase,
      trigger,
      activeEntries,
      model,
    });
    if (compactResult.outcome === "skipped") return "skipped";
    loop.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    notify(runtime, NOTICE.reactiveDone, trace, {
      event: NOTICE.reactiveDone.event,
      modelStepIndex,
      rapidRefillCount,
    });
    return "compacted";
  } catch (failure) {
    if (isTurnCancellationError(failure, signal)) throw failure;
    const failureCount = bumpFailures(runtime);
    notify(runtime, NOTICE.reactiveFailed, trace, {
      errorMessage: faultText(failure),
      event: NOTICE.reactiveFailed.event,
      failureCount,
      modelStepIndex,
      rapidRefillCount,
    });
    return "failed";
  }
}
