import {
  createSessionEvent,
  SessionEventType,
  traceContextToLogContext,
} from "../deps.js";
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { persistDurableEvent } from "./events-durable.js";
import { ensureSessionPersisted } from "./events-session.js";
import { admitAppendSummary, flushAppendSummaries } from "./events-summary.js";
import { recordToolUsageFromEvent } from "./usage-observability.js";

export { ensureSessionPersisted };

const lifecycleTypes = new Set<SessionEventType>([
  SessionEventType.SessionTitleUpdated,
  SessionEventType.TurnStarted,
  SessionEventType.ModelRequest,
  SessionEventType.ModelComplete,
  SessionEventType.TurnComplete,
  SessionEventType.TurnError,
]);

export function createEvent(
  this: AgentRuntimeInternal,
  type: SessionEventType,
  payload: unknown,
  traceContext: TraceContext,
): SessionEvent {
  return createSessionEvent(type, this.sessionId, payload, {
    turnId: traceContext.turnId,
    traceId: traceContext.traceId,
  });
}

export function isSessionPersisted(this: AgentRuntimeInternal): boolean {
  return this.sessionPersisted;
}

export async function appendEvent(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  const lifecycle = lifecycleTypes.has(event.type);
  const startedAt = Date.now();
  let phase = "event_store.append";
  if (lifecycle) {
    this.logger?.info("Session event persistence started", {
      ...traceContextToLogContext(traceContext),
      event: "session.event.persistence.started",
      module: "core.runtime",
      sessionEventType: event.type,
      status: "started",
    });
  }
  try {
    const storedEvent = await this.eventStore.append(event);
    phase = "session_event.persist_durable";
    await persistDurableEvent(this, storedEvent, traceContext);
    phase = "session_event.record_usage";
    await recordToolUsageFromEvent(this, storedEvent, traceContext);
    phase = "session_event.notify_sinks";
    await this.notifyEventSinks(storedEvent, traceContext);
    if (lifecycle) {
      this.logger?.info("Session event persistence completed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        event: "session.event.persistence.completed",
        module: "core.runtime",
        sessionEventSequenceNumber: storedEvent.sequenceNumber,
        sessionEventType: storedEvent.type,
        status: "completed",
      });
    }
    if (admitAppendSummary(this, storedEvent, traceContext)) return;
    flushAppendSummaries(this, traceContext, "low_frequency_event");
    this.logger?.debug("Session event appended", {
      ...traceContextToLogContext(traceContext),
      event: "event_store.appended",
      module: "core.runtime",
      sessionEventSequenceNumber: storedEvent.sequenceNumber,
      sessionEventType: storedEvent.type,
    });
  } catch (error) {
    if (lifecycle) {
      this.logger?.warn("Session event persistence failed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        event: "session.event.persistence.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        module: "core.runtime",
        phase,
        sessionEventType: event.type,
        status: "failed",
      });
    }
    throw error;
  }
}

export async function notifyEventSinks(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  for (const sink of this.eventSinks) {
    try {
      await sink.onSessionEvent(event);
    } catch (error) {
      this.logger?.warn("Session event sink failed", {
        ...traceContextToLogContext(traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_event_sink.failed",
        module: "core.runtime",
        sessionEventType: event.type,
        status: "failed",
      });
    }
  }
}
