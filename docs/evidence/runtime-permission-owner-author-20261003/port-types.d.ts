import type {
  SessionEvent,
  SessionEventType,
  TraceContext,
  SessionId,
  SessionEntryInfo,
  SessionModeChangedPayload,
  TurnInputIntentMetadata,
} from "@knorvia/contracts";
import type { ExecutionState } from "@knorvia/shared";

// Structural reading aid for allocated owners, not a replacement runtime interface.
export interface RuntimePortFacts {
  sessionId: SessionId;
  rootTraceContext: TraceContext;
  config: { mode?: string; planEnabled?: boolean };
  permissionFullAccessPending?: boolean;
  pendingInputReservations: Map<string, string>;
  pendingInputDrains?: number;
  lastPermissionGrantId?: string;
  sessionPersisted: boolean;
  needsPlanModeExitReminder: boolean;
  activeTurn?: { pendingInputs: Array<{ id: string; intent?: TurnInputIntentMetadata }> };
  sessionStore?: {
    sessionEntries?(input: { sessionID: SessionId; type?: string }): Promise<SessionEntryInfo[]>;
    saveSessionEntry?(input: SessionEntryInfo): Promise<void>;
    commitPermissionFullAccess?(input: {
      sessionID: SessionId;
      queueItemIds: string[];
      signal?: AbortSignal;
      execution: SessionEntryInfo;
      receipt: SessionEntryInfo;
    }): Promise<void>;
  };
  eventStore: { getEvents(sessionId: SessionId): Promise<SessionEvent[]> };
  rebuildProjection(): Promise<{ pendingSteerInputs: Array<{ pendingInputId: string }> }>;
  createEvent(type: SessionEventType, payload: unknown, trace: TraceContext): SessionEvent;
  appendEvent(event: SessionEvent, trace: TraceContext): Promise<void>;
  notifyEventSinks(event: SessionEvent, trace: TraceContext): Promise<void>;
  readSessionTargetForContext?(trace: TraceContext): Promise<{ status: string } | null>;
}
export declare function resolveExecutionState(
  input: { mode?: string; planEnabled?: boolean },
  current?: ExecutionState,
): ExecutionState;
export declare const PERMISSION_FULL_ACCESS_ENTRY: "runtime/permission_full_access";
export declare const SESSION_ENTRY_EXECUTION_STATE: "runtime/execution_state";
export declare const permissionFullAccessReceiptSchema: {
  parse(input: unknown): {
    interactionId: string;
    event: SessionEvent & { payload: SessionModeChangedPayload };
  };
};
