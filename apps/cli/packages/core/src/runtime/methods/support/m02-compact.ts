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
import { assignKeys, phrase, putIf, report } from "./m02-record.js";
import { findLatestCommittedAssistantUsage } from "./m02-step-usage.js";

const FAIL_TEXT = phrase(["Compact ", "failed"]);
const FAIL_EVENT = phrase(["compact.", "failed"]);
const MANUAL_STARTED = phrase(["Compact ", "started"]);
const MANUAL_STARTED_EVENT = phrase(["compact.", "started"]);
const MANUAL_DONE = phrase(["Compact ", "completed"]);
const MANUAL_DONE_EVENT = phrase(["compact.", "completed"]);
const AUTO_SKIPPED = phrase(["Auto compact ", "skipped"]);
const AUTO_SKIPPED_EVENT = phrase(["compact.auto.", "skipped"]);
const AUTO_REFILL = phrase(["Autocompact ", "rapid-refill breaker tripped"]);
const AUTO_REFILL_EVENT = phrase(["compact.", "rapid_refill_breaker"]);
const AUTO_STARTED = phrase(["Auto compact ", "started"]);
const AUTO_STARTED_EVENT = phrase(["compact.auto.", "started"]);
const AUTO_DONE = phrase(["Auto compact ", "completed"]);
const AUTO_DONE_EVENT = phrase(["compact.auto.", "completed"]);
const AUTO_FAILED = phrase(["Auto compact ", "failed"]);
const AUTO_FAILED_EVENT = phrase(["compact.auto.", "failed"]);
const REACTIVE_DISABLED = phrase(["Reactive compact skipped because ", "compact is disabled"]);
const REACTIVE_SHORT = phrase(["Reactive compact skipped because ", "there is not enough history"]);
const REACTIVE_SKIPPED_EVENT = phrase(["compact.reactive.", "skipped"]);
const REACTIVE_STARTED = phrase(["Reactive compact started ", "after model context overflow"]);
const REACTIVE_STARTED_EVENT = phrase(["compact.reactive.", "started"]);
const REACTIVE_DONE = phrase(["Reactive compact completed; ", "retrying model request"]);
const REACTIVE_DONE_EVENT = phrase(["compact.reactive.", "completed"]);
const REACTIVE_FAILED = phrase(["Reactive compact failed ", "after model context overflow"]);
const REACTIVE_FAILED_EVENT = phrase(["compact.reactive.", "failed"]);

type MessageList = RunModelTextRequestOptions["messages"];
type EntryList = readonly (RuntimeMessageEntry | undefined)[];

function pile<T>(parts: ReadonlyArray<object | null | undefined>): T {
  const bag: Record<string, unknown> = {};
  for (const part of parts) {
    if (part == null) continue;
    const names = Object.keys(part);
    for (const name of names) bag[name] = Reflect.get(part, name);
  }
  return bag as T;
}

function observe(trace: TraceContext, fields: object): Record<string, unknown> {
  return pile([traceContextToLogContext(trace), fields, assignKeys([["module", "core.runtime"]])]);
}

function faultText(problem: unknown): string {
  if (problem instanceof Error) return problem.message;
  return String(problem);
}

function tag<T extends string>(value: T): T {
  return value;
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
  const baseline = latest.baseline;
  const origin = incrementalOrigin(cursor, baseline.contextUsageTokens);
  const added = estimateMessageTokens(messages.slice(origin));
  const base = baseline.contextUsageTokens ?? baseline.inputTokens;
  return assignKeys<AutoCompactTokenOverride>([
    ["baseTokenCount", base],
    ["cacheReadTokens", baseline.cacheReadTokens],
    ["cacheWriteTokens", baseline.cacheWriteTokens],
    ["contextUsageTokenCount", baseline.contextUsageTokens],
    ["incrementalTokenCount", added],
    ["outputTokens", baseline.outputTokens],
    ["source", "provider_usage"],
    ["tokenCount", base + added],
  ]);
}

