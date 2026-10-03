import {
  activeSessionMessages,
  evaluateRewindTarget,
  selectActiveConversationBranch,
  RewindScope,
  RewindStrategy,
  SessionEventType,
  hydrateMessageHistoryFromSession,
  hydrateReadFileStateFromSession,
  traceContextToLogContext,
} from "../deps.js";
import type { MessageId, RewindTargetEvaluation, SessionEvent, TraceContext } from "../deps.js";
import {
  buildMessageRewindEvaluationItems,
  formatUnavailableRewindResponse,
  getLatestActiveSessionMessageId,
  throwIfTurnAborted,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ConversationRewindResult } from "../types.js";
import { rebuildContextPrefix } from "./context-refresh.js";
import { mainTurnCacheHitAggregateFromMessages } from "./turn-model-step-usage.js";

type PersistedMessages = Awaited<ReturnType<NonNullable<AgentRuntimeInternal["sessionStore"]>["messages"]>>;
type UnavailablePlan = {
  evaluation?: RewindTargetEvaluation;
  kind: "unavailable";
  reason: string;
  rewindId: string;
};
type AvailablePlan = {
  evaluation: RewindTargetEvaluation;
  branchCutAfterMessageId: MessageId | undefined;
  branchGeneration: number;
  keptMessages: PersistedMessages;
  kind: "available";
  persistedMessages: PersistedMessages;
  removedTurnIds: string[];
  rewindId: string;
};

export async function planConversationRewind(
  this: AgentRuntimeInternal,
  options: { targetMessageId: MessageId; remapAssistantAnchor?: boolean },
): Promise<AvailablePlan | UnavailablePlan> {
  const rewindId = `rewind_${crypto.randomUUID()}`;
  if (!this.sessionStore) {
    return { kind: "unavailable", reason: "conversation_rewind_requires_session_store", rewindId };
  }
  const session = await this.sessionStore.getSession(this.sessionId);
  const persistedMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const activeMessages = selectActiveConversationBranch(persistedMessages, {
    branchCutAfterMessageId: session?.revert?.branchCutAfterMessageID,
    rewindCreatedMessageId: session?.revert?.createdMessageID,
    rewindKeptMessageIds: session?.revert?.keptMessageIDs,
    rewindTargetMessageId: session?.revert?.targetMessageID,
  });
  const requestedIndex = activeMessages.findIndex(message => message.info.id === options.targetMessageId);
  let targetIndex = requestedIndex;
  if (options.remapAssistantAnchor && requestedIndex >= 0) {
    const requested = activeMessages[requestedIndex];
    if (requested.info.role !== "user" || requested.info.summary) {
      targetIndex = -1;
      for (let index = requestedIndex - 1; index >= 0; index--) {
        const candidate = activeMessages[index];
        if (candidate.info.role === "user" && !candidate.info.summary) {
          targetIndex = index;
          break;
        }
      }
    }
  }
  const effectiveTargetMessageId = targetIndex >= 0 ? activeMessages[targetIndex].info.id : options.targetMessageId;
  const evaluation = evaluateRewindTarget({
    items: buildMessageRewindEvaluationItems(activeMessages),
    scope: RewindScope.Conversation,
    targetMessageId: effectiveTargetMessageId,
  });
  if (evaluation.strategy !== RewindStrategy.ActiveChain || targetIndex < 0) {
    return {
      evaluation,
      kind: "unavailable",
      reason: targetIndex < 0
        ? requestedIndex < 0 ? "target_message_not_found" : "target_message_is_not_user_prompt"
        : evaluation.reason,
      rewindId,
    };
  }
  const target = activeMessages[targetIndex];
  if (target.info.role !== "user" || target.info.summary) {
    return { evaluation, kind: "unavailable", reason: "target_message_is_not_user_prompt", rewindId };
  }
  return {
    evaluation,
    branchCutAfterMessageId: persistedMessages.at(-1)!.info.id,
    branchGeneration: (session?.revert?.branchGeneration ?? 0) + 1,
    keptMessages: activeMessages.slice(0, targetIndex),
    kind: "available",
    persistedMessages,
    removedTurnIds: activeMessages.slice(targetIndex).flatMap(message =>
      message.info.anchor?.turnId ? [String(message.info.anchor.turnId)] : []),
    rewindId,
  };
}

async function cancelRemovedBranchTasks(
  this: AgentRuntimeInternal,
  removedTurnIds: string[],
  traceContext: TraceContext,
): Promise<void> {
  const removed = new Set(removedTurnIds);
  if (removed.size === 0) return;
  const tasks = Object.values(this.runtimeTaskRegistry.all()).filter(task =>
    task.branchGeneration === this.branchGeneration &&
    task.turnId !== undefined && removed.has(String(task.turnId)) && task.status === "running");
  for (const task of tasks) {
    const result = await this.stopBackgroundTask(task.taskId, { traceContext });
    if (!result.ok) throw new Error(`rewind background task cancellation failed: ${task.taskId}`);
  }
}

