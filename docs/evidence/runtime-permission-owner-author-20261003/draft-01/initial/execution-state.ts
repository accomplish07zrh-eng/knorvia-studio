import {
  SESSION_ENTRY_EXECUTION_STATE,
  SessionEventType,
  type SessionEntryInfo,
  type SessionId,
  type TraceContext,
} from "@knorvia/contracts";
import { resolveExecutionState, type ExecutionState } from "@knorvia/shared";
import type { AgentRuntimeInternal } from "./internal.js";
import {
  recoverPendingPermissionGrant,
  unpublishedPermissionGrants,
} from "./permission-grant-recovery.js";

export function readRuntimeExecutionState(runtime: AgentRuntimeInternal): ExecutionState {
  return resolveExecutionState(runtime.config);
}

export function buildExecutionStateEntry(
  sessionId: SessionId,
  state: ExecutionState,
): SessionEntryInfo {
  const timestamp = Date.now();
  return {
    id: `${sessionId}:runtime-execution-state`,
    sessionID: sessionId,
    type: SESSION_ENTRY_EXECUTION_STATE,
    touchSession: false,
    time: { created: timestamp, updated: timestamp },
    data: state,
  };
}

async function persistExecutionState(
  runtime: AgentRuntimeInternal,
  state: ExecutionState,
): Promise<void> {
  if (runtime.sessionPersisted && runtime.sessionStore?.saveSessionEntry) {
    await runtime.sessionStore.saveSessionEntry(
      buildExecutionStateEntry(runtime.sessionId, state),
    );
  }
}

export async function applyRuntimeExecutionState(
  runtime: AgentRuntimeInternal,
  input: { mode?: string; planEnabled?: boolean },
  cause: {
    source: "command" | "tool";
    toolCallId?: string;
    traceContext?: TraceContext;
  },
): Promise<ExecutionState> {
  if (runtime.permissionFullAccessPending) {
    throw new Error("Permission update is busy; retry mode change");
  }
  if (unpublishedPermissionGrants.has(runtime)) {
    await recoverPendingPermissionGrant(runtime);
  }

  const previous = resolveExecutionState(runtime.config);
  const next = resolveExecutionState(input, previous);
  if (next.mode === previous.mode && next.planEnabled === previous.planEnabled) {
    return next;
  }

  if (!previous.planEnabled && next.planEnabled) {
    const target = await runtime.readSessionTargetForContext?.(
      cause.traceContext ?? runtime.rootTraceContext,
    );
    if (target?.status === "active") {
      throw new Error("Plan and Goal cannot be active at the same time.");
    }
  }

  await persistExecutionState(runtime, next);
  runtime.config.mode = next.mode;
  runtime.config.planEnabled = next.planEnabled;
  if (previous.planEnabled !== next.planEnabled) {
    runtime.needsPlanModeExitReminder = !next.planEnabled;
  }

  const trace = cause.traceContext ?? runtime.rootTraceContext;
  await runtime.appendEvent(
    runtime.createEvent(
      SessionEventType.SessionModeChanged,
      {
        ...next,
        previousMode: previous.mode,
        previousPlanEnabled: previous.planEnabled,
        source: cause.source,
        ...(cause.toolCallId ? { toolCallId: cause.toolCallId } : {}),
      },
      trace,
    ),
    trace,
  );
  return next;
}
