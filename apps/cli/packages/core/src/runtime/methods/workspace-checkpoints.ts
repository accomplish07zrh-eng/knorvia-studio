import {
  type MessageId,
  type MessageWithParts,
  type SessionId,
  type TraceContext,
  type WorkspaceCheckpointArtifact,
  CoreErrorType,
  RewindScope,
  RewindStrategy,
  SessionEventType,
  createCoreError,
  createMessageId,
  createPartId,
  getCurrentTraceContext,
  parseCheckpointCreatedPayload,
  parseWorkspaceCheckpointArtifact,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type {
  WorkspaceRewindRestoredFile,
  WorkspaceForkResult,
  WorkspaceCheckpointSummary,
} from "../types.js";
import {
  selectCheckpointForRewind,
  previewTextFromMessage,
  formatWorkspaceForkNoticeBody,
  cloneMessageForFork,
  clonePartForFork,
} from "../helpers/index.js";
import {
  buildForkHistoryMessages,
  copyGoalStateForFork,
  createForkedSession,
  forkSourceMessagesForSession,
  resolveForkHistoryEndIndex,
} from "./session-fork.js";
import { forkWorkspaceAtMessage, restoreWorkspaceCheckpointFiles } from "./workspace-fork.js";

export async function restoreWorkspaceCheckpointArtifact(
  this: AgentRuntimeInternal,
  artifact: WorkspaceCheckpointArtifact,
  traceContext: TraceContext,
  abortSignal?: AbortSignal,
): Promise<WorkspaceRewindRestoredFile[]> {
  return await restoreWorkspaceCheckpointFiles(this, artifact.files, traceContext, abortSignal);
}

export async function copySessionMessagesForFork(
  this: AgentRuntimeInternal,
  options: {
    forkedSessionId: SessionId;
    messages: MessageWithParts[];
    traceContext: TraceContext;
  },
): Promise<{
  copiedMessageCount: number;
  messageIdMap: Map<MessageId, MessageId>;
}> {
  const messageIdMap = new Map<MessageId, MessageId>();
  let copiedMessageCount = 0;
  if (!this.sessionStore) return { copiedMessageCount, messageIdMap };

  for (const message of options.messages) {
    const nextMessageId = createMessageId();
    messageIdMap.set(message.info.id, nextMessageId);
    await this.persistMessage(
      cloneMessageForFork(message.info, {
        forkedSessionId: options.forkedSessionId,
        messageIdMap,
        nextMessageId,
      }),
      options.traceContext,
      { sessionID: message.info.sessionID, id: message.info.id },
    );
    for (const part of message.parts) {
      await this.persistPart(
        clonePartForFork(part, {
          forkedSessionId: options.forkedSessionId,
          nextMessageId,
          messageIdMap,
        }),
        options.traceContext,
        { sessionID: part.sessionID, id: part.id },
      );
    }
    copiedMessageCount += 1;
  }
  return { copiedMessageCount, messageIdMap };
}

export async function listWorkspaceCheckpoints(
  this: AgentRuntimeInternal,
  options: { limit?: number } = {},
): Promise<WorkspaceCheckpointSummary[]> {
  const events = await this.eventStore.getEvents(this.sessionId);
  const previews = await this.loadCheckpointMessagePreviews();
  const parsed = events
    .filter((event) => event.type === SessionEventType.CheckpointCreated)
    .map((event) => ({
      checkpoint: parseCheckpointCreatedPayload(event.payload),
      timestamp: event.timestamp,
    }));
  const checkpoints: WorkspaceCheckpointSummary[] = [];
  for (const { checkpoint, timestamp } of parsed) {
    if (checkpoint.scope !== RewindScope.Workspace && checkpoint.scope !== RewindScope.Both)
      continue;
    checkpoints.push({
      checkpointId: checkpoint.checkpointId,
      compactBoundaryId: checkpoint.compactBoundaryId,
      coveredByCompact: checkpoint.coveredByCompact,
      createdAt: timestamp,
      diffRef: checkpoint.diffRef,
      fileCount: checkpoint.fileCount,
      messageId: checkpoint.messageId,
      targetMessageId: checkpoint.targetMessageId,
      toolMessageId: checkpoint.toolMessageId,
      preview: previews.get(checkpoint.targetMessageId ?? checkpoint.messageId),
      scope: checkpoint.scope,
      snapshotRef: checkpoint.snapshotRef,
    });
  }
  checkpoints.reverse();
  return options.limit && options.limit > 0 ? checkpoints.slice(0, options.limit) : checkpoints;
}

export async function forkWorkspaceFromCheckpoint(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    forkedSessionId?: SessionId;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    traceContext?: TraceContext;
  } = {},
): Promise<WorkspaceForkResult> {
  const traceContext = options.traceContext ?? getCurrentTraceContext() ?? this.rootTraceContext;
  if (options.targetMessageId && !options.targetCheckpointId) {
    return await forkWorkspaceAtMessage.call(this, {
      abortSignal: options.abortSignal,
      forkedSessionId: options.forkedSessionId,
      targetMessageId: options.targetMessageId,
      traceContext,
    });
  }

  const events = await this.eventStore.getEvents(this.sessionId);
  const checkpoint = selectCheckpointForRewind(events, options.targetCheckpointId);
  if (!checkpoint) {
    throw createCoreError(
      CoreErrorType.InvalidStateTransition,
      options.targetCheckpointId
        ? `Checkpoint not found: ${options.targetCheckpointId}`
        : "No workspace checkpoint is available yet.",
      {
        context: {
          targetCheckpointId: options.targetCheckpointId,
          targetMessageId: options.targetMessageId,
        },
        recoverable: true,
      },
    );
  }
  if (!this.sessionStore || !this.artifactStore || !this.fileSystemPort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Fork requires session, artifact, and file-system adapters.",
      {
        context: {
          hasArtifactStore: Boolean(this.artifactStore),
          hasFileSystemPort: Boolean(this.fileSystemPort),
          hasSessionStore: Boolean(this.sessionStore),
        },
        recoverable: true,
      },
    );
  }
  const parentSession = await this.sessionStore.getSession(this.sessionId);
  if (!parentSession) {
    throw createCoreError(CoreErrorType.SessionNotFound, `Session not found: ${this.sessionId}`, {
      context: { sessionId: this.sessionId },
      recoverable: true,
    });
  }
  const snapshot = await this.artifactStore.readToolResultArtifact(
    { uri: checkpoint.snapshotRef, trace: traceContext },
    { signal: options.abortSignal },
  );
  const artifact = parseWorkspaceCheckpointArtifact(JSON.parse(snapshot.content));
  const parentMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const sourceMessages = forkSourceMessagesForSession(parentMessages, parentSession);
  const targetResolved = checkpoint.targetMessageId ?? checkpoint.messageId;
  const targetIndex = sourceMessages.findIndex((message) => message.info.id === targetResolved);
  if (targetIndex < 0) {
    throw createCoreError(
      CoreErrorType.InvalidStateTransition,
      `Checkpoint message not found in session store: ${targetResolved}`,
      {
        context: { checkpointId: checkpoint.checkpointId, messageId: targetResolved },
        recoverable: true,
      },
    );
  }

  const forkedSessionId = await createForkedSession(this, {
    forkedSessionId: options.forkedSessionId,
    parentSession,
  });
  const historyEnd = resolveForkHistoryEndIndex(sourceMessages, targetIndex, false);
  const history = buildForkHistoryMessages(parentMessages, sourceMessages, targetIndex, historyEnd);
  const { copiedMessageCount, messageIdMap } = await this.copySessionMessagesForFork({
    forkedSessionId,
    messages: history,
    traceContext,
  });
  await copyGoalStateForFork.call(this, { forkedSessionId, messageIdMap, traceContext });
  const restoredFiles = await this.restoreWorkspaceCheckpointArtifact(
    artifact,
    traceContext,
    options.abortSignal,
  );
  const copiedTarget = messageIdMap.get(targetResolved);
  const created = Date.now();
  await this.persistAssistantTimelinePartForSession({
    sessionId: forkedSessionId,
    messageID: createMessageId(),
    partID: createPartId(
      `fork_${String(this.sessionId)}_${String(targetResolved)}_${checkpoint.checkpointId}_timeline`,
    ),
    parentID: copiedTarget,
    created,
    completed: created,
    finish: "completed",
    timeline: {
      timelineType: "session_fork",
      display: "separator",
      status: "completed",
      anchorMessageId: copiedTarget,
      parentSessionId: this.sessionId,
      targetMessageId: targetResolved,
      targetCheckpointId: checkpoint.checkpointId,
      restoredFileCount: restoredFiles.length,
      time: { start: created, end: created },
    },
    traceContext,
  });
  await this.persistSyntheticUserNoticeForSession({
    messageID: createMessageId(),
    sessionId: forkedSessionId,
    source: "fork",
    text: formatWorkspaceForkNoticeBody({
      checkpoint,
      parentSessionId: this.sessionId,
      restoredFiles,
    }),
    metadata: {
      forkContext: {
        kind: "session_fork",
        parentSessionId: this.sessionId,
        targetMessageId: targetResolved,
        targetCheckpointId: checkpoint.checkpointId,
        restoredFileCount: restoredFiles.length,
      },
    },
    traceContext,
  });
  const event = this.createEvent(
    SessionEventType.SessionForked,
    {
      originalSessionId: this.sessionId,
      forkedSessionId,
      forkPoint: historyEnd,
      targetMessageId: targetResolved,
      targetCheckpointId: checkpoint.checkpointId,
      restoredSnapshotRef: checkpoint.snapshotRef,
      restoredFileCount: restoredFiles.length,
      strategy: RewindStrategy.ForkRequired,
    },
    traceContext,
  );
  await this.appendEvent(event, traceContext);
  return {
    checkpoint,
    copiedMessageCount,
    forkedSessionId,
    parentSessionId: this.sessionId,
    targetMessageId: targetResolved,
    targetCheckpointId: checkpoint.checkpointId,
    restoredFiles,
    response: `Forked session ${forkedSessionId} from checkpoint ${checkpoint.checkpointId}: copied ${copiedMessageCount} messages and restored ${restoredFiles.length} file${restoredFiles.length === 1 ? "" : "s"}.`,
  };
}

export async function loadCheckpointMessagePreviews(
  this: AgentRuntimeInternal,
): Promise<Map<MessageId, string>> {
  const previews = new Map<MessageId, string>();
  if (!this.sessionStore) return previews;
  const messages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const messagesById = new Map<MessageId, MessageWithParts>();
  for (const message of messages) messagesById.set(message.info.id, message);
  for (const message of messages) {
    const source =
      message.info.role === "assistant" ? messagesById.get(message.info.parentID) : message;
    if (!source) continue;
    const preview = previewTextFromMessage(source);
    if (preview) previews.set(message.info.id, preview);
  }
  return previews;
}