async function rebuildConversationState(
  this: AgentRuntimeInternal,
  options: { plan: AvailablePlan; targetMessageId: MessageId; traceContext: TraceContext },
): Promise<void> {
  const { plan, targetMessageId, traceContext } = options;
  const branch = {
    branchCutAfterMessageId: plan.branchCutAfterMessageId,
    rewindKeptMessageIds: plan.keptMessages.map(message => message.info.id),
    rewindTargetMessageId: targetMessageId,
  };
  this.messageHistory.reset();
  await hydrateMessageHistoryFromSession({
    artifactStore: this.artifactStore,
    history: this.messageHistory,
    messages: plan.persistedMessages,
    ...branch,
  });
  await hydrateReadFileStateFromSession({
    messages: plan.persistedMessages,
    readFileState: this.readFileState,
    workingDirectory: this.workingDirectory,
    workspaceRoot: this.workspaceRoot,
    ...branch,
  });
  rebuildContextPrefix(this);
  this.injectTargetStateIntoMessageHistory(await this.readSessionTargetForContext(traceContext));
  const activeMessages = activeSessionMessages(plan.persistedMessages, branch);
  const currentMessages = activeSessionMessages(plan.persistedMessages, {
    ...branch,
    includeCompactPreservedSegment: false,
  });
  const assistant = currentMessages.findLast(message => message.info.role === "assistant");
  this.latestConversationMessageId = getLatestActiveSessionMessageId(currentMessages);
  this.latestAssistantMessageId = assistant?.info.id;
  this.latestAssistantTurnId = assistant?.info.anchor?.turnId;
  this.lastAssistantCompletedAtMs = assistant && "completed" in assistant.info.time
    ? assistant.info.time.completed
    : undefined;
  this.messageHistory.setCacheMiss();
  this.mainTurnCacheHitAggregate = mainTurnCacheHitAggregateFromMessages({
    activeMessages,
    persistedMessages: plan.persistedMessages,
  });
  this.turnNumber = activeMessages.filter(message => message.info.role === "user" && !message.info.summary).length;
  this.currentTurnFileChanges = new Map();
  this.autoCompactConsecutiveFailures = 0;
}

export async function applyConversationRewind(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    plan: AvailablePlan;
    targetMessageId: MessageId;
    traceContext: TraceContext;
  },
): Promise<ConversationRewindResult> {
  throwIfTurnAborted(options.abortSignal);
  const { plan, targetMessageId, traceContext } = options;
  const { evaluation, branchCutAfterMessageId, branchGeneration, keptMessages, removedTurnIds, rewindId } = plan;
  await cancelRemovedBranchTasks.call(this, removedTurnIds, traceContext);
  await this.sessionStore!.setRevert({
    sessionID: this.sessionId,
    revert: {
      keptMessageIDs: keptMessages.map(message => message.info.id),
      branchCutAfterMessageID: branchCutAfterMessageId,
      branchGeneration,
      messageID: keptMessages.at(-1)?.info.id ?? targetMessageId,
      kind: "conversation_rewind",
      scope: RewindScope.Conversation,
      targetMessageID: targetMessageId,
    },
  });
  this.branchGeneration = branchGeneration;
  this.runtimeTaskRegistry.setActiveBranchGeneration?.(branchGeneration);
  await rebuildConversationState.call(this, { plan, targetMessageId, traceContext });
  const event = this.createEvent(SessionEventType.RewindTriggered, {
    rewindId,
    scope: RewindScope.Conversation,
    strategy: evaluation.strategy,
    targetMessageId,
    compactBoundaryId: evaluation.compactBoundaryId,
    branchCutAfterMessageId,
    branchGeneration,
    reason: evaluation.reason,
  }, traceContext);
  await this.appendEvent(event);
  options.events.push(event);
  this.logger?.info("Conversation rewind applied", {
    ...traceContextToLogContext(traceContext),
    event: "rewind.conversation.completed",
    keptMessageCount: keptMessages.length,
    branchGeneration,
    module: "core.runtime",
    status: "completed",
    targetMessageId,
  });
  return {
    evaluation,
    keptMessageCount: keptMessages.length,
    response: `Rewound conversation to before message ${targetMessageId}.`,
    rewindId,
    strategy: evaluation.strategy,
    targetMessageId,
  };
}

export function unavailableConversationRewind(plan: UnavailablePlan, targetMessageId: MessageId): ConversationRewindResult {
  return {
    evaluation: plan.evaluation,
    keptMessageCount: 0,
    response: formatUnavailableRewindResponse(plan.reason, undefined, targetMessageId),
    rewindId: plan.rewindId,
    strategy: plan.evaluation?.strategy ?? RewindStrategy.Unavailable,
    targetMessageId,
  };
}
