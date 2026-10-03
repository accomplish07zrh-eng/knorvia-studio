import { restorePermissionGrantMarker } from "../helpers/permission-grant-resume.js";
import { executionStateSchema, resolveExecutionState } from "@knorvia/shared";
import { SESSION_ENTRY_EXECUTION_STATE } from "@knorvia/contracts";
import {
  CoreErrorType, HookEventName, SessionEventType, createCoreError,
  traceContextToLogContext, formatGoalStateForModel, activeSessionMessages,
  hydrateReadFileStateFromSession, hydrateMessageHistoryFromSession, MessageHistoryImpl,
} from "../deps.js";
import type {
  EnvInfo, MessageWithParts, SessionEvent, SessionGoal, SessionInfo, SessionTitleSource,
  TodoItem, TraceContext, TurnState, ToolSchedule,
} from "../deps.js";
import { getLatestActiveSessionMessageId } from "../helpers/index.js";
import type { ResumeSessionOptions, ResumeSessionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  announceSessionShellEnvironmentNoticeAfterResume, getSessionShellSelection,
  restoreSessionShellEnvironmentSelectionForResume,
} from "./session-shell-environment.js";
import { repairPersistedRemoteSessionPaths } from "../helpers/persisted-remote-session-path-repair.js";
import {
  restoreWorkspaceCheckpointEntries, restoreWorkspaceFileRewindEntries,
} from "./workspace-checkpoint-persistence.js";
import { mainTurnCacheHitAggregateFromMessages } from "./turn-model-step-usage.js";

export function toScheduleState(
  this: AgentRuntimeInternal,
  schedule: ToolSchedule,
): TurnState["scheduledTools"] {
  return {
    items: schedule.items.map((item) => ({
      toolCallId: item.toolCallId,
      dependencies: item.dependencies,
      canRunParallel: item.canRunParallel,
    })),
    parallelGroups: schedule.parallelGroups,
    executionOrder: schedule.executionOrder,
  };
}

async function synchronizeResumeTitle(
  this: AgentRuntimeInternal,
  restoredEvents: SessionEvent[],
  session: SessionInfo,
  traceContext: TraceContext,
): Promise<void> {
  const title = session.title.trim();
  if (!title) return;
  const source: SessionTitleSource = session.titleSource ?? "generated";
  if (restoredEvents.some((event) =>
    event.type === SessionEventType.SessionTitleUpdated &&
    event.payload.title === title && event.payload.source === source
  )) return;
  await this.appendEvent(this.createEvent(
    SessionEventType.SessionTitleUpdated,
    { previousTitle: "", source, title },
    traceContext,
  ), traceContext);
}

