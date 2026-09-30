// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  ModelRequestSessionType as ModelRequestSessionTypeValue,
  ResolvedModelApiCallObservation,
} from "@knorvia/contracts";
import type { ModelStatusContext } from "./runner-status.js";
export function normalizeModelSessionIdForAttribution(
  sessionId: ModelStatusContext["sessionId"],
): string | undefined {
  if (sessionId === undefined || sessionId === null) return undefined;
  const value = String(sessionId);
  const normalized = value.startsWith("sess_") ? value.slice("sess_".length) : value;
  return normalized || undefined;
}
export function resolveModelRequestSessionType(
  explicitType: unknown,
  modelCall: Pick<ResolvedModelApiCallObservation, "actorKind" | "operation">,
): ModelRequestSessionTypeValue {
  if (explicitType === "main" || explicitType === "subagent" || explicitType === "other")
    return explicitType as ModelRequestSessionTypeValue;
  return (
    modelCall.actorKind === "subagent" || String(modelCall.operation).includes("subagent")
      ? "subagent"
      : modelCall.actorKind === "main"
        ? "main"
        : "other"
  ) as ModelRequestSessionTypeValue;
}
export function createModelRequestAttributionHeaders(
  context: ModelStatusContext,
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-knorvia-request-id": context.requestId,
    "x-knorvia-trace-id": String(context.traceId),
    "x-knorvia-session-type": context.modelRequestSessionType,
  };
  if (context.queryId) headers["x-knorvia-query-id"] = String(context.queryId);
  const session = normalizeModelSessionIdForAttribution(context.sessionId);
  if (session) headers["x-knorvia-session-id"] = session;
  return headers;
}
