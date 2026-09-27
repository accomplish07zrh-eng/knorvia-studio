// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors

export function textField(record: Record<string, unknown>, key: string): string | undefined {
  const candidate = record[key];
  if (typeof candidate !== "string") return undefined;
  const text = candidate.trim();
  return text.length ? text : undefined;
}

/** Projects metadata into explicitly separate browser and computer wire identities. */
export function callContext(
  meta: Record<string, unknown>,
  computerUse = false,
): Record<string, unknown> {
  const read = (key: string) => textField(meta, key);
  const sessionId = read("session_id");
  if (!sessionId) throw new Error("Request is missing session_id metadata");
  const turnId = read("turn_id");
  const traceId = read("trace_id");
  const common = {
    sessionId,
    runtimeScope: "main",
    ...(turnId ? { turnId } : {}),
    ...(traceId
      ? {
          trace: { traceId, spanId: read("span_id"), parentSpanId: read("parent_span_id") },
        }
      : {}),
  };
  // Browser 身份由可信宿主会话派生，不接受客户端工作区断言；CUA 保留其独立合同。
  if (!computerUse) return common;
  const workspacePath = read("workspace_path");
  const workspaceIdentity = read("workspace_identity");
  const remoteSessionId = read("remote_session_id");
  const workspaceKey = read("workspace_key") ?? workspaceIdentity ?? workspacePath;
  if (!workspaceKey) throw new Error("Request is missing workspaceKey metadata");
  const clientMode = read("client_mode") ?? "desktop-continuous";
  return {
    ...common,
    ...(workspacePath ? { workspacePath } : {}),
    ...(workspaceIdentity ? { workspaceIdentity } : {}),
    ...(remoteSessionId ? { remoteSessionId } : {}),
    workspaceKey,
    clientMode,
    deliveryKind: read("delivery_kind") ?? clientMode,
  };
}