function projectActive(
  runtime: AgentRuntimeInternal,
  entries: readonly RuntimeMessageEntry[],
  model: Model,
) {
  return buildRuntimeProviderRequestMessages(
    runtime,
    assignKeys([
      ["entries", entries],
      ["applyCacheControl", false],
      ["model", model],
    ]),
  );
}

function policyConfig(runtime: AgentRuntimeInternal, model: Model): AutoCompactPolicyConfig {
  const cap = resolveNormalRequestMaxOutputTokens(
    assignKeys([["modelMaxOutputTokens", model.optionSpecs.maxOutputTokens.max]]),
  );
  return pile<AutoCompactPolicyConfig>([
    assignKeys([["contextWindow", model.properties.contextWindow]]),
    runtime.config.compact,
    assignKeys([
      ["maxOutputTokens", cap],
      ["modelContextBudgetStrategy", runtime.config.modelContextBudgetStrategy],
    ]),
  ]);
}

function flooredWindow(raw: number | undefined): number {
  const usable = raw !== undefined && Number.isFinite(raw) && raw > 0;
  if (usable) return Math.floor(raw as number);
  return DEFAULT_COMPACT_CONTEXT_WINDOW;
}

function manualOptions(
  signal: AbortSignal | undefined,
  commandId: string | undefined,
  selected: Model | undefined,
) {
  const options = assignKeys<Record<string, unknown>>([
    ["abortSignal", signal],
    ["compactReason", CompactReason.UserRequested],
    ["phase", CompactPhase.StandaloneTurn],
  ]);
  putIf(options, "sourceCommandId", commandId, Boolean(commandId));
  putIf(options, "model", selected, Boolean(selected));
  return options;
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
    report(
      runtime,
      "info",
      MANUAL_STARTED,
      observe(
        trace,
        assignKeys([
          ["event", MANUAL_STARTED_EVENT],
          ["inputLength", rawInput.length],
          ["status", "started"],
        ]),
      ),
    );
    await runtime.ensureSessionPersisted(rawInput, trace);
    const opened = runtime.createEvent(
      SessionEventType.TurnStarted,
      assignKeys([
        ["turnNumber", runtime.turnNumber],
        ["input", rawInput],
        ["inputId", commandId],
        ["inputVisibility", "model-only"],
      ]),
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
      const finished = runtime.createEvent(
        SessionEventType.TurnComplete,
        assignKeys([
          ["response", compactResult.displayText],
          ["tokenCount", compactResult.tokenCount],
          ["usage", turnUsage],
          ["toolCallCount", 0],
          ["historyRoundCount", 1],
          ["duration", elapsed()],
          ["resultType", "success"],
          ["cacheStats", runtime.messageHistory.getCacheStats()],
          ["inputId", commandId],
        ]),
        trace,
      );
      await runtime.appendEvent(finished, trace);
      events.push(finished);
      await recordTurnUsageFact(
        runtime,
        assignKeys([
          ["completedAt", Date.now()],
          ["events", events],
          ["startedAt", startedAt],
          ["status", "completed"],
          ["traceContext", trace],
          ["turnId", turn],
        ]),
      );
      runtime.turnNumber += 1;
      const projection = await runtime.rebuildProjection();
      report(
        runtime,
        "info",
        MANUAL_DONE,
        observe(
          trace,
          assignKeys([
            ["durationMs", elapsed()],
            ["event", MANUAL_DONE_EVENT],
            ["status", "completed"],
          ]),
        ),
      );
      return assignKeys<TurnResult>([
        ["response", compactResult.displayText],
        ["turnId", turn],
        ["traceId", trace.traceId],
        ["usage", turnUsage],
        ["events", events],
        ["projection", projection],
      ]);
    } catch (failure) {
      const coreError = createTurnFailureError(failure, signal, FAIL_TEXT);
      const preserve =
        coreError.type === CoreErrorType.TurnCancelled &&
        runtime.activeForegroundExecution?.preserveQueueAutoDrainOnCancel === true;
      if (coreError.type === CoreErrorType.TurnCancelled && preserve === false) pauseQueue(runtime);
      await appendTurnOutcomeEvent(
        runtime,
        assignKeys([
          ["coreError", coreError],
          ["events", events],
          ["durationMs", elapsed()],
          ["turnPhase", "compact"],
          ["inputId", commandId],
          ["traceContext", trace],
          ["fallbackMessage", FAIL_TEXT],
          ["logEvent", FAIL_EVENT],
          ["logLabel", "Compact"],
          ["preserveQueueAutoDrainOnCancel", preserve],
        ]),
      );
      const status = coreError.type === CoreErrorType.TurnCancelled ? "cancelled" : "error";
      await recordTurnUsageFact(
        runtime,
        assignKeys([
          ["completedAt", Date.now()],
          ["error", coreError],
          ["events", events],
          ["startedAt", startedAt],
          ["status", status],
          ["traceContext", trace],
          ["turnId", turn],
        ]),
      );
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
  const telemetry = assignKeys([
    ["inputTokens", decision.tokenCount],
    ["policyContextWindowTokens", decision.contextWindow],
    ["thresholdTokens", decision.threshold],
    ["tokenSource", decision.tokenSource],
  ]);
  const options = assignKeys<Record<string, unknown>>([
    ["abortSignal", signal],
    ["compactContextTelemetry", telemetry],
    ["autoCompactThreshold", decision.threshold],
    ["compactReason", loop.compactReason],
    ["phase", loop.phase],
    ["trigger", CompactTrigger.Auto],
    ["activeEntries", activeEntries],
  ]);
  putIf(options, "model", loop.model, Boolean(loop.model));
  return options;
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
  const decision = shouldAutoCompact(
    assignKeys([
      ["messages", projection.messages],
      ["config", config],
      ["consecutiveFailures", runtime.autoCompactConsecutiveFailures],
      ["tokenOverride", tokenOverride],
    ]),
  );
  const decisionFields = autoCompactDecisionLogContext(decision);
  const route =
    decision.shouldCompact === false ? "skip" : loop.rapidRefill.shouldBlock ? "refill" : "run";
  if (route === "skip") {
    report(
      runtime,
      "debug",
      AUTO_SKIPPED,
      observe(
        trace,
        pile([
          assignKeys([
            ["event", AUTO_SKIPPED_EVENT],
            ["compactReason", loop.compactReason],
            ["modelStepIndex", loop.modelStepIndex],
            ["phase", loop.phase],
            ["reason", decision.reason],
          ]),
          decisionFields,
        ]),
      ),
    );
    return tag("skipped");
  }
  if (route === "refill") {
    report(
      runtime,
      "warn",
      AUTO_REFILL,
      observe(
        trace,
        pile([
          assignKeys([
            ["event", AUTO_REFILL_EVENT],
            ["compactReason", loop.compactReason],
            ["consecutiveRapidRefills", loop.rapidRefill.consecutiveRapidRefills],
            ["modelStepIndex", loop.modelStepIndex],
            ["phase", loop.phase],
            ["status", "failed"],
            ["toolTurnsSinceCompact", loop.rapidRefill.toolTurnsSinceCompact],
            ["trigger", CompactTrigger.Auto],
          ]),
          decisionFields,
        ]),
      ),
    );
    return tag("rapid_refill_blocked");
  }
  report(
    runtime,
    "info",
    AUTO_STARTED,
    observe(
      trace,
      pile([
        assignKeys([
          ["event", AUTO_STARTED_EVENT],
          ["compactReason", loop.compactReason],
          ["modelStepIndex", loop.modelStepIndex],
          ["phase", loop.phase],
        ]),
        decisionFields,
      ]),
    ),
  );
  try {
    const compactResult = await runtime.compactActiveConversation(
      undefined,
      trace,
      events,
      autoRequest(signal, loop, decision, activeEntries),
    );
    if (compactResult.outcome === "skipped") return tag("skipped");
    loop.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    report(
      runtime,
      "info",
      AUTO_DONE,
      observe(
        trace,
        pile([
          assignKeys([
            ["event", AUTO_DONE_EVENT],
            ["compactReason", loop.compactReason],
            ["modelStepIndex", loop.modelStepIndex],
            ["phase", loop.phase],
          ]),
          decisionFields,
        ]),
      ),
    );
    return tag("compacted");
  } catch (failure) {
    if (isTurnCancellationError(failure, signal)) throw failure;
    const failureCount = bumpFailures(runtime);
    report(
      runtime,
      "warn",
      AUTO_FAILED,
      observe(
        trace,
        pile([
          assignKeys([
            ["errorMessage", faultText(failure)],
            ["event", AUTO_FAILED_EVENT],
            ["failureCount", failureCount],
            ["compactReason", loop.compactReason],
            ["modelStepIndex", loop.modelStepIndex],
            ["phase", loop.phase],
          ]),
          decisionFields,
        ]),
      ),
    );
    return tag("failed");
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
  report(
    runtime,
    "warn",
    message,
    observe(
      trace,
      pile([
        assignKeys([
          ["errorMessage", faultText(originalError)],
          ["event", REACTIVE_SKIPPED_EVENT],
          ["modelStepIndex", loop.modelStepIndex],
          ["rapidRefillCount", loop.rapidRefillCount],
          ["reason", reason],
        ]),
        extra,
      ]),
    ),
  );
  return tag("skipped");
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
      assignKeys([["messageCount", activeMessages.length]]),
    );
  }
  const tokenOverride = providerOverride(activeMessages, projection.sourceEntries);
  report(
    runtime,
    "warn",
    REACTIVE_STARTED,
    observe(
      trace,
      assignKeys([
        ["errorMessage", faultText(originalError)],
        ["event", REACTIVE_STARTED_EVENT],
        ["messageCount", activeMessages.length],
        ["modelStepIndex", loop.modelStepIndex],
        ["rapidRefillCount", loop.rapidRefillCount],
        ["tokenCount", estimateMessageTokens(activeMessages)],
      ]),
    ),
  );
  try {
    const inputTokens = tokenOverride?.tokenCount ?? estimateMessageTokens(activeMessages);
    const telemetry = assignKeys([
      ["inputTokens", inputTokens],
      ["policyContextWindowTokens", flooredWindow(loop.model.properties.contextWindow)],
      ["tokenSource", tokenOverride?.source ?? "estimate"],
    ]);
    const compactResult = await runtime.compactActiveConversation(
      undefined,
      trace,
      events,
      assignKeys([
        ["abortSignal", signal],
        ["compactContextTelemetry", telemetry],
        ["compactReason", CompactReason.ProviderOverflow],
        ["initialPromptTooLongCause", originalError],
        ["phase", CompactPhase.Reactive],
        ["trigger", CompactTrigger.Reactive],
        ["activeEntries", activeEntries],
        ["model", loop.model],
      ]),
    );
    if (compactResult.outcome === "skipped") return tag("skipped");
    loop.turnRequestState.entries = compactResult.entries;
    runtime.autoCompactConsecutiveFailures = 0;
    report(
      runtime,
      "info",
      REACTIVE_DONE,
      observe(
        trace,
        assignKeys([
          ["event", REACTIVE_DONE_EVENT],
          ["modelStepIndex", loop.modelStepIndex],
          ["rapidRefillCount", loop.rapidRefillCount],
        ]),
      ),
    );
    return tag("compacted");
  } catch (failure) {
    if (isTurnCancellationError(failure, signal)) throw failure;
    const failureCount = bumpFailures(runtime);
    report(
      runtime,
      "warn",
      REACTIVE_FAILED,
      observe(
        trace,
        assignKeys([
          ["errorMessage", faultText(failure)],
          ["event", REACTIVE_FAILED_EVENT],
          ["failureCount", failureCount],
          ["modelStepIndex", loop.modelStepIndex],
          ["rapidRefillCount", loop.rapidRefillCount],
        ]),
      ),
    );
    return tag("failed");
  }
}
