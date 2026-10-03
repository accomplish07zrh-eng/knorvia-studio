import { SessionEventType, traceContextToLogContext } from "../deps.js";
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

interface AppendSummary {
  eventCount: number;
  eventType: SessionEventType;
  firstEventId: string;
  firstSessionEventSequenceNumber: SessionEvent["sequenceNumber"];
  lastEventId: string;
  lastSessionEventSequenceNumber: SessionEvent["sequenceNumber"];
  payloadBytes: number;
  payloadKinds: Record<string, number>;
}

const summaries = new WeakMap<AgentRuntimeInternal, Map<string, AppendSummary>>();
const summarizedTypes = new Set<SessionEventType>([
  SessionEventType.ModelStreaming,
  SessionEventType.ModelNetworkStatus,
  SessionEventType.StreamingToolLedgerUpdated,
  SessionEventType.ToolCallProgress,
]);

function payloadKind(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const kind = (payload as { kind?: unknown }).kind;
    if (typeof kind === "string" && kind.length > 0) return kind;
  }
  return "<missing>";
}

function payloadBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload) ?? "null", "utf8");
  } catch {
    return 0;
  }
}

function flushSummary(
  runtime: AgentRuntimeInternal,
  entries: Map<string, AppendSummary>,
  key: string,
  traceContext: TraceContext,
  flushReason: string,
): void {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  runtime.logger?.debug("Session event append summary", {
    ...traceContextToLogContext(traceContext),
    event: "event_store.appended.summary",
    eventCount: entry.eventCount,
    firstEventId: entry.firstEventId,
    firstSessionEventSequenceNumber: entry.firstSessionEventSequenceNumber,
    flushReason,
    lastEventId: entry.lastEventId,
    lastSessionEventSequenceNumber: entry.lastSessionEventSequenceNumber,
    module: "core.runtime",
    payloadBytes: entry.payloadBytes,
    payloadKinds: entry.payloadKinds,
    sessionEventType: entry.eventType,
  });
}

export function admitAppendSummary(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): boolean {
  if (!summarizedTypes.has(event.type)) return false;
  const key = `${traceContext.turnId ?? "session"}:${event.type}`;
  let entries = summaries.get(runtime);
  if (!entries) {
    entries = new Map();
    summaries.set(runtime, entries);
  }
  const kind = payloadKind(event.payload);
  const entry = entries.get(key);
  if (entry) {
    entry.eventCount++;
    entry.lastEventId = String(event.id);
    entry.lastSessionEventSequenceNumber = event.sequenceNumber;
    entry.payloadBytes += payloadBytes(event.payload);
    entry.payloadKinds[kind] = (entry.payloadKinds[kind] ?? 0) + 1;
    if (entry.eventCount >= 100) {
      flushSummary(runtime, entries, key, traceContext, "count_threshold");
    }
  } else {
    entries.set(key, {
      eventCount: 1,
      eventType: event.type,
      firstEventId: String(event.id),
      firstSessionEventSequenceNumber: event.sequenceNumber,
      lastEventId: String(event.id),
      lastSessionEventSequenceNumber: event.sequenceNumber,
      payloadBytes: payloadBytes(event.payload),
      payloadKinds: { [kind]: 1 },
    });
  }
  return true;
}

export function flushAppendSummaries(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
  flushReason: string,
): void {
  const entries = summaries.get(runtime);
  if (!entries) return;
  for (const key of entries.keys()) {
    flushSummary(runtime, entries, key, traceContext, flushReason);
  }
}
