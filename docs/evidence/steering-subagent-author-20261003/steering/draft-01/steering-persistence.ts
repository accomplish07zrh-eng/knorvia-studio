import { SessionEventType, createSessionEvent, traceContextToLogContext } from "../deps.js";
import type { TraceContext, TurnId } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  unpublishedPermissionGrants,
  recoverPendingPermissionGrant,
} from "../permission-grant-recovery.js";

export async function findPendingTarget(
  runtime: AgentRuntimeInternal,
  pendingInputId: string,
): Promise<TurnId | undefined> {
  const pending = runtime.activeTurn?.pendingInputs.find((item) => item.id === pendingInputId);
  if (pending) return pending.turnId;
  const projection = await runtime.rebuildProjection();
  return projection.pendingSteerInputs.find((item) => item.pendingInputId === pendingInputId)
    ?.targetTurnId;
}

async function publishDispatch(
  runtime: AgentRuntimeInternal,
  options: {
    pendingInputId: string;
    reservationId?: string;
    state: "reserved" | "promoting" | "queued";
    targetTurnId: TurnId;
    traceContext: TraceContext;
  },
): Promise<void> {
  const event = createSessionEvent(
    SessionEventType.TurnSteerDispatchChanged,
    runtime.sessionId,
    {
      pendingInputId: options.pendingInputId,
      ...(options.reservationId ? { reservationId: options.reservationId } : {}),
      state: options.state,
      targetTurnId: options.targetTurnId,
    },
    { traceId: options.traceContext.traceId, turnId: options.targetTurnId },
  );
  await runtime.appendEvent(event, options.traceContext);
}

export async function reservePendingInputById(
  this: AgentRuntimeInternal,
  options: { pendingInputId: string; reservationId: string; traceContext: TraceContext },
): Promise<boolean> {
  if (this.permissionFullAccessPending || this.pendingInputReservations.has(options.pendingInputId))
    return false;
  if (unpublishedPermissionGrants.has(this)) await recoverPendingPermissionGrant(this);
  const targetTurnId = await findPendingTarget(this, options.pendingInputId);
  if (
    !targetTurnId ||
    this.permissionFullAccessPending ||
    this.pendingInputReservations.has(options.pendingInputId)
  )
    return false;
  this.pendingInputReservations.set(options.pendingInputId, options.reservationId);
  try {
    await publishDispatch(this, { ...options, state: "reserved", targetTurnId });
    return true;
  } catch (error) {
    this.pendingInputReservations.delete(options.pendingInputId);
    throw error;
  }
}

export async function markPendingInputPromoting(
  this: AgentRuntimeInternal,
  options: { pendingInputId: string; reservationId: string; traceContext: TraceContext },
): Promise<boolean> {
  if (this.pendingInputReservations.get(options.pendingInputId) !== options.reservationId)
    return false;
  const targetTurnId = await findPendingTarget(this, options.pendingInputId);
  if (!targetTurnId) return false;
  await publishDispatch(this, { ...options, state: "promoting", targetTurnId });
  return true;
}

export async function releasePendingInputReservation(
  this: AgentRuntimeInternal,
  options: { pendingInputId: string; reservationId: string; traceContext: TraceContext },
): Promise<boolean> {
  if (this.pendingInputReservations.get(options.pendingInputId) !== options.reservationId)
    return false;
  const targetTurnId = await findPendingTarget(this, options.pendingInputId);
  this.pendingInputReservations.delete(options.pendingInputId);
  if (!targetTurnId) return true;
  try {
    await publishDispatch(this, {
      pendingInputId: options.pendingInputId,
      traceContext: options.traceContext,
      state: "queued",
      targetTurnId,
    });
    return true;
  } catch (error) {
    this.pendingInputReservations.set(options.pendingInputId, options.reservationId);
    throw error;
  }
}

export async function settleRemoval(
  runtime: AgentRuntimeInternal,
  id: string,
  reason: "user_removed" | "promoted",
): Promise<void> {
  if (reason !== "user_removed") return;
  await runtime.sessionStore?.settleSessionInput?.({
    id,
    sessionID: runtime.sessionId,
    status: "cancelled",
    reason: "user_removed",
  });
}

export async function updateInputs(
  runtime: AgentRuntimeInternal,
  updates: { id: string; text?: string; queuePosition?: number }[],
): Promise<void> {
  await runtime.sessionStore?.updateSessionInputs?.({ sessionID: runtime.sessionId, updates });
}

