import {
  activeSessionMessages,
  evaluateRewindTarget,
  parseWorkspaceCheckpointArtifact,
  RewindScope,
  RewindStrategy,
  SessionEventType,
  createMessageId,
  traceContextToLogContext,
} from "../deps.js";
import type { CheckpointCreatedPayload, MessageId, SessionEvent, TraceContext } from "../deps.js";
import {
  activeSuffixMessageIdsForRewind,
  buildMessageRewindEvaluationItems,
  createTurnCancelledError,
  formatWorkspaceRewindNoticeBody,
  isTurnCancellationError,
  selectCheckpointsForMessages,
  throwIfTurnAborted,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { WorkspaceRewindResult } from "../types.js";

type CascadeOptions = {
  abortSignal?: AbortSignal;
  events: SessionEvent[];
  scope: RewindScope;
  targetMessageId: MessageId;
  traceContext: TraceContext;
};

async function readActiveMessages(this: AgentRuntimeInternal) {
  if (!this.sessionStore) return [];
  const session = await this.sessionStore.getSession(this.sessionId);
  const messages = await this.sessionStore.messages({ sessionID: this.sessionId });
  return activeSessionMessages(messages, {
    branchCutAfterMessageId: session?.revert?.branchCutAfterMessageID,
    rewindCreatedMessageId: session?.revert?.createdMessageID,
    rewindKeptMessageIds: session?.revert?.keptMessageIDs,
    rewindTargetMessageId: session?.revert?.targetMessageID,
  });
}

async function readCheckpointArtifact(
  this: AgentRuntimeInternal,
  checkpoint: CheckpointCreatedPayload,
  traceContext: TraceContext,
  abortSignal?: AbortSignal,
) {
  const snapshot = await this.artifactStore!.readToolResultArtifact({
    uri: checkpoint.snapshotRef,
    trace: traceContext,
  }, { signal: abortSignal });
  return parseWorkspaceCheckpointArtifact(JSON.parse(snapshot.content));
}

async function restoreCheckpointCascade(
  this: AgentRuntimeInternal,
  options: CascadeOptions & { checkpoints: CheckpointCreatedPayload[] },
): Promise<WorkspaceRewindResult> {
  const baseline = options.checkpoints[0];
  const latest = options.checkpoints[options.checkpoints.length - 1];
  const rewindId = `rewind_${crypto.randomUUID()}`;
  if (!this.artifactStore || !this.fileSystemPort) {
    return this.finishUnavailableRewind({
      checkpoint: latest,
      events: options.events,
      reason: !this.artifactStore ? "artifact_store_not_configured" : "file_system_port_not_configured",
      rewindId,
      targetCheckpointId: latest.checkpointId,
      targetMessageId: options.targetMessageId,
      traceContext: options.traceContext,
    });
  }
  const evaluation = evaluateRewindTarget({
    checkpointAvailable: true,
    items: buildMessageRewindEvaluationItems(await readActiveMessages.call(this)),
    scope: RewindScope.Workspace,
    targetMessageId: options.targetMessageId,
  });
  if (evaluation.strategy !== RewindStrategy.ActiveChain && evaluation.strategy !== RewindStrategy.FileOnly) {
    return this.finishUnavailableRewind({
      checkpoint: latest,
      evaluation,
      events: options.events,
      reason: evaluation.reason,
      rewindId,
      targetCheckpointId: latest.checkpointId,
      targetMessageId: options.targetMessageId,
      traceContext: options.traceContext,
    });
  }
  const checkpoints = [...options.checkpoints].reverse();
  const snapshots: {
    checkpoint: CheckpointCreatedPayload;
    artifact: ReturnType<typeof parseWorkspaceCheckpointArtifact>;
  }[] = [];
  for (const checkpoint of checkpoints) {
    throwIfTurnAborted(options.abortSignal);
    try {
      const artifact = await readCheckpointArtifact.call(this, checkpoint, options.traceContext, options.abortSignal);
      snapshots.push({ checkpoint, artifact });
    } catch (error) {
      if (isTurnCancellationError(error, options.abortSignal)) throw createTurnCancelledError(error);
      this.logger?.warn("Workspace cascade rewind checkpoint read failed", {
        ...traceContextToLogContext(options.traceContext),
        checkpointId: checkpoint.checkpointId,
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "rewind.cascade.snapshot.read.failed",
        module: "core.runtime",
        snapshotRef: checkpoint.snapshotRef,
        status: "failed",
      });
      return this.finishUnavailableRewind({
        checkpoint,
        events: options.events,
        reason: "checkpoint_snapshot_unavailable",
        rewindId,
        targetCheckpointId: checkpoint.checkpointId,
        targetMessageId: options.targetMessageId,
        traceContext: options.traceContext,
      });
    }
  }
  const restoredFiles: WorkspaceRewindResult["restoredFiles"] = [];
  for (const snapshot of snapshots) {
    throwIfTurnAborted(options.abortSignal);
    const restored = await this.restoreWorkspaceCheckpointArtifact(snapshot.artifact, options.traceContext, options.abortSignal);
    restoredFiles.push(...restored);
  }
  const createdMessageId = createMessageId();
  const notice = formatWorkspaceRewindNoticeBody({ checkpoint: baseline, evaluation, restoredFiles, rewindId })
    + `\nrestoredCheckpoints: ${options.checkpoints.length}`;
  await this.persistSyntheticUserNotice(createdMessageId, notice, options.traceContext);
  this.messageHistory.addAttachment("rewind_notice", notice);
  const event = this.createEvent(SessionEventType.RewindTriggered, {
    rewindId,
    scope: RewindScope.Workspace,
    strategy: evaluation.strategy,
    targetMessageId: options.targetMessageId,
    targetCheckpointId: baseline.checkpointId,
    compactBoundaryId: evaluation.compactBoundaryId,
    restoredSnapshotRef: baseline.snapshotRef,
    createdMessageId,
    reason: evaluation.reason,
  }, options.traceContext);
  await this.appendEvent(event);
  options.events.push(event);
  const suffix = evaluation.strategy === RewindStrategy.FileOnly
    ? " Workspace files were restored; conversation history stayed at the compacted context."
    : "";
  return {
    checkpoint: baseline,
    evaluation,
    restoredFiles,
    response: `Rewound workspace through ${options.checkpoints.length} checkpoint${options.checkpoints.length === 1 ? "" : "s"} to checkpoint ${baseline.checkpointId}: restored ${restoredFiles.length} file${restoredFiles.length === 1 ? "" : "s"}.${suffix}`,
    rewindId,
    strategy: evaluation.strategy,
  };
}

export async function rewindWorkspaceCascadeToMessage(
  this: AgentRuntimeInternal,
  options: CascadeOptions,
): Promise<WorkspaceRewindResult> {
  const persistedEvents = await this.eventStore.getEvents(this.sessionId);
  const activeMessages = await readActiveMessages.call(this);
  const suffix = activeSuffixMessageIdsForRewind(activeMessages, options.targetMessageId);
  const checkpoints = selectCheckpointsForMessages(persistedEvents, suffix.length > 0 ? suffix : [options.targetMessageId]);
  if (checkpoints.length === 0) {
    return this.finishUnavailableRewind({
      events: options.events,
      reason: "target_checkpoint_not_found",
      rewindId: `rewind_${crypto.randomUUID()}`,
      scope: options.scope,
      targetMessageId: options.targetMessageId,
      traceContext: options.traceContext,
    });
  }
  if (checkpoints.length === 1) {
    return this.rewindWorkspaceToCheckpoint({
      abortSignal: options.abortSignal,
      events: options.events,
      targetCheckpointId: checkpoints[0].checkpointId,
      traceContext: options.traceContext,
    });
  }
  return restoreCheckpointCascade.call(this, { ...options, checkpoints });
}
