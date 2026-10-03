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
  const previous = this.activeTurn ?? this.turnStartReservation;
  if (
    this.activeTurn ||
    (this.turnStartReservation && this.turnStartReservation.turnId !== turnId)
  ) {
    throw createCoreError(
      CoreErrorType.TurnInProgress,
      `Cannot start ${kind} turn while another turn is active`,
      { context: { activeTurnId: previous?.turnId, nextTurnId: turnId }, recoverable: true },
    );
  }
  const state: ActiveTurnSteeringState = {
    goalStateChangeReminderDeferralOpen: false,
    kind,
    pendingInputs: [],
    steerable,
    traceContext,
    turnId,
    ...(options?.inputId !== undefined ? { inputId: options.inputId } : {}),
  };
  this.turnStartReservation = undefined;
  this.activeTurn = state;
  return state;
}

export function reserveTurnStart(
  this: AgentRuntimeInternal,
  turnId: TurnId,
  traceContext: TraceContext,
  kind: ActiveTurnKind,
): void {
  const previous = this.activeTurn ?? this.turnStartReservation;
  if (previous) {
    throw createCoreError(
      CoreErrorType.TurnInProgress,
      `Cannot start ${kind} turn while another turn is active`,
      { context: { activeTurnId: previous.turnId, nextTurnId: turnId }, recoverable: true },
    );
  }
  this.turnStartReservation = { kind, traceContext, turnId };
}

export function releaseTurnStart(this: AgentRuntimeInternal, turnId: TurnId): void {
  if (this.turnStartReservation?.turnId === turnId) this.turnStartReservation = undefined;
}

export function finishActiveTurn(
  this: AgentRuntimeInternal,
  activeTurn: ActiveTurnSteeringState | undefined,
): void {
  if (activeTurn !== undefined && this.activeTurn === activeTurn) this.activeTurn = undefined;
}

export function createPendingInputId(this: AgentRuntimeInternal, turnId: TurnId): string {
  this.pendingInputSequence += 1;
  return `pending*${turnId}*${this.pendingInputSequence}`;
}