export async function resumeFromStore(
  this: AgentRuntimeInternal,
  options?: ResumeSessionOptions,
): Promise<ResumeSessionResult> {
  if (!this.sessionStore) {
    throw createCoreError(CoreErrorType.ConfigurationError,
      "Cannot resume session without a session store", { recoverable: false });
  }
  const traceContext = options?.traceContext ?? this.rootTraceContext;
  const persistedSession = await this.sessionStore.getSession(this.sessionId);
  if (!persistedSession || persistedSession.time.archived !== undefined) {
    throw createCoreError(CoreErrorType.SessionNotFound,
      `Session not found: ${this.sessionId}`,
      { context: { sessionId: this.sessionId }, recoverable: true });
  }
  const session = await repairPersistedRemoteSessionPaths(this.sessionStore, persistedSession, {
    onPersistenceFailure: (error) => {
      this.logger?.warn("Session path repair persistence failed; using in-memory repair", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session.path_repair.persist_failed",
        module: "core.runtime",
        sessionId: this.sessionId,
      });
    },
  });
  const messages = options?.persistedMessages ??
    await this.sessionStore.messages({ sessionID: this.sessionId });
  const rewindTargetMessageId = session.revert?.targetMessageID;
  const rewindCreatedMessageId = session.revert?.createdMessageID;
  const rewindKeptMessageIds = session.revert?.keptMessageIDs;
  const branchCutAfterMessageId = session.revert?.branchCutAfterMessageID;
  this.branchGeneration = session.revert?.branchGeneration ?? 0;
  this.runtimeTaskRegistry.setActiveBranchGeneration?.(this.branchGeneration);
  if (messages.length === 0) {
    this.logger?.warn("Session resume loaded zero persisted messages", {
      ...traceContextToLogContext(traceContext),
      directory: session.directory,
      event: "session.resume.persisted_messages_zero",
      module: "core.runtime",
      rewindCreatedMessageId,
      rewindKeptMessageCount: rewindKeptMessageIds?.length ?? 0,
      rewindTargetMessageId,
      sessionId: this.sessionId,
    });
  }
  let persistedEnvInfo: EnvInfo | undefined;
  for (const message of messages) {
    if (message.info.role === "user" && message.info.contextSnapshot?.envInfo) {
      persistedEnvInfo = message.info.contextSnapshot.envInfo;
      this.config.envInfo = persistedEnvInfo;
      break;
    }
  }
  const shellResult = await restoreSessionShellEnvironmentSelectionForResume(this, {
    currentSelection: getSessionShellSelection(this), traceContext,
  });
  this.workingDirectory = session.directory;
  this.config.taskType = session.taskType;
  if (this.config.memory) {
    this.config.memory.workspaceIdentity = session.workspaceID ? String(session.workspaceID) : undefined;
  }
  this.messageHistory = new MessageHistoryImpl();
  this.contextBuilder = null;
  this.contextInitialized = false;
  this.lastEmittedLocalDate = undefined;
  const readFileHydration = await hydrateReadFileStateFromSession({
    branchCutAfterMessageId,
    messages,
    readFileState: this.readFileState,
    rewindCreatedMessageId,
    rewindKeptMessageIds,
    rewindTargetMessageId,
    workingDirectory: this.workingDirectory,
    workspaceRoot: this.workspaceRoot,
  });
  await this.ensureContextInitialized(traceContext);
  const compactCount = await this.recoverInterruptedCompactTimelines(messages, traceContext);
  const hydration = await hydrateMessageHistoryFromSession({
    artifactStore: this.artifactStore,
    branchCutAfterMessageId,
    history: this.messageHistory,
    messages,
    rewindCreatedMessageId,
    rewindKeptMessageIds,
    rewindTargetMessageId,
  });
  announceSessionShellEnvironmentNoticeAfterResume(this, { persistedEnvInfo, restore: shellResult });
  const activeMessages = activeSessionMessages(messages, {
    branchCutAfterMessageId, rewindCreatedMessageId, rewindKeptMessageIds, rewindTargetMessageId,
  });
  const conversationMessages = activeSessionMessages(messages, {
    branchCutAfterMessageId, includeCompactPreservedSegment: false,
    rewindCreatedMessageId, rewindKeptMessageIds, rewindTargetMessageId,
  });
  let latestAssistant: MessageWithParts | undefined;
  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    if (conversationMessages[index].info.role === "assistant") {
      latestAssistant = conversationMessages[index];
      break;
    }
  }
  const latestAssistantInfo = latestAssistant?.info;
  this.latestAssistantMessageId = latestAssistantInfo?.id;
  this.latestAssistantTurnId = latestAssistantInfo?.role === "assistant" ? latestAssistantInfo.anchor?.turnId : undefined;
  this.lastAssistantCompletedAtMs = latestAssistantInfo && "completed" in latestAssistantInfo.time
    ? latestAssistantInfo.time.completed : undefined;
  this.latestConversationMessageId = getLatestActiveSessionMessageId(conversationMessages);
  await restoreWorkspaceCheckpointEntries(this, traceContext);
  await restoreWorkspaceFileRewindEntries(this, traceContext);
  const restoredEvents = await this.eventStore.getEvents(this.sessionId);
  const modeEvents = restoredEvents.filter((event) =>
    event.type === SessionEventType.SessionCreated || event.type === SessionEventType.SessionModeChanged);
  const restoredMode = modeEvents.length ? this.eventReducer.reduce(modeEvents).mode : undefined;
  const mode = options?.modeOverride ?? restoredMode ?? session.permission?.mode;
  if (mode !== undefined) Object.assign(this.config, resolveExecutionState({ mode }));
  const executionEntries = await this.sessionStore.sessionEntries?.({
    sessionID: this.sessionId, type: SESSION_ENTRY_EXECUTION_STATE,
  });
  const savedExecution = executionStateSchema.safeParse(executionEntries?.[executionEntries.length - 1]?.data);
  if (savedExecution.success && options?.modeOverride === undefined) {
    Object.assign(this.config, savedExecution.data);
  }
  await restorePermissionGrantMarker(this, traceContext);
  this.mainTurnCacheHitAggregate = mainTurnCacheHitAggregateFromMessages({ activeMessages, persistedMessages: messages });
  this.turnNumber = activeMessages.filter((message) => message.info.role === "user" && !message.info.summary).length;
  this.sessionPersisted = true;
  await synchronizeResumeTitle.call(this, restoredEvents, session, traceContext);
  await this.discardPersistedPendingSteerInputs(traceContext);
  const recoveredSteerInputCount = 0;
  const todos = await this.readSessionTodosForContext(traceContext);
  const target = await this.readSessionTargetForContext(traceContext);
  this.injectTargetStateIntoMessageHistory(target);
  const event = this.createEvent(SessionEventType.SessionResumed, {
    directory: this.workingDirectory,
    interruptedToolCount: hydration.interruptedToolCount,
    messageCount: hydration.messageCount,
    partCount: hydration.partCount,
    recoveredCompactTimelineCount: compactCount,
    recoveredSteerInputCount,
    resumedTodoCount: todos.length,
    resumedTarget: target?.status,
  }, traceContext);
  await this.appendEvent(event, traceContext);
  const hookResult = await this.runSessionStartHooks("resume", traceContext, options?.abortSignal);
  this.injectHookAdditionalContextIntoMessageHistory(HookEventName.SessionStart, hookResult.additionalContexts);
  if (activeMessages.length === 0) {
    this.logger?.warn("Session resume produced zero active messages", {
      ...traceContextToLogContext(traceContext),
      activeMessageCount: activeMessages.length,
      appliedMessageCount: hydration.appliedMessageCount,
      directory: this.workingDirectory,
      event: "session.resume.active_messages_zero",
      hydrationMessageCount: hydration.messageCount,
      module: "core.runtime",
      persistedMessageCount: messages.length,
      recoveredCompactTimelineCount: compactCount,
      rewindCreatedMessageId,
      rewindKeptMessageCount: rewindKeptMessageIds?.length ?? 0,
      sessionId: this.sessionId,
      rewindTargetMessageId,
    });
  }
  if (hydration.appliedMessageCount === 0) {
    this.logger?.warn("Session resume applied zero history messages", {
      ...traceContextToLogContext(traceContext),
      activeMessageCount: activeMessages.length,
      directory: this.workingDirectory,
      event: "session.resume.applied_messages_zero",
      hydrationMessageCount: hydration.messageCount,
      module: "core.runtime",
      persistedMessageCount: messages.length,
      recoveredCompactTimelineCount: compactCount,
      rewindCreatedMessageId,
      rewindKeptMessageCount: rewindKeptMessageIds?.length ?? 0,
      rewindTargetMessageId,
      sessionId: this.sessionId,
    });
  }
  this.logger?.info("Session resumed", {
    ...traceContextToLogContext(traceContext),
    appliedMessageCount: hydration.appliedMessageCount,
    directory: this.workingDirectory,
    event: "session.resumed",
    interruptedToolCount: hydration.interruptedToolCount,
    messageCount: hydration.messageCount,
    module: "core.runtime",
    partCount: hydration.partCount,
    readFileStateRestoredCount: readFileHydration.restoredCount,
    readFileStateSkippedRangeReadCount: readFileHydration.skippedRangeReadCount,
    readFileStateSkippedUnreadableEditCount: readFileHydration.skippedUnreadableEditCount,
    recoveredCompactTimelineCount: compactCount,
    resumedTodoCount: todos.length,
    resumedTargetStatus: target?.status,
    sessionId: this.sessionId,
    status: "completed",
  });
  return {
    ...hydration,
    directory: this.workingDirectory,
    persistedMessagesReloadRequired: compactCount > 0,
    readFileStateRestoredCount: readFileHydration.restoredCount,
    readFileStateSkippedRangeReadCount: readFileHydration.skippedRangeReadCount,
    readFileStateSkippedUnreadableEditCount: readFileHydration.skippedUnreadableEditCount,
    traceId: traceContext.traceId,
  };
}

