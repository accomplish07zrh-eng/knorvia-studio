// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { SessionEventType, type SessionEvent } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionModelContext } from "../types.js";
import { ToolDeadline } from "./deadline/pausable-deadline.js";
import { isRecord } from "./utils.js";
export { ToolDeadline };
export { executeWithTimeout } from "./deadline/handler-settlement.js";

const CLOCK_EVENTS = new Map<string, "pause" | "resume">([
  ["model_request_queued", "pause"],
  ["model_request_admitted", "resume"],
]);
export function observeToolAdmissionClock(
  event: SessionEvent,
  toolCallId: string,
  deadline: ToolDeadline,
): void {
  if (event.type !== SessionEventType.ModelNetworkStatus) return;
  const payload = event.payload as { toolCallId?: unknown; type?: unknown } | undefined;
  if (payload?.toolCallId !== toolCallId) return;
  for (const [eventType, action] of CLOCK_EVENTS) {
    if (payload.type === eventType) {
      deadline[action]();
      return;
    }
  }
}

export function resolveTimeoutMs(
  entry: ToolEntry,
  input: unknown,
  defaultTimeoutMs: number,
  context?: ToolExecutionModelContext,
): number | undefined {
  const policy = entry.timeout;
  if (policy?.kind === "none") return undefined;
  const fallback = policy?.defaultMs ?? entry.metadata.timeoutMs ?? defaultTimeoutMs;
  let selected = entry.resolveTimeoutBudgetMs?.(input, context);
  if (selected == null) {
    if (policy?.allowCallOverride && isRecord(input) && typeof input.timeout_ms === "number")
      selected = input.timeout_ms;
    else if (policy?.allowCallOverride && isRecord(input) && typeof input.timeout === "number")
      selected = input.timeout;
    else selected = fallback;
  }
  const limited = policy?.maxMs === undefined ? selected : Math.min(selected, policy.maxMs);
  const grace = Math.max(0, Math.trunc(policy?.cleanupGraceMs ?? 0));
  return Math.max(1, Math.trunc(limited)) + grace;
}

export function linkAbortSignal(
  parent: AbortSignal | undefined,
  child: AbortController,
): () => void {
  if (parent === undefined) return () => {};
  const forward = () => {
    if (!child.signal.aborted) child.abort(parent.reason);
  };
  if (parent.aborted) {
    forward();
    return () => {};
  }
  parent.addEventListener("abort", forward);
  return () => {
    parent.removeEventListener("abort", forward);
  };
}