export async function removePendingInputById(
  this: AgentRuntimeInternal,
  options: {
    pendingInputId: string;
    reason: "user_removed" | "promoted";
    reservationId?: string;
    traceContext: TraceContext;
  },
): Promise<boolean> {
  const reservation = this.pendingInputReservations.get(options.pendingInputId);
  if (reservation && reservation !== options.reservationId) return false;
  const activeTurn = this.activeTurn;
  const index =
    activeTurn?.pendingInputs.findIndex((item) => item.id === options.pendingInputId) ?? -1;
  if (!activeTurn || index < 0)
    return this.discardHeldPendingInputById(
      options.pendingInputId,
      options.traceContext,
      options.reservationId,
      options.reason,
    );
  await settleRemoval(this, options.pendingInputId, options.reason);
  activeTurn.pendingInputs.splice(index, 1);
  const event = createSessionEvent(
    SessionEventType.TurnSteerDiscarded,
    this.sessionId,
    {
      pendingInputIds: [options.pendingInputId],
      reason: options.reason,
      targetTurnId: activeTurn.turnId,
    },
    { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId },
  );
  await this.appendEvent(event, options.traceContext);
  this.pendingInputReservations.delete(options.pendingInputId);
  logRemoval(this, options.pendingInputId, activeTurn.turnId, options.traceContext);
  return true;
}

export async function discardHeldPendingInputById(
  this: AgentRuntimeInternal,
  pendingInputId: string,
  traceContext: TraceContext,
  reservationId?: string,
  reason: "user_removed" | "promoted" = "user_removed",
): Promise<boolean> {
  const reservation = this.pendingInputReservations.get(pendingInputId);
  if (reservation && reservation !== reservationId) return false;
  const projection = await this.rebuildProjection();
  const pending = projection.pendingSteerInputs.find(
    (item) => item.pendingInputId === pendingInputId,
  );
  if (!pending) return false;
  await settleRemoval(this, pendingInputId, reason);
  const event = createSessionEvent(
    SessionEventType.TurnSteerDiscarded,
    this.sessionId,
    {
      pendingInputIds: [pendingInputId],
      reason,
      targetTurnId: pending.targetTurnId,
    },
    { traceId: traceContext.traceId, turnId: pending.targetTurnId },
  );
  await this.appendEvent(event, traceContext);
  this.pendingInputReservations.delete(pendingInputId);
  logRemoval(this, pendingInputId, pending.targetTurnId, traceContext);
  return true;
}

function logRemoval(
  runtime: AgentRuntimeInternal,
  pendingInputId: string,
  targetTurnId: TurnId,
  traceContext: TraceContext,
): void {
  runtime.logger?.debug("Turn steer item removed", {
    ...traceContextToLogContext(traceContext),
    event: "turn.steer.removed",
    module: "core.runtime",
    pendingInputId,
    status: "completed",
    targetTurnId,
  });
}

export async function clearAllPendingInputs(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<number> {
  let cleared = 0;
  const activeTurn = this.activeTurn;
  if (activeTurn?.pendingInputs.length) {
    for (const pending of activeTurn.pendingInputs)
      await settleRemoval(this, pending.id, "user_removed");
    const pendingInputIds = activeTurn.pendingInputs.splice(0).map((item) => item.id);
    cleared += pendingInputIds.length;
    const event = createSessionEvent(
      SessionEventType.TurnSteerDiscarded,
      this.sessionId,
      {
        pendingInputIds,
        reason: "user_removed",
        targetTurnId: activeTurn.turnId,
      },
      { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId },
    );
    await this.appendEvent(event, traceContext);
  }
  const projection = await this.rebuildProjection();
  const groups = new Map<TurnId, string[]>();
  for (const pending of projection.pendingSteerInputs) {
    const ids = groups.get(pending.targetTurnId);
    if (ids) ids.push(pending.pendingInputId);
    else groups.set(pending.targetTurnId, [pending.pendingInputId]);
  }
  for (const [targetTurnId, pendingInputIds] of groups) {
    for (const id of pendingInputIds) await settleRemoval(this, id, "user_removed");
    cleared += pendingInputIds.length;
    const event = createSessionEvent(
      SessionEventType.TurnSteerDiscarded,
      this.sessionId,
      {
        pendingInputIds,
        reason: "user_removed",
        targetTurnId,
      },
      { traceId: traceContext.traceId, turnId: targetTurnId },
    );
    await this.appendEvent(event, traceContext);
  }
  return cleared;
}