export async function readSessionTodosForContext(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<TodoItem[]> {
  if (!this.sessionStore) return [];
  try {
    return await this.sessionStore.readTodos({ sessionID: this.sessionId });
  } catch (error) {
    this.logger?.warn("Failed to read session todos for context", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "todo.context.read.failed",
      module: "core.runtime",
      status: "failed",
    });
    return [];
  }
}

export async function readSessionTargetForContext(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<SessionGoal | null> {
  if (!this.sessionStore) return null;
  try {
    return await this.sessionStore.readTarget({ sessionID: this.sessionId });
  } catch (error) {
    this.logger?.warn("Failed to read session goal for context", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "target.context.read.failed",
      module: "core.runtime",
      status: "failed",
    });
    return null;
  }
}

export function injectTargetStateIntoMessageHistory(
  this: AgentRuntimeInternal,
  target: SessionGoal | null,
): void {
  const formattedTarget = formatGoalStateForModel(target);
  if (!formattedTarget) return;
  this.messageHistory.addAttachment("resume_goal_state", [
    "The current session goal state was restored from session storage.",
    formattedTarget,
    "Use it as the authoritative long-running objective unless a later GoalRead result or runtime goal event updates it.",
    "Do not mark the goal complete unless real evidence shows the objective has been achieved.",
    "A completed plan, todo list, checklist, or planning phase is not completion evidence unless the objective was only to produce that artifact.",
  ].join("\n"));
}
