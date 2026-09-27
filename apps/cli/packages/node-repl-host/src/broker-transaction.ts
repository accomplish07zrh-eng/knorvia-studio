// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { readFrame } from "./json-line.js";

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
export interface BrokerConnection {
  socketPath: string;
  token: string;
}

function requestLine(connection: BrokerConnection, payload: Record<string, unknown>, id: string) {
  const text = JSON.stringify({ ...payload, token: connection.token, id });
  if (text === undefined) throw new TypeError("Broker request is not JSON serializable");
  return text + "\n";
}

function successfulResponse(value: unknown, id: string): Record<string, unknown> {
  if (value === null || typeof value !== "object") throw new Error("Invalid broker response");
  const response = value as Record<string, unknown>;
  if (response.id !== id) throw new Error("Broker response id mismatch");
  if (response.ok === true) return response;
  throw new Error(typeof response.error === "string" ? response.error : "Broker rejected request");
}

/** A single request/response lease. Side effects are never retried here. */
export async function brokerCall(
  connection: BrokerConnection,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const id = randomUUID();
  // 旧 connect 回调中的 stringify 异常会越过 Promise，直接结束 MCP 宿主。
  // 先准备快照，既让失败正常拒绝，也确保无效参数不会建立有副作用的连接。
  const line = requestLine(connection, payload, id);
  signal.throwIfAborted();
  const socket = createConnection(connection.socketPath);
  const failure = new AbortController();
  const failed = (error: unknown) => failure.abort(error);
  const send = () => {
    if (signal.aborted || failure.signal.aborted) return;
    try {
      socket.write(line);
    } catch (error) {
      failed(error);
    }
  };
  // 保留错误接收器到 close，避免响应已结束后的异步写入错误成为未处理事件。
  socket.on("error", failed);
  socket.once("close", () => socket.off("error", failed));
  socket.once("connect", send);
  try {
    const value = await readFrame(
      socket,
      MAX_RESPONSE_BYTES,
      AbortSignal.any([signal, failure.signal]),
    );
    return successfulResponse(value, id);
  } finally {
    socket.off("connect", send);
    socket.destroy();
  }
}
