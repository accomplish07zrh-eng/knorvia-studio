import { CoreErrorType, createCoreError } from "../deps.js";
import type { TraceContext, TurnId } from "../deps.js";
import type { ActiveTurnKind, ActiveTurnSteeringState } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";

export function beginActiveTurn(
  this: AgentRuntimeInternal,
  turnId: TurnId,
  traceContext: TraceContext,
  kind: ActiveTurnKind,
  steerable: boolean,
  options?: { inputId?: string },
): ActiveTurnSteeringState {
  if (this.activeTurn) throw busy(kind, this.activeTurn.turnId, turnId);
  const reservation = this.activeTurnStartReservation;
  if (reservation && reservation.turnId !== turnId) throw busy(kind, reservation.turnId, turnId);
  const state: ActiveTurnSteeringState = {
    goalStateChangeReminderDeferralOpen: false,
    kind,
    pendingInputs: [],
    steerable,
    traceContext,
    turnId,
    ...(options?.inputId !== undefined ? { inputId: options.inputId } : {}),
  };
  this.activeTurnStartReservation = undefined;
  this.activeTurn = state;
  return state;
}

export function reserveTurnStart(
  this: AgentRuntimeInternal,
  turnId: TurnId,
  traceContext: TraceContext,
  kind: ActiveTurnKind,
): void {
  if (this.activeTurn) throw busy(kind, this.activeTurn.turnId, turnId);
  if (this.activeTurnStartReservation)
    throw busy(kind, this.activeTurnStartReservation.turnId, turnId);
  this.activeTurnStartReservation = { kind, traceContext, turnId };
}

export function releaseTurnStart(this: AgentRuntimeInternal, turnId: TurnId): void {
  if (this.activeTurnStartReservation?.turnId === turnId)
    this.activeTurnStartReservation = undefined;
}

export function finishActiveTurn(
  this: AgentRuntimeInternal,
  activeTurn: ActiveTurnSteeringState | undefined,
): void {
  if (activeTurn !== undefined && this.activeTurn === activeTurn) this.activeTurn = undefined;
}

export function createPendingInputId(this: AgentRuntimeInternal, turnId: TurnId): string {
  this.pendingInputSequence += 1;
  return `pending_${turnId}_${this.pendingInputSequence}`;
}

function busy(kind: ActiveTurnKind, activeTurnId: TurnId, nextTurnId: TurnId): Error {
  return createCoreError(
    CoreErrorType.TurnInProgress,
    `Cannot start ${kind} turn while another turn is active`,
    { context: { activeTurnId, nextTurnId }, recoverable: true },
  );
}
