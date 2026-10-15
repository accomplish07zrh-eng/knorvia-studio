// SPDX-License-Identifier: Apache-2.0
// 请求归因头：每次模型请求带上 requestId/traceId/sessionType，会话 id 去掉 sess_ 前缀后随行。
// 头名与「sess_」前缀是跨端约定，逐字保持。

import type {
  ModelRequestSessionType as ModelRequestSessionTypeValue,
  ResolvedModelApiCallObservation,
} from "@knorvia/contracts";
import type { ModelStatusContext } from "./runner-status.js";

const SESSION_PREFIX = "sess_";
const HEADER = {
  requestId: "x-knorvia-request-id",
  traceId: "x-knorvia-trace-id",
  sessionType: "x-knorvia-session-type",
  queryId: "x-knorvia-query-id",
  sessionId: "x-knorvia-session-id",
} as const;
const EXPLICIT_KINDS = new Set(["main", "subagent", "other"]);

export function normalizeModelSessionIdForAttribution(
  raw: ModelStatusContext["sessionId"],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw);
  const trimmed = text.startsWith(SESSION_PREFIX) ? text.slice(SESSION_PREFIX.length) : text;
  return trimmed || undefined;
}

export function resolveModelRequestSessionType(
  claimed: unknown,
  call: Pick<ResolvedModelApiCallObservation, "actorKind" | "operation">,
): ModelRequestSessionTypeValue {
  if (typeof claimed === "string" && EXPLICIT_KINDS.has(claimed))
    return claimed as ModelRequestSessionTypeValue;
  const subagentSide = call.actorKind === "subagent" || String(call.operation).includes("subagent");
  if (subagentSide) return "subagent";
  return (call.actorKind === "main" ? "main" : "other") as ModelRequestSessionTypeValue;
}

export function createModelRequestAttributionHeaders(
  state: ModelStatusContext,
): Record<string, string> {
  const projected: Record<string, string> = {};
  projected[HEADER.requestId] = state.requestId;
  projected[HEADER.traceId] = String(state.traceId);
  projected[HEADER.sessionType] = state.modelRequestSessionType;
  if (state.queryId) projected[HEADER.queryId] = String(state.queryId);
  const trimmedSession = normalizeModelSessionIdForAttribution(state.sessionId);
  if (trimmedSession) projected[HEADER.sessionId] = trimmedSession;
  return projected;
}
