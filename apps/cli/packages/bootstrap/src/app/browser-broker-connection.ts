// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 一条 broker 连接的完整生命周期：读一帧 → 验身份 → 转发给控制端口 → 写回一帧。
//
// 这是**一次性**连接（一个请求换一个应答），因此状态机很短：
// 未完成 → 已回复。`finished` 唯一的作用是防止「断开后仍尝试写回」。
//
// 安全口径：错误文案在写回前必须抹掉 token（Host 可能把 token 放进异常消息）。

import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Socket } from "node:net";
import type { BrowserControlPort, Logger, TraceContext } from "@knorvia/contracts";
import {
  nodeReplBrowserBrokerRequestSchema,
  type NodeReplBrowserBrokerRequest,
  type NodeReplBrowserBrokerResponse,
} from "@knorvia/shared";
import { readBrowserBrokerFrame } from "./browser-broker-frame.js";

/** UUID 形状校验：客户端可能回传任意字符串，只接受合法 UUID。 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** 连接被拒绝时的固定文案（不回显任何凭据）。 */
const UNAUTHORIZED = "Node REPL browser broker request is not authorized";
const SUBAGENT_FORBIDDEN = "Browser is not available in subagent";
const REDACTION_PLACEHOLDER = "[redacted]";

/** 一条连接需要的外部依赖。 */
interface ConnectionOptions {
  browserControlPort: BrowserControlPort;
  token: string;
  logger: Logger;
  signal: AbortSignal;
}

/**
 * 从请求载荷里取应答 id；不合法就退回新生成的 UUID。
 *
 * 这样即使客户端没带 id（或带了个非法值），应答仍可被关联。
 *
 * @param payload - 已解析的请求载荷（可能不是对象）。
 * @param fallback - 兜底 id。
 * @returns 用于应答的 id。
 */
function responseId(payload: unknown, fallback: string): string {
  if (payload === null || typeof payload !== "object") return fallback;
  const candidate: unknown = Reflect.get(payload, "id");
  return typeof candidate === "string" && UUID_PATTERN.test(candidate) ? candidate : fallback;
}

/**
 * 校验请求来源。
 *
 * 两条独立检查：**token 匹配**（长度先比，避免 `timingSafeEqual` 抛错）
 * 与 **运行范围**（子代理不得使用浏览器）。
 *
 * @param request - 已通过 schema 校验的请求。
 * @param token - 本连接的共享令牌。
 */
function authenticate(request: NodeReplBrowserBrokerRequest, token: string): void {
  const supplied = Buffer.from(request.token);
  const expected = Buffer.from(token);
  const sameLength = supplied.length === expected.length;
  if (!sameLength || !timingSafeEqual(supplied, expected)) throw new Error(UNAUTHORIZED);
  if (request.runtimeScope !== "main") throw new Error(SUBAGENT_FORBIDDEN);
}

/**
 * 把请求转发给浏览器控制端口。
 *
 * 这段做的是**纯字段搬运**：字段名由 wire 协议定死（`sessionId` / `turnId` /
 * `browserId` / `browserGeneration` / `command`），不能改名也不能省，
 * 所以这里不做额外的中间变形 —— 多绕一步只会让「协议字段原样透传」更难核对。
 *
 * @param forwardContext - 请求、端口与中止信号。
 * @returns 应答载荷。
 */
async function forward(forwardContext: {
  readonly request: NodeReplBrowserBrokerRequest;
  readonly port: BrowserControlPort;
  readonly abort: AbortSignal;
}): Promise<NodeReplBrowserBrokerResponse> {
  const { request, port, abort } = forwardContext;
  abort.throwIfAborted();
  /** 两种 op 的共同前缀：会话、回合、trace、信号。 */
  const scope = {
    sessionId: request.sessionId,
    turnId: request.turnId,
    traceContext: request.trace as TraceContext | undefined,
    signal: abort,
  };
  if (request.op === "list") {
    const browsers = await port.list(scope);
    return { id: request.id, ok: true, browsers };
  }
  // 执行路径：scope 之上补三项浏览器身份，字段名与协议逐字一致。
  const executed = await port.execute({
    ...scope,
    browserId: request.browserId,
    browserGeneration: request.browserGeneration,
    command: request.command,
  });
  return { id: request.id, ok: true, result: executed };
}

/**
 * 处理一条 broker 连接。
 *
 * 监听 `error` **延续到写回与断开之后**：取消后对端可能已关闭，
 * 此时写回会触发 EPIPE —— 若不接住，它就成了进程级未捕获异常。
 *
 * @param socket - 已接受的连接。
 * @param options - 端口、令牌、日志与外部中止信号。
 */
export async function serveBrowserBrokerConnection(
  socket: Socket,
  options: ConnectionOptions,
): Promise<void> {
  // 本连接自己的中止源，与外部的合并：任一触发都停止处理。
  const owned = new AbortController();
  const signal = AbortSignal.any([owned.signal, options.signal]);

  /** 是否已经把应答写回（或已尝试写回）。 */
  const exchange = { replied: false };
  /** 应答 id 先给默认值，读到请求后可能被客户端指定值覆盖。 */
  let replyId: string = randomUUID();

  const drop = (reason: Error): void => {
    if (!exchange.replied) owned.abort();
    options.logger.debug("Node REPL browser broker connection dropped", {
      event: "node_repl.browser_broker.connection.dropped",
      error: reason.message,
    });
  };
  socket.on("error", drop);
  socket.once("close", () => {
    if (!exchange.replied) owned.abort();
  });

  /** 唯一的写回出口；`replied` 保证幂等且防写已销毁的 socket。 */
  const respond = (payload: NodeReplBrowserBrokerResponse): void => {
    exchange.replied = true;
    if (socket.writable && !socket.destroyed) socket.end(`${JSON.stringify(payload)}\n`);
  };

  try {
    const payload = await readBrowserBrokerFrame({ socket, signal });
    replyId = responseId(payload, replyId);
    const request = nodeReplBrowserBrokerRequestSchema.parse(payload);
    authenticate(request, options.token);
    respond(await forward({ request, port: options.browserControlPort, abort: signal }));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    // 错误文案可能包含 Host 回显的凭据；写回前必须抹掉。
    respond({
      id: replyId,
      ok: false,
      error: message.replaceAll(options.token, REDACTION_PLACEHOLDER),
    });
  }
}
