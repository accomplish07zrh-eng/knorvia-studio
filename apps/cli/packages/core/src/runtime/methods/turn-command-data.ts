import { runtimeInputMetadata } from "../../agent/runtime-input-presentation.js";
import {
  SessionEventType,
  formatLocalIsoDate,
  type MessagePart,
  type ModelUsageSummary,
} from "../deps.js";
import {
  buildDateChangeReminderBody,
  buildRuntimeUserEntriesFromTurn,
  buildUserContentFromTurn,
  runtimeMetadataForSyntheticUserMessageSource,
  summarizeTurnAttachmentsForEvent,
} from "../helpers/index.js";
import { buildReferencedSessionContextReminderBody } from "../../session-context/read-session-context.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import type { TurnCommandLifetime } from "./turn-command-state.js";
import type { AgentRuntimeInternal } from "../internal.js";

export function startedEvent(s: TurnCommandLifetime, executionStartedAt: number) {
  const attachments = summarizeTurnAttachmentsForEvent(s.attachments);
  return s.runtime.createEvent(
    SessionEventType.TurnStarted,
    {
      executionStartedAt,
      turnNumber: s.runtime.turnNumber,
      input: s.displayInput,
      messageId: s.userMessageId,
      inputId: s.options?.inputId,
      ...(s.options?.automationId
        ? { automationId: s.options.automationId }
        : s.options?.offPeakTaskId
          ? {
              offPeakTaskId: s.options.offPeakTaskId,
              ...(s.options.offPeakRunType ? { offPeakRunType: s.options.offPeakRunType } : {}),
            }
          : {}),
      foregroundExecutionId: s.runtime.activeForegroundExecution?.foregroundExecutionId,
      queryId: s.queryId,
      inputSource: s.options?.inputSource,
      inputVisibility: s.options?.inputVisibility,
      originMeta: s.options?.originMeta,
      ...(s.options?.epilogueStart !== undefined ? { epilogueStart: s.options.epilogueStart } : {}),
      ...(s.options?.backgroundSource ? { backgroundSource: s.options.backgroundSource } : {}),
      targetId: s.options?.targetId,
      ...(s.options?.intent ? { intent: s.options.intent } : {}),
      ...(attachments ? { attachments } : {}),
    },
    s.trace,
  );
}

export function hookCompleteEvent(
  s: TurnCommandLifetime,
  response: string,
  usage: ModelUsageSummary | undefined,
) {
  return s.runtime.createEvent(
    SessionEventType.TurnComplete,
    {
      response,
      tokenCount: 0,
      usage,
      toolCallCount: 0,
      duration: Date.now() - s.machine.state.startedAt.getTime(),
      resultType: "success",
      cacheStats: s.runtime.messageHistory.getCacheStats(),
      inputId: s.options?.inputId,
    },
    s.trace,
  );
}

export function regularCompleteEvent(s: TurnCommandLifetime, usage: ModelUsageSummary | undefined) {
  const loop = s.loop!;
  return s.runtime.createEvent(
    SessionEventType.TurnComplete,
    {
      response: loop.modelResponse,
      tokenCount: loop.tokenCount,
      usage,
      toolCallCount: loop.toolCallCount,
      historyRoundCount: loop.historyRoundCount,
      duration: Date.now() - s.machine.state.startedAt.getTime(),
      resultType: "success",
      ...(loop.backgroundSubagentResultConsumed ? { backgroundSubagentResultConsumed: true } : {}),
      ...(loop.workflowResultConsumed ? { workflowResultConsumed: true } : {}),
      cacheStats: s.runtime.messageHistory.getCacheStats(),
      inputId: s.options?.inputId,
    },
    s.trace,
  );
}

export function injectInputReminders(s: TurnCommandLifetime): void {
  if (s.options?.inputVisibility !== "model-only") {
    const referenced = buildReferencedSessionContextReminderBody(s.input);
    if (referenced)
      s.runtime.messageHistory.addAttachment("referenced_session_context", referenced);
  }
  const date = formatLocalIsoDate(s.runtime.now());
  const previous = s.runtime.lastEmittedLocalDate;
  s.runtime.lastEmittedLocalDate = date;
  if (previous && previous !== date)
    s.runtime.messageHistory.addAttachment(
      "date_change",
      buildDateChangeReminderBody(previous, date),
    );
}

type StoredMessages = Awaited<
  ReturnType<NonNullable<AgentRuntimeInternal["sessionStore"]>["messages"]>
>;
export function injectSharedContext(
  s: TurnCommandLifetime,
  messages: StoredMessages,
  reference: { context_id: string },
): void {
  const message = messages.find(
    (message) =>
      message.info.role === "user" &&
      message.info.source === "shared_context" &&
      message.info.metadata &&
      typeof message.info.metadata === "object" &&
      message.info.metadata.contextId === reference.context_id,
  );
  const text = message?.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("shared context content is unavailable");
  s.runtime.messageHistory.addUser(
    text,
    runtimeMetadataForSyntheticUserMessageSource("shared_context"),
  );
}

