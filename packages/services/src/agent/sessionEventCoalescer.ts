import type { KnorviaSessionEvent } from "@knorvia/shared";
import type { KnorviaAgentServiceEvent } from "#src/agent/agent.js";

type SessionServiceEvent = Extract<KnorviaAgentServiceEvent, { type: "session.event" }>;

interface BackgroundSessionEventCoalescer {
  accept(event: KnorviaAgentServiceEvent): void;
  flush(): void;
  dispose(): void;
}

function recordPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function stringField(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  return typeof value === "string" ? value : "";
}

function eventKey(event: KnorviaSessionEvent): string | undefined {
  const payload = recordPayload(event.payload);
  if (event.type === "model.streaming") {
    const kind = payload.kind;
    if (
      (kind !== "text_delta" && kind !== "reasoning_delta" && kind !== "tool_input_delta") ||
      typeof payload.delta !== "string"
    ) {
      return undefined;
    }
    return [
      event.type,
      event.sessionId,
      event.turnId ?? "",
      kind,
      stringField(payload, "inputId"),
      stringField(payload, "assistantMessageId"),
      stringField(payload, "toolCallId"),
      stringField(payload, "parentToolUseId"),
      stringField(payload, "parentToolCallId"),
    ].join("\u0000");
  }
  if (event.type === "tool.updated" && payload.kind === "progress") {
    return [
      event.type,
      event.sessionId,
      event.turnId ?? "",
      stringField(payload, "inputId"),
      stringField(payload, "toolCallId"),
    ].join("\u0000");
  }
  if (event.type === "streamRecovery.updated") {
    return [
      event.type,
      event.sessionId,
      event.turnId ?? "",
      stringField(payload, "inputId"),
      event.traceId ?? "",
    ].join("\u0000");
  }
  return undefined;
}

function mergedEvent(current: KnorviaSessionEvent, next: KnorviaSessionEvent): KnorviaSessionEvent {
  if (current.type !== "model.streaming" || next.type !== "model.streaming") {
    return next;
  }
  const currentPayload = recordPayload(current.payload);
  const nextPayload = recordPayload(next.payload);
  const currentDelta = stringField(currentPayload, "delta");
  const nextDelta = stringField(nextPayload, "delta");
  return {
    ...next,
    payload: {
      ...nextPayload,
      delta: currentDelta + nextDelta,
    },
  } as KnorviaSessionEvent;
}

export function createBackgroundSessionEventCoalescer(params: {
  emit: (event: KnorviaAgentServiceEvent) => void;
  flushDelayMs?: number;
  maxItems?: number;
}): BackgroundSessionEventCoalescer {
  const flushDelayMs = params.flushDelayMs ?? 1500;
  const maxItems = params.maxItems ?? 96;
  const pending = new Map<string, SessionServiceEvent>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function cancelTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function flush(): void {
    const batch = Array.from(pending.values());
    pending.clear();
    cancelTimer();
    for (const event of batch) {
      params.emit(event);
    }
  }

  function accept(event: KnorviaAgentServiceEvent): void {
    if (disposed) {
      return;
    }
    if (event.type !== "session.event") {
      flush();
      params.emit(event);
      return;
    }
    const key = eventKey(event.event);
    if (key === undefined) {
      flush();
      params.emit(event);
      return;
    }
    const previous = pending.get(key);
    pending.set(
      key,
      previous ? { type: "session.event", event: mergedEvent(previous.event, event.event) } : event,
    );
    if (pending.size >= maxItems || flushDelayMs <= 0) {
      flush();
      return;
    }
    if (!disposed && !timer && !(flushDelayMs <= 0)) {
      timer = setTimeout(() => {
        timer = null;
        if (!disposed) {
          flush();
        }
      }, flushDelayMs);
    }
  }

  function dispose(): void {
    flush();
    disposed = true;
    cancelTimer();
  }

  return { accept, flush, dispose };
}
