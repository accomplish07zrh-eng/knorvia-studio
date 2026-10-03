import type { CollaborationMode, ModelSelection, ModelSelectionOrigin, SessionEvent, TraceContext, TurnSteerInput, TurnSteerRejectReason, TurnSteerResult, TurnId } from "../deps.js";
import type { ActiveTurnKind, ActiveTurnSteeringState, DrainedPendingInputDiagnostics } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function steerTurn(this: AgentRuntimeInternal, input: string | TurnSteerInput): Promise<TurnSteerResult>;
export declare function enqueueDeferredInput(this: AgentRuntimeInternal, input: string | TurnSteerInput): Promise<TurnSteerResult>;
export declare function beginActiveTurn(this: AgentRuntimeInternal, turnId: TurnId, traceContext: TraceContext, kind: ActiveTurnKind, steerable: boolean, options?: {
    inputId?: string;
}): ActiveTurnSteeringState;
export declare function reserveTurnStart(this: AgentRuntimeInternal, turnId: TurnId, traceContext: TraceContext, kind: ActiveTurnKind): void;
export declare function releaseTurnStart(this: AgentRuntimeInternal, turnId: TurnId): void;
export declare function finishActiveTurn(this: AgentRuntimeInternal, activeTurn: ActiveTurnSteeringState | undefined): void;
export declare function createPendingInputId(this: AgentRuntimeInternal, turnId: TurnId): string;
export declare function rejectTurnSteer(this: AgentRuntimeInternal, reason: TurnSteerRejectReason, options: {
    activeTurn?: ActiveTurnSteeringState;
    expectedTurnId?: TurnId;
    inputPreview?: string;
    inputSize?: number;
    traceContext?: TraceContext;
}): Promise<TurnSteerResult>;
export declare function hasPendingInput(this: AgentRuntimeInternal, activeTurn: ActiveTurnSteeringState): boolean;
export declare function hasInlineGuidePendingInput(this: AgentRuntimeInternal, activeTurn: ActiveTurnSteeringState): boolean;

export declare function fallbackPendingGuidesToQueue(this: AgentRuntimeInternal, options: {
    activeTurn: ActiveTurnSteeringState;
    events?: SessionEvent[];
    reasonCode: "guide.noToolBoundary" | "guide.turnInterrupted";
    traceContext: TraceContext;
}): Promise<number>;
export declare function reservePendingInputById(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    reservationId: string;
    traceContext: TraceContext;
}): Promise<boolean>;
export declare function markPendingInputPromoting(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    reservationId: string;
    traceContext: TraceContext;
}): Promise<boolean>;
export declare function releasePendingInputReservation(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    reservationId: string;
    traceContext: TraceContext;
}): Promise<boolean>;

export declare function removePendingInputById(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    reason: "user_removed" | "promoted";
    reservationId?: string;
    traceContext: TraceContext;
}): Promise<boolean>;

export declare function discardHeldPendingInputById(this: AgentRuntimeInternal, pendingInputId: string, traceContext: TraceContext, reservationId?: string, reason?: "user_removed" | "promoted"): Promise<boolean>;

export declare function clearAllPendingInputs(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<number>;

export declare function editPendingInputById(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    newText: string;
    traceContext: TraceContext;
}): Promise<boolean>;

export declare function reorderPendingInput(this: AgentRuntimeInternal, options: {
    pendingInputId: string;
    beforePendingInputId: string | null;
    traceContext: TraceContext;
}): Promise<boolean>;

export declare function setQueueAutoDrain(this: AgentRuntimeInternal, options: {
    autoDrain: boolean;
    traceContext: TraceContext;
}): Promise<void>;

export declare function completeExternalQueueDrain(this: AgentRuntimeInternal): void;

export declare function setFollowupMode(this: AgentRuntimeInternal, options: {
    mode: "queue" | "guide";
    traceContext: TraceContext;
}): Promise<void>;

export declare function emitModelSelected(this: AgentRuntimeInternal, options: {
    modelSelection: ModelSelection;
    model?: import("../deps.js").Model;
    effectiveReasoningLevel?: string;
    previousModelSelection?: ModelSelection | null;
    origin?: ModelSelectionOrigin;
    supportedThoughtLevels?: readonly string[];
    traceContext: TraceContext;
}): Promise<void>;

export declare function emitModeChanged(this: AgentRuntimeInternal, options: {
    mode: CollaborationMode;
    previousMode: CollaborationMode;
    traceContext: TraceContext;
}): Promise<void>;
export declare function drainPendingInput(this: AgentRuntimeInternal, options: {
    activeTurn: ActiveTurnSteeringState;
    events: SessionEvent[];
    traceContext: TraceContext;
}): Promise<DrainedPendingInputDiagnostics | undefined>;
export declare function discardPendingInput(this: AgentRuntimeInternal, options: {
    activeTurn: ActiveTurnSteeringState;
    events?: SessionEvent[];
    reason: "turn_cancelled" | "turn_failed" | "session_resumed";
    traceContext: TraceContext;
}): Promise<void>;
export declare function discardPersistedPendingSteerInputs(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<number>;
