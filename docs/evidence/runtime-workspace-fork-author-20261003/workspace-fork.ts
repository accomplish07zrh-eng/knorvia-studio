import {
    CoreErrorType,
    RewindStrategy,
    SessionEventType,
    createCoreError,
    createMessageId,
    createPartId,
    type MessageId,
    type SessionId,
    type TraceContext,
    type WorkspaceCheckpointArtifact,
} from "../deps.js";
import {
    formatWorkspaceForkAtMessageNoticeBody,
    parseWorkspaceCheckpointArtifact,
    selectCheckpointsForMessages,
    throwIfTurnAborted,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { WorkspaceRewindRestoredFile, WorkspaceForkResult } from "../types.js";
import {
    buildForkHistoryMessages,
    copyGoalStateForFork,
    createForkedSession,
    forkConversationFromMessage,
    forkSourceMessagesForSession,
    resolveForkHistoryEndIndex,
} from "./session-fork.js";

export async function restoreWorkspaceCheckpointFiles(
    runtime: AgentRuntimeInternal,
    files: WorkspaceCheckpointArtifact["files"],
    traceContext: TraceContext,
    abortSignal?: AbortSignal,
): Promise<WorkspaceRewindRestoredFile[]> {
    if (!runtime.fileSystemPort) {
        throw createCoreError(CoreErrorType.ConfigurationError, "FileSystemPort is not configured", {
            recoverable: true,
        });
    }
    const restoredFiles: WorkspaceRewindRestoredFile[] = [];
    for (const file of files) {
        throwIfTurnAborted(abortSignal);
        if (!file.existedBefore || file.beforeContent === null) {
            await runtime.fileSystemPort.removeFile(
                { path: file.path, missingOk: true, trace: traceContext },
                { signal: abortSignal },
            );
            restoredFiles.push({ action: "delete", path: file.path });
        } else {
            const write = await runtime.fileSystemPort.writeTextFile(
                {
                    path: file.path,
                    content: file.beforeContent,
                    createParents: true,
                    atomic: true,
                    trace: traceContext,
                },
                { signal: abortSignal },
            );
            restoredFiles.push({ action: "restore", bytesWritten: write.bytesWritten, path: file.path });
        }
    }
    return restoredFiles;
}

export async function forkWorkspaceAtMessage(
    this: AgentRuntimeInternal,
    options: {
        abortSignal?: AbortSignal;
        forkedSessionId?: SessionId;
        targetMessageId: MessageId;
        traceContext: TraceContext;
    },
): Promise<WorkspaceForkResult> {
    if (!this.sessionStore) {
        throw createCoreError(CoreErrorType.ConfigurationError, "Fork requires a session adapter.", {
            context: { hasSessionStore: false },
            recoverable: true,
        });
    }
    const parentSession = await this.sessionStore.getSession(this.sessionId);
    if (!parentSession) {
        throw createCoreError(CoreErrorType.SessionNotFound, `Session not found: ${this.sessionId}`, {
            context: { sessionId: this.sessionId },
            recoverable: true,
        });
    }
    const parentMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
    const source = forkSourceMessagesForSession(parentMessages, parentSession);
    const targetIndex = source.findIndex((message) => message.info.id === options.targetMessageId);
    if (targetIndex < 0) {
        throw createCoreError(
            CoreErrorType.InvalidStateTransition,
            `Fork target message not found in session store: ${options.targetMessageId}`,
            { context: { messageId: options.targetMessageId }, recoverable: true },
        );
    }
    const end = resolveForkHistoryEndIndex(source, targetIndex, true);
    const events = await this.eventStore.getEvents(this.sessionId);
    const historyIds = source.slice(0, end).map((message) => message.info.id);
    const historyCheckpoints = selectCheckpointsForMessages(events, historyIds);
    const historyCheckpointIds = new Set(historyCheckpoints.map((checkpoint) => checkpoint.checkpointId));
    const laterIds = source.slice(end).map((message) => message.info.id);
    const later = selectCheckpointsForMessages(events, laterIds)
        .filter((checkpoint) => !historyCheckpointIds.has(checkpoint.checkpointId));

    if (later.length === 0) {
        return await forkConversationFromMessage.call(this, {
            forkedSessionId: options.forkedSessionId,
            targetMessageId: options.targetMessageId,
            traceContext: options.traceContext,
        });
    }
    if (!this.artifactStore || !this.fileSystemPort) {
        throw createCoreError(
            CoreErrorType.ConfigurationError,
            "Fork requires session, artifact, and file-system adapters.",
            {
                context: {
                    hasArtifactStore: Boolean(this.artifactStore),
                    hasFileSystemPort: Boolean(this.fileSystemPort),
                    hasSessionStore: true,
                },
                recoverable: true,
            },
        );
    }

    const artifacts: WorkspaceCheckpointArtifact[] = [];
    for (const checkpoint of later) {
        throwIfTurnAborted(options.abortSignal);
        const read = await this.artifactStore.readToolResultArtifact(
            { uri: checkpoint.snapshotRef, trace: options.traceContext },
            { signal: options.abortSignal },
        );
        artifacts.push(parseWorkspaceCheckpointArtifact(JSON.parse(read.content)));
    }
    const firstFiles = new Map<string, WorkspaceCheckpointArtifact["files"][number]>();
    for (const artifact of artifacts) {
        for (const file of artifact.files) {
            if (!firstFiles.has(file.path)) firstFiles.set(file.path, file);
        }
    }

    const forkedSessionId = await createForkedSession(this, {
        forkedSessionId: options.forkedSessionId,
        parentSession,
    });
    const history = buildForkHistoryMessages(parentMessages, source, targetIndex, end);
    const { copiedMessageCount, messageIdMap } = await this.copySessionMessagesForFork({
        forkedSessionId,
        messages: history,
        traceContext: options.traceContext,
    });
    await copyGoalStateForFork.call(this, {
        forkedSessionId,
        messageIdMap,
        traceContext: options.traceContext,
    });
    const restoredFiles = await restoreWorkspaceCheckpointFiles(
        this,
        Array.from(firstFiles.values()),
        options.traceContext,
        options.abortSignal,
    );
    const copiedTargetMessageId = messageIdMap.get(options.targetMessageId);
    const created = Date.now();
    await this.persistAssistantTimelinePartForSession({
        sessionId: forkedSessionId,
        messageID: createMessageId(),
        partID: createPartId(`fork_${String(this.sessionId)}_${String(options.targetMessageId)}_timeline`),
        parentID: copiedTargetMessageId,
        created,
        completed: created,
        finish: "completed",
        timeline: {
            timelineType: "session_fork",
            display: "separator",
            status: "completed",
            anchorMessageId: copiedTargetMessageId,
            parentSessionId: this.sessionId,
            targetMessageId: options.targetMessageId,
            restoredFileCount: restoredFiles.length,
            time: { start: created, end: created },
        },
        traceContext: options.traceContext,
    });
    await this.persistSyntheticUserNoticeForSession({
        messageID: createMessageId(),
        sessionId: forkedSessionId,
        source: "fork",
        text: formatWorkspaceForkAtMessageNoticeBody({
            parentSessionId: this.sessionId,
            restoredFiles,
            targetMessageId: options.targetMessageId,
            undoneCheckpointCount: later.length,
        }),
        metadata: {
            forkContext: {
                kind: "session_fork",
                parentSessionId: this.sessionId,
                targetMessageId: options.targetMessageId,
                restoredFileCount: restoredFiles.length,
            },
        },
        traceContext: options.traceContext,
    });
    const event = this.createEvent(SessionEventType.SessionForked, {
        originalSessionId: this.sessionId,
        forkedSessionId,
        forkPoint: end,
        targetMessageId: options.targetMessageId,
        restoredFileCount: restoredFiles.length,
        strategy: RewindStrategy.ForkRequired,
    }, options.traceContext);
    await this.appendEvent(event, options.traceContext);
    return {
        copiedMessageCount,
        forkedSessionId,
        parentSessionId: this.sessionId,
        targetMessageId: options.targetMessageId,
        restoredFiles,
        response: `Forked session ${forkedSessionId} from message ${options.targetMessageId}: copied ${copiedMessageCount} messages and restored ${restoredFiles.length} file${restoredFiles.length === 1 ? "" : "s"} to the fork point.`,
    };
}