export function syntheticInput(
  s: TurnCommandLifetime,
  attachments: Parameters<typeof buildUserContentFromTurn>[1],
) {
  const source = s.options?.inputSource ?? "goal-continuation";
  const content = buildUserContentFromTurn(s.input, attachments);
  s.runtime.messageHistory.addUser(
    content,
    runtimeInputMetadata(s.options?.inputPresentation) ??
      runtimeMetadataForSyntheticUserMessageSource(source),
  );
  return source;
}

export function syntheticNotice(s: TurnCommandLifetime, source: ReturnType<typeof syntheticInput>) {
  return {
    messageID: s.userMessageId!,
    metadata: {
      ...(s.options?.targetId ? { targetId: s.options.targetId } : {}),
      ...(s.options?.inputPresentation ? { inputPresentation: s.options.inputPresentation } : {}),
      visibility: "model-only",
    },
    sessionId: s.runtime.sessionId,
    source,
    text: s.input,
    traceContext: s.trace,
    visibility: "model-only" as const,
  };
}

export function addUserEntries(
  s: TurnCommandLifetime,
  attachments: Parameters<typeof buildRuntimeUserEntriesFromTurn>[1],
): void {
  s.runtime.messageHistory.addEntries(
    buildRuntimeUserEntriesFromTurn(s.input, attachments, {
      browserAmbientContext: s.options?.browserAmbientContext,
    }).map((entry) => {
      const metadata = runtimeInputMetadata(s.options?.inputPresentation);
      return entry.kind !== "attachment" && metadata ? { ...entry, metadata } : entry;
    }),
  );
}

export function userPromptOptions(s: TurnCommandLifetime) {
  return {
    intent: s.options?.intent,
    inputPresentation: s.options?.inputPresentation,
    sessionInputId: s.options?.intent?.queueItemId,
    sourceCommandId: s.options?.inputId,
    ...(s.options?.epilogueStart !== undefined ? { epilogueStart: s.options.epilogueStart } : {}),
  };
}

export function loopState(
  s: TurnCommandLifetime,
  model: RegularTurnLoopState["model"],
): RegularTurnLoopState {
  return {
    activeTurn: s.activeTurn,
    ...(s.options?.automationId ? { automationId: s.options.automationId } : {}),
    ...(s.options?.offPeakTaskId ? { offPeakTaskId: s.options.offPeakTaskId } : {}),
    anomalyWarningsInjected: 0,
    backgroundSubagentResultConsumed: s.options?.backgroundSubagentResultConsumed === true,
    workflowResultConsumed: s.options?.workflowResultConsumed === true,
    currentUserMessageId: s.userMessageId!,
    events: s.events,
    input: s.input,
    modelResponse: "",
    model,
    ...(s.options?.modelExecution?.selectionScope === "execution"
      ? { modelSelectionScope: "execution" as const }
      : {}),
    ...(s.options?.modelExecution?.subagents && s.options?.intent?.modelSelection
      ? {
          subagentModelOverride: {
            selection: s.options.intent.modelSelection,
            requestDependencies: s.options.modelExecution.requestDependencies,
            background: s.options.modelExecution.subagents.background,
          },
        }
      : {}),
    modelStepCount: 0,
    historyRoundCount: 0,
    reactiveCompactAttemptedInCurrentModelStep: false,
    repeatedToolCallSignature: undefined,
    repeatedToolCallStreakCount: 0,
    stopHookContinuationCount: 0,
    streamRecoveryRetryCount: 0,
    tokenCount: 0,
    toolCallCount: 0,
    turnRequestState: {
      entries: [...s.runtime.messageHistory.borrowReadOnlyRuntimeEntries()],
      outputTokenContinuationCount: 0,
    },
    toolDisallowlist: s.options?.toolDisallowlist,
    traceId: s.traceId,
    turnAbortSignal: s.signal,
    turnId: s.turnId,
    turnMachine: s.machine,
    turnOutputStyle: s.outputStyle,
    turnTraceContext: s.trace,
    userMessageId: s.userMessageId!,
  };
}

export function targetCompletion(s: TurnCommandLifetime, usage: ModelUsageSummary | undefined) {
  return {
    inputID: s.accountingInputId,
    startedAtMs: s.startedAt,
    startedTarget: s.target,
    traceContext: s.trace,
    usage,
  };
}

export function completedUsage(
  s: TurnCommandLifetime,
  startedAt: number,
  includeUserMessage: boolean,
) {
  return {
    completedAt: Date.now(),
    events: s.events,
    startedAt,
    status: "completed" as const,
    traceContext: s.trace,
    turnId: s.turnId,
    ...(includeUserMessage ? { userMessageId: s.userMessageId } : {}),
  };
}
