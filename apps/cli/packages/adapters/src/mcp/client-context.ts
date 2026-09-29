// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY,
  type McpCallToolRequest,
  type McpToolCallResult,
} from "@knorvia/contracts";

const REQUEST_CONTEXT_KEY = "com.knorvia-studio/request-context";

export function toolRequestMetadata(
  request: McpCallToolRequest,
): Record<string, unknown> | undefined {
  if (!(request.trace || request.runtimeScope || request.workspaceKey || request.workspacePath))
    return undefined;
  const context: Record<string, unknown> = {};
  const trace = request.trace;
  if (trace) {
    context.trace_id = trace.traceId;
    if (trace.spanId) context.span_id = trace.spanId;
    if (trace.parentSpanId) context.parent_span_id = trace.parentSpanId;
    if (trace.sessionId) context.session_id = trace.sessionId;
    if (trace.turnId) context.turn_id = trace.turnId;
  }
  if (request.runtimeScope) context.runtime_scope = request.runtimeScope;
  if (request.workspacePath) context.workspace_path = request.workspacePath;
  if (request.workspaceIdentity) context.workspace_identity = request.workspaceIdentity;
  if (request.workspaceKey) context.workspace_key = request.workspaceKey;
  if (request.remoteSessionId) context.remote_session_id = request.remoteSessionId;
  if (request.clientMode) context.client_mode = request.clientMode;
  if (request.deliveryKind) context.delivery_kind = request.deliveryKind;
  if (request.turnId && !trace?.turnId) context.turn_id = request.turnId;
  return { ...context, [REQUEST_CONTEXT_KEY]: context };
}

export function toolResultValue(
  value: Record<string, unknown>,
  serverRequestId: string | undefined,
): McpToolCallResult {
  const failure = typeof value.isError === "boolean" ? value.isError : undefined;
  let meta =
    value._meta !== null && typeof value._meta === "object" && !Array.isArray(value._meta)
      ? (value._meta as Record<string, unknown>)
      : undefined;
  if (failure && serverRequestId)
    meta = { ...meta, [KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY]: serverRequestId };
  return {
    content: Array.isArray(value.content) ? value.content : [{ type: "text", text: "" }],
    structuredContent: value.structuredContent,
    isError: failure,
    _meta: meta,
  };
}
