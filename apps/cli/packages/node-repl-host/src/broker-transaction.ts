// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { readFrame } from "./json-line.js";

const RESPONSE_LIMIT = 32 * 1024 * 1024;
const REQUEST_NOT_SERIALIZABLE = "Broker request is not JSON serializable";
const INVALID_RESPONSE = "Invalid broker response";
const MISMATCHED_RESPONSE = "Broker response id mismatch";
const REJECTED_REQUEST = "Broker rejected request";

export interface BrokerConnection {
  socketPath: string;
  token: string;
}

interface SealedRequest {
  id: string;
  line: string;
}

function sealRequest(broker: BrokerConnection, body: Record<string, unknown>): SealedRequest {
  const id = randomUUID();
  const text = JSON.stringify({ ...body, token: broker.token, id });
  // 先完成序列化再建连：不可序列化的参数不能让宿主在 connect 回调里结束进程。
  if (typeof text !== "string") throw new TypeError(REQUEST_NOT_SERIALIZABLE);
  return { id, line: `${text}\n` };
}

function acceptReply(raw: unknown, expectedId: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object") throw new Error(INVALID_RESPONSE);
  const reply = raw as Record<string, unknown>;
  if (reply.id !== expectedId) throw new Error(MISMATCHED_RESPONSE);
  if (reply.ok !== true) {
    throw new Error(typeof reply.error === "string" ? reply.error : REJECTED_REQUEST);
  }
  return reply;
}

/** 单次调用独占连接；调用方信号负责取消，传输故障与帧读取谁先结束谁生效。 */
export async function brokerCall(
  broker: BrokerConnection,
  body: Record<string, unknown>,
  abort: AbortSignal,
): Promise<Record<string, unknown>> {
  abort.throwIfAborted();
  const request = sealRequest(broker, body);
  abort.throwIfAborted();

  let rejectTransport!: (reason: unknown) => void;
  const transport = new Promise<never>((_, reject) => {
    rejectTransport = reject;
  });
  let settled = false;
  let transportFaulted = false;
  const fail = (reason: unknown) => {
    if (settled) return;
    transportFaulted = true;
    rejectTransport(reason);
  };

  const socket = createConnection(broker.socketPath);
  const dispatch = () => {
    if (settled || transportFaulted || abort.aborted) return;
    try {
      socket.write(request.line, (error) => {
        if (error) fail(error);
      });
    } catch (reason) {
      fail(reason);
    }
  };
  // 错误监听保留到 close：响应结算后、销毁连接前的异步写错误不能成为未处理事件。
  socket.on("error", fail);
  socket.once("close", () => socket.off("error", fail));
  socket.once("connect", dispatch);

  try {
    const frame = await Promise.race([readFrame(socket, RESPONSE_LIMIT, abort), transport]);
    return acceptReply(frame, request.id);
  } finally {
    settled = true;
    socket.off("connect", dispatch);
    socket.destroy();
  }
}
