import {
  createMessageId,
  createPartId,
  SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION,
  SessionEventType,
  traceContextToLogContext,
} from "../deps.js";
import type {
  PartId,
  SessionEvent,
  SessionId,
  TargetCompletionVerificationPayload,
  TraceContext,
  TurnInputIntentMetadata,
  UserInputAutoResolutionUpdatedPayload,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { buildPersistedConversationInputIntent } from "./input-intent-persistence.js";
import {
  persistWorkspaceCheckpointEntry,
  persistWorkspaceFileRewindEntry,
} from "./workspace-checkpoint-persistence.js";

interface QueuedInputPayload {
  pendingInputId: string;
  input: string;
  commandKind?: string;
  delivery?: "guide" | "queue";
  intent?: TurnInputIntentMetadata;
}

interface DeliveryChangedPayload {
  admittedDelivery: "queue";
  intent?: TurnInputIntentMetadata;
  pendingInputId: string;
}

interface DiscardedInputPayload {
  pendingInputIds: string[];
  reason?: string;
}

async function readVerificationTiming(
  runtime: AgentRuntimeInternal,
  sessionId: SessionId,
  partID: PartId,
): Promise<{ messageCreated: number; partStarted: number | undefined } | undefined> {
  const messages = await runtime.sessionStore?.messages({ sessionID: sessionId });
  for (const message of messages ?? []) {
    const part = message.parts.find((candidate) => candidate.id === partID);
    if (part?.type === "timeline") {
      return {
        messageCreated: message.info.time.created,
        partStarted: part.time?.start,
      };
    }
  }
  return undefined;
}

export async function persistDurableEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  if (!runtime.sessionStore) return;

  if (event.type === SessionEventType.CheckpointCreated) {
    await persistWorkspaceCheckpointEntry(runtime, event, traceContext);
    return;
  }
  if (event.type === SessionEventType.RewindTriggered) {
    await persistWorkspaceFileRewindEntry(runtime, event, traceContext);
    return;
  }
  if (event.type === SessionEventType.UserInputAutoResolutionUpdated) {
    const payload = event.payload as UserInputAutoResolutionUpdatedPayload;
    try {
      await runtime.sessionStore!.saveSessionEntry?.({
        id: `user-input-auto-resolution:${payload.interactionId}`,
        sessionID: event.sessionId,
        type: SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION,
        time: {
          created: payload.autoResolution.startedAt,
          updated: event.timestamp.getTime(),
        },
        data: {
          interactionId: payload.interactionId,
          toolCallId: payload.toolCallId,
          autoResolution: payload.autoResolution,
          eventId: event.id,
          sequenceNumber: event.sequenceNumber,
          traceId: event.traceId,
          ...(event.turnId ? { turnId: event.turnId } : {}),
        },
      });
    } catch (error) {
      runtime.logger?.warn("Failed to persist user input auto-resolution state", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "user_input_auto_resolution.persist_failed",
        interactionId: payload.interactionId,
        module: "core.runtime",
        status: "failed",
      });
    }
    return;
  }
  if (event.type === SessionEventType.TurnSteerQueued) {
    const payload = event.payload as QueuedInputPayload;
    const conversationInputIntent = buildPersistedConversationInputIntent(
      payload.input,
      payload.intent,
      "queued",
    );
    try {
      await runtime.sessionStore!.saveSessionInput?.({
        id: payload.pendingInputId,
        sessionID: event.sessionId,
        kind: payload.intent?.kind ?? payload.commandKind ?? "sendText",
        delivery: payload.delivery ?? "queue",
        payload: {
          text: payload.input,
          ...(payload.intent ? { intent: payload.intent } : {}),
          ...(conversationInputIntent ? { conversationInputIntent } : {}),
        },
      });
    } catch (error) {
      runtime.logger?.warn("Failed to admit session input to ledger", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_input.admit_failed",
        module: "core.runtime",
        pendingInputId: payload.pendingInputId,
        status: "failed",
      });
    }
    return;
  }
  if (event.type === SessionEventType.TurnSteerDeliveryChanged) {
    const payload = event.payload as DeliveryChangedPayload;
    try {
      await runtime.sessionStore!.updateSessionInputs?.({
        sessionID: event.sessionId,
        updates: [
          {
            delivery: payload.admittedDelivery,
            id: payload.pendingInputId,
            ...(payload.intent ? { intent: payload.intent } : {}),
          },
        ],
      });
    } catch (error) {
      runtime.logger?.warn("Failed to persist session input delivery fallback", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_input.delivery_change_failed",
        module: "core.runtime",
        pendingInputId: payload.pendingInputId,
        status: "failed",
      });
    }
    return;
  }
  if (event.type === SessionEventType.TurnSteerDiscarded) {
    const payload = event.payload as DiscardedInputPayload;
    if (payload.reason === "promoted") return;
    const status = payload.reason === "session_resumed" ? "discarded" : "cancelled";
    for (const pendingInputId of payload.pendingInputIds) {
      try {
        await runtime.sessionStore!.settleSessionInput?.({
          id: pendingInputId,
          sessionID: event.sessionId,
          status,
          reason: payload.reason,
        });
      } catch (error) {
        runtime.logger?.warn("Failed to settle session input in ledger", {
          ...traceContextToLogContext(traceContext),
          errorMessage: error instanceof Error ? error.message : String(error),
          event: "session_input.settle_failed",
          module: "core.runtime",
          pendingInputId,
          status: "failed",
        });
      }
    }
    return;
  }
  if (event.type === SessionEventType.TargetCompletionVerification) {
    try {
      const timestamp = event.timestamp.getTime();
      const payload = event.payload as TargetCompletionVerificationPayload;
      const key =
        payload.goalIteration !== undefined
          ? `${payload.targetId}_${payload.goalIteration}`
          : payload.verificationId;
      const partID = createPartId(`goal_verify_${key}_timeline`);
      const previous = await readVerificationTiming(runtime, event.sessionId, partID);
      const created = previous?.messageCreated ?? timestamp;
      const start = previous?.partStarted ?? timestamp;
      if (runtime.sessionStore!.saveSessionEntry) {
        await runtime.sessionStore!.saveSessionEntry({
          id: String(event.id),
          sessionID: event.sessionId,
          type: SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
          time: { created: timestamp, updated: timestamp },
          data: {
            eventId: event.id,
            payload: event.payload,
            sequenceNumber: event.sequenceNumber,
            traceId: event.traceId,
            ...(event.turnId ? { turnId: event.turnId } : {}),
          },
        });
      }
      await runtime.persistAssistantTimelinePartForSession({
        sessionId: event.sessionId,
        messageID: createMessageId(
          `goal_verify_${payload.goalIteration !== undefined ? `${payload.targetId}_${payload.goalIteration}` : payload.verificationId}`,
        ),
        partID,
        parentID: payload.anchorAssistantMessageId,
        created,
        completed: payload.status === "started" ? undefined : timestamp,
        finish: payload.status,
        timeline: {
          timelineType: "goal_verification",
          display: "separator",
          status: payload.status,
          anchorMessageId: payload.anchorAssistantMessageId,
          anchorTurnId: payload.anchorTurnId,
          targetId: payload.targetId,
          verificationId: payload.verificationId,
          goalIteration: payload.goalIteration,
          verification: payload.verification,
          time: { start, end: payload.status === "started" ? undefined : timestamp },
        },
        traceContext,
      });
    } catch (error) {
      runtime.logger?.warn("Failed to persist target completion verification event", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_entry.target_completion_verification.persist_failed",
        module: "core.runtime",
        sessionEventType: event.type,
        status: "failed",
      });
    }
  }
}
