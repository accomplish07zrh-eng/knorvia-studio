// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Socket } from "node:net";
import type { BrowserControlPort, Logger, TraceContext } from "@knorvia/contracts";
import {
  nodeReplBrowserBrokerRequestSchema,
  type NodeReplBrowserBrokerRequest,
  type NodeReplBrowserBrokerResponse,
} from "@knorvia/shared";
import { readBrowserBrokerFrame } from "./browser-broker-frame.js";

const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
interface ConnectionOptions {
  browserControlPort: BrowserControlPort;
  token: string;
  logger: Logger;
  signal: AbortSignal;
}

function responseId(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const id = Reflect.get(payload, "id");
  return typeof id === "string" && VALID_UUID.test(id) ? id : fallback;
}

function authenticate(request: NodeReplBrowserBrokerRequest, token: string): void {
  const supplied = Buffer.from(request.token),
    expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new Error("Node REPL browser broker request is not authorized");
  if (request.runtimeScope !== "main") throw new Error("Browser is not available in subagent");
}

async function invoke(
  request: NodeReplBrowserBrokerRequest,
  port: BrowserControlPort,
  signal: AbortSignal,
): Promise<NodeReplBrowserBrokerResponse> {
  signal.throwIfAborted();
  const scope = {
    sessionId: request.sessionId,
    turnId: request.turnId,
    traceContext: request.trace as TraceContext | undefined,
    signal,
  };
  if (request.op === "list") return { id: request.id, ok: true, browsers: await port.list(scope) };
  const result = await port.execute({
    ...scope,
    browserId: request.browserId,
    browserGeneration: request.browserGeneration,
    command: request.command,
  });
  return { id: request.id, ok: true, result };
}

export async function serveBrowserBrokerConnection(
  socket: Socket,
  options: ConnectionOptions,
): Promise<void> {
  const lifetime = new AbortController();
  const signal = AbortSignal.any([lifetime.signal, options.signal]);
  let finished = false;
  let id: string = randomUUID();
  const disconnected = () => {
    if (!finished) lifetime.abort();
  };
  // 监听延续到写回和断开，防止取消后的 EPIPE 成为进程级未捕获异常。
  socket.on("error", (error) => {
    disconnected();
    options.logger.debug("Node REPL browser broker connection dropped", {
      event: "node_repl.browser_broker.connection.dropped",
      error: error.message,
    });
  });
  socket.once("close", disconnected);
  const reply = (value: NodeReplBrowserBrokerResponse) => {
    finished = true;
    if (socket.writable && !socket.destroyed) socket.end(JSON.stringify(value) + "\n");
  };
  try {
    const payload = await readBrowserBrokerFrame(socket, signal);
    id = responseId(payload, id);
    const request = nodeReplBrowserBrokerRequestSchema.parse(payload);
    authenticate(request, options.token);
    reply(await invoke(request, options.browserControlPort, signal));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reply({ id, ok: false, error: message.replaceAll(options.token, "[redacted]") });
  }
}
