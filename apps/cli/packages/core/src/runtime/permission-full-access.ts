import {
  PERMISSION_FULL_ACCESS_ENTRY,
  SessionEventType,
  permissionFullAccessReceiptSchema,
  type SessionEvent,
  type SessionModeChangedPayload,
} from "@knorvia/contracts";
import { resolveExecutionState } from "@knorvia/shared";
import { buildExecutionStateEntry } from "./execution-state.js";
import type { AgentRuntimeInternal } from "./internal.js";
import {
  recoverPendingPermissionGrant,
  unpublishedPermissionGrants,
} from "./permission-grant-recovery.js";

const appliedPermissionGrants = new WeakMap<AgentRuntimeInternal, Set<string>>();

export async function grantPermissionFullAccess(
  this: AgentRuntimeInternal,
  interactionId: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!this.sessionStore?.commitPermissionFullAccess) {
    throw new Error("Full access is unsupported");
  }
  if (
    this.permissionFullAccessPending ||
    this.pendingInputReservations.size > 0 ||
    this.pendingInputDrains
  ) {
    throw new Error("Queue mutation is busy; retry approval");
  }

  const unpublished = unpublishedPermissionGrants.get(this);
  if (unpublished && unpublished.interactionId !== interactionId) {
    await recoverPendingPermissionGrant(this);
  }

  this.permissionFullAccessPending = true;
  try {
    signal?.throwIfAborted();
    const receiptId = `${this.sessionId}:permission-full-access:${interactionId}`;
    const entries = await this.sessionStore.sessionEntries?.({
      sessionID: this.sessionId,
      type: PERMISSION_FULL_ACCESS_ENTRY,
    });
    const receiptEntry = entries?.find((entry) => entry.id === receiptId);
    let event: SessionEvent & { payload: SessionModeChangedPayload };

    if (receiptEntry) {
      const receipt = permissionFullAccessReceiptSchema.parse(receiptEntry.data);
      if (receipt.event.sessionId !== this.sessionId || receipt.interactionId !== interactionId) {
        throw new Error("Permission receipt scope mismatch");
      }
      event = receipt.event as SessionEvent & { payload: SessionModeChangedPayload };
    } else {
      const projection = await this.rebuildProjection();
      const queueItemIds = projection.pendingSteerInputs.map((input) => input.pendingInputId);
      const previous = resolveExecutionState(this.config);
      const next = { ...previous, mode: "yolo" as const };
      event = this.createEvent(
        SessionEventType.SessionModeChanged,
        {
          ...next,
          previousMode: previous.mode,
          previousPlanEnabled: previous.planEnabled,
          source: "command",
          permissionGrant: { interactionId, queueItemIds },
        },
        this.rootTraceContext,
      ) as SessionEvent & { payload: SessionModeChangedPayload };
      signal?.throwIfAborted();
      await this.sessionStore.commitPermissionFullAccess({
        sessionID: this.sessionId,
        queueItemIds,
        signal,
        execution: buildExecutionStateEntry(this.sessionId, next),
        receipt: {
          id: receiptId,
          sessionID: this.sessionId,
          type: PERMISSION_FULL_ACCESS_ENTRY,
          touchSession: false,
          time: { created: Date.now(), updated: Date.now() },
          data: { interactionId, event },
        },
      });
    }

    const payload = event.payload;
    unpublishedPermissionGrants.set(this, {
      interactionId,
      recover: () => grantPermissionFullAccess.call(this, interactionId),
    });
    const grantedIds = new Set(payload.permissionGrant!.queueItemIds);
    const applied = appliedPermissionGrants.get(this);
    if (!applied?.has(interactionId)) {
      this.lastPermissionGrantId = interactionId;
      this.config.mode = payload.mode;
      this.config.planEnabled = payload.planEnabled;
      for (const input of this.activeTurn?.pendingInputs ?? []) {
        if (grantedIds.has(input.id) && input.intent) {
          input.intent = { ...input.intent, mode: "yolo" };
        }
      }
      if (applied) {
        applied.add(interactionId);
      } else {
        appliedPermissionGrants.set(this, new Set([interactionId]));
      }
    }

    const events = await this.eventStore.getEvents(this.sessionId);
    const existing = events.find((candidate) => candidate.id === event.id);
    if (existing) {
      await this.notifyEventSinks(existing, this.rootTraceContext);
    } else {
      await this.appendEvent(event, this.rootTraceContext);
    }
    unpublishedPermissionGrants.delete(this);
    return String(event.id);
  } finally {
    this.permissionFullAccessPending = false;
  }
}
