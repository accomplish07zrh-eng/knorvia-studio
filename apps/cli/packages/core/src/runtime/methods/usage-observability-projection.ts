import type { SessionEvent } from "@knorvia/contracts";
import { SessionEventType, isCoreError } from "../deps.js";

/** Interpret recorded observations; this module performs no writes. */
interface ModelNetworkObservation {
  type: string;
  message?: string;
  retryable?: boolean;
  reason?: string;
}

interface UsageErrorInfo {
  code?: string;
  message?: string;
  retryable?: boolean;
  type?: string;
}

export interface ToolUsagePayload {
  toolCallId?: unknown;
  toolName?: unknown;
  decision?: unknown;
  startedAt?: unknown;
  outputBytes?: unknown;
  stdoutBytes?: unknown;
  stderrBytes?: unknown;
  duration?: unknown;
  result?: {
    perf?: { detail?: { kind?: string; command?: { exitCode?: unknown } } };
    returnedBytes?: unknown;
    originalBytes?: unknown;
    truncated?: unknown;
  };
  error?: { type?: unknown; code?: unknown; message?: unknown };
}

export function modelNetworkObservations(
  events: readonly SessionEvent[],
): ModelNetworkObservation[] {
  return events
    .filter((event) => event.type === SessionEventType.ModelNetworkStatus)
    .map((event) => event.payload)
    .filter(
      (payload) => payload && typeof payload === "object" && "type" in payload,
    ) as ModelNetworkObservation[];
}

export function firstModelTokenAt(
  events: readonly SessionEvent[],
  startIndex: number,
): number | undefined {
  const first = events.slice(startIndex).find((event) => {
    if (event.type !== SessionEventType.ModelStreaming) return false;
    const payload = event.payload as { kind?: string; delta?: { length: number } };
    return (
      (payload.kind === "text_delta" || payload.kind === "reasoning_delta") &&
      !!payload.delta &&
      payload.delta.length > 0
    );
  });
  return first?.timestamp.getTime();
}

export function usageErrorInfo(
  error: unknown,
  failed: ModelNetworkObservation | undefined,
): UsageErrorInfo {
  if (isCoreError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      type: error.type,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      retryable: failed?.retryable,
      type: failed?.reason ?? error.name,
    };
  }
  if (failed) {
    return { message: failed.message, retryable: failed.retryable, type: failed.reason };
  }
  return {};
}

export function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function usageCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
