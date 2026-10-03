import {
  createSessionEvent,
  parseCheckpointCreatedPayload,
  parseRewindTriggeredPayload,
  RewindScope,
  SESSION_ENTRY_WORKSPACE_CHECKPOINT,
  SESSION_ENTRY_WORKSPACE_FILE_REWIND,
  SessionEventType,
  traceContextToLogContext,
} from "../deps.js";
import type { SessionEvent, TraceContext, TraceId, TurnId } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

interface PersistedWorkspaceEventData {
  eventId: string;
  payload: unknown;
  sequenceNumber: number;
  traceId: string;
  turnId?: string;
}

function validatePersistedWorkspaceEventData(data: unknown): PersistedWorkspaceEventData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.eventId !== "string" ||
    typeof record.sequenceNumber !== "number" ||
    typeof record.traceId !== "string" ||
    !("payload" in record) ||
    (record.turnId !== undefined && typeof record.turnId !== "string")
  ) {
    return null;
  }
  return data as PersistedWorkspaceEventData;
}

export async function persistWorkspaceCheckpointEntry(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore?.saveSessionEntry) return;
  try {
    const timestamp = event.timestamp.getTime();
    await runtime.sessionStore.saveSessionEntry({
      id: `workspace-checkpoint:${String(event.id)}`,
      sessionID: event.sessionId,
      type: SESSION_ENTRY_WORKSPACE_CHECKPOINT,
      time: { created: timestamp, updated: timestamp },
      data: {
        eventId: String(event.id),
        payload: parseCheckpointCreatedPayload(event.payload),
        sequenceNumber: event.sequenceNumber,
        traceId: String(event.traceId),
        ...(event.turnId ? { turnId: String(event.turnId) } : {}),
      },
    });
  } catch (error) {
    runtime.logger?.warn("Failed to persist workspace checkpoint", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "checkpoint.persist.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
}

export async function persistWorkspaceFileRewindEntry(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore?.saveSessionEntry) return;
  const payload = parseRewindTriggeredPayload(event.payload);
  if (payload.scope !== RewindScope.Workspace || payload.reason !== "file_summary_rewind") return;
  try {
    const timestamp = event.timestamp.getTime();
    await runtime.sessionStore.saveSessionEntry({
      id: `workspace-file-rewind:${payload.rewindId}`,
      sessionID: event.sessionId,
      type: SESSION_ENTRY_WORKSPACE_FILE_REWIND,
      time: { created: timestamp, updated: timestamp },
      data: {
        eventId: String(event.id),
        payload,
        sequenceNumber: event.sequenceNumber,
        traceId: String(event.traceId),
        ...(event.turnId ? { turnId: String(event.turnId) } : {}),
      },
    });
  } catch (error) {
    runtime.logger?.warn("Failed to persist workspace file rewind", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "workspace_file_rewind.persist.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
}

export async function restoreWorkspaceCheckpointEntries(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore?.sessionEntries) return;
  let entries;
  try {
    entries = await runtime.sessionStore.sessionEntries({
      sessionID: runtime.sessionId,
      type: SESSION_ENTRY_WORKSPACE_CHECKPOINT,
    });
  } catch (error) {
    runtime.logger?.warn("Failed to read persisted workspace checkpoints", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "checkpoint.restore.read_failed",
      module: "core.runtime",
      status: "failed",
    });
    return;
  }
  const events = await runtime.eventStore.getEvents(runtime.sessionId);
  const checkpointIds = new Set<string>();
  for (const event of events) {
    if (event.type !== SessionEventType.CheckpointCreated) continue;
    try {
      checkpointIds.add(parseCheckpointCreatedPayload(event.payload).checkpointId);
    } catch {
      // An invalid existing payload contributes no identifier.
    }
  }
  const sortedEntries = [...entries].sort((left, right) => {
    const sequenceDifference =
      (validatePersistedWorkspaceEventData(left.data)?.sequenceNumber ?? 0) -
      (validatePersistedWorkspaceEventData(right.data)?.sequenceNumber ?? 0);
    return sequenceDifference || left.time.created - right.time.created;
  });
  for (const entry of sortedEntries) {
    const data = validatePersistedWorkspaceEventData(entry.data);
    if (!data) continue;
    try {
      const payload = parseCheckpointCreatedPayload(data.payload);
      if (checkpointIds.has(payload.checkpointId)) continue;
      const event = createSessionEvent(
        SessionEventType.CheckpointCreated,
        runtime.sessionId,
        payload,
        {
          traceId: data.traceId as TraceId,
          ...(data.turnId ? { turnId: data.turnId as TurnId } : {}),
        },
      );
      event.timestamp = new Date(entry.time.created);
      event.sequenceNumber = data.sequenceNumber;
      await runtime.eventStore.append(event);
      checkpointIds.add(payload.checkpointId);
    } catch (error) {
      runtime.logger?.warn("Skipped invalid persisted workspace checkpoint", {
        ...traceContextToLogContext(traceContext),
        entryId: entry.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "checkpoint.restore.invalid_entry",
        module: "core.runtime",
        status: "failed",
      });
    }
  }
}

export async function restoreWorkspaceFileRewindEntries(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore?.sessionEntries) return;
  let entries;
  try {
    entries = await runtime.sessionStore.sessionEntries({
      sessionID: runtime.sessionId,
      type: SESSION_ENTRY_WORKSPACE_FILE_REWIND,
    });
  } catch (error) {
    runtime.logger?.warn("Failed to read persisted workspace file rewinds", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "workspace_file_rewind.restore.read_failed",
      module: "core.runtime",
      status: "failed",
    });
    return;
  }
  const events = await runtime.eventStore.getEvents(runtime.sessionId);
  const rewindIds = new Set<string>();
  for (const event of events) {
    if (event.type !== SessionEventType.RewindTriggered) continue;
    try {
      rewindIds.add(parseRewindTriggeredPayload(event.payload).rewindId);
    } catch {
      // An invalid existing payload contributes no identifier.
    }
  }
  const sortedEntries = [...entries].sort((left, right) => {
    const sequenceDifference =
      (validatePersistedWorkspaceEventData(left.data)?.sequenceNumber ?? 0) -
      (validatePersistedWorkspaceEventData(right.data)?.sequenceNumber ?? 0);
    return sequenceDifference || left.time.created - right.time.created;
  });
  for (const entry of sortedEntries) {
    const data = validatePersistedWorkspaceEventData(entry.data);
    if (!data) continue;
    try {
      const payload = parseRewindTriggeredPayload(data.payload);
      if (payload.scope !== RewindScope.Workspace || payload.reason !== "file_summary_rewind")
        continue;
      if (rewindIds.has(payload.rewindId)) continue;
      const event = createSessionEvent(
        SessionEventType.RewindTriggered,
        runtime.sessionId,
        payload,
        {
          traceId: data.traceId as TraceId,
          ...(data.turnId ? { turnId: data.turnId as TurnId } : {}),
        },
      );
      event.timestamp = new Date(entry.time.created);
      event.sequenceNumber = data.sequenceNumber;
      await runtime.eventStore.append(event);
      rewindIds.add(payload.rewindId);
    } catch (error) {
      runtime.logger?.warn("Skipped invalid persisted workspace file rewind", {
        ...traceContextToLogContext(traceContext),
        entryId: entry.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "workspace_file_rewind.restore.invalid_entry",
        module: "core.runtime",
        status: "failed",
      });
    }
  }
}
