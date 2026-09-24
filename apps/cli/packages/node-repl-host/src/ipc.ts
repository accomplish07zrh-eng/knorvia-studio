import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";

/** 每条连接只允许一个有界 JSON 帧，按字节拼接避免跨 chunk 的 UTF-8 损坏。 */
export function readFrame(socket: Socket, limit: number, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      socket.off("data", data);
      socket.off("error", fail);
      socket.off("close", closed);
      signal.removeEventListener("abort", aborted);
    };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const closed = () => fail(new Error("Broker closed before returning a response"));
    const aborted = () => fail(signal.reason ?? new DOMException("aborted", "AbortError"));
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) { fail(new Error(`Broker frame exceeded ${limit} bytes`)); return; }
      const end = chunk.indexOf(10);
      chunks.push(end < 0 ? chunk : chunk.subarray(0, end));
      if (end < 0) return;
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (error) { reject(error); }
      chunks = [];
    };
    socket.on("data", data).once("error", fail).once("close", closed);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export async function brokerCall(
  connection: { socketPath: string; token: string },
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const id = randomUUID();
  const socket = createConnection(connection.socketPath);
  const response = readFrame(socket, 32 * 1024 * 1024, signal);
  socket.once("connect", () => socket.write(JSON.stringify({ ...payload, token: connection.token, id }) + "\n"));
  try {
    const value = await response;
    if (!value || typeof value !== "object") throw new Error("Invalid broker response");
    const frame = value as Record<string, unknown>;
    if (frame.id !== id) throw new Error("Broker response id mismatch");
    if (frame.ok !== true) throw new Error(typeof frame.error === "string" ? frame.error : "Broker rejected request");
    return frame;
  } finally { socket.destroy(); }
}

export function textField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function callContext(meta: Record<string, unknown>, computerUse = false): Record<string, unknown> {
  const sessionId = textField(meta, "session_id");
  if (!sessionId) throw new Error("Request is missing session_id metadata");
  const context: Record<string, unknown> = { sessionId, runtimeScope: "main" };
  const fields = { turn_id: "turnId", workspace_path: "workspacePath", workspace_identity: "workspaceIdentity", remote_session_id: "remoteSessionId" };
  for (const [source, target] of Object.entries(fields)) {
    const value = textField(meta, source);
    if (value) context[target] = value;
  }
  const traceId = textField(meta, "trace_id");
  if (traceId) context.trace = { traceId, spanId: textField(meta, "span_id"), parentSpanId: textField(meta, "parent_span_id") };
  if (computerUse) {
    context.workspaceKey = textField(meta, "workspace_key") ?? context.workspaceIdentity ?? context.workspacePath;
    if (!context.workspaceKey) throw new Error("Request is missing workspaceKey metadata");
    context.clientMode = textField(meta, "client_mode") ?? "desktop-continuous";
    context.deliveryKind = textField(meta, "delivery_kind") ?? context.clientMode;
  }
  return context;
}
