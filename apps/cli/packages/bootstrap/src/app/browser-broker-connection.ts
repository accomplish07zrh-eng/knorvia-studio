// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 一条 broker 连接的完整生命周期：读一帧 → 验身份 → 转发给控制端口 → 写回一帧。
//
// 这是**一次性**连接（一个请求换一个应答），因此状态机很短：
// 未完成 → 已回复。`replied` 唯一的作用是防止「断开后仍尝试写回」。
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
const UNAUTHORIZED_TEXT = "Node REPL browser broker request is not authorized";
const SUBAGENT_FORBIDDEN_TEXT = "Browser is not available in subagent";
const REDACTED_TOKEN_TEXT = "[redacted]";

/** 连接被丢弃时的日志事件名（可观察面，不要改）。 */
const DROPPED_EVENT = "node_repl.browser_broker.connection.dropped";

/**
 * 一条连接需要的外部依赖。
 *
 * 用 `type` 给这组依赖一个名字，而不是在每个函数的参数位置重复四个字段：
 * 「一次连接需要端口、令牌、日志、中止信号」这个事实只写一次。
 */
type ConnectionDeps = {
  readonly port: BrowserControlPort;
  readonly token: string;
  readonly logger: Logger;
  readonly signal: AbortSignal;
};

/** 一次转发需要的东西：请求本体 + 这份连接的依赖。 */
type ForwardRequest = {
  readonly request: NodeReplBrowserBrokerRequest;
  readonly deps: ConnectionDeps;
};

/**
 * 取应答 id：优先用客户端给的（合法 UUID），否则退回兜底值。
 *
 * 单独成函数是因为它有两条早退，混在 `serve` 里会让主流程读起来断成三段。
 *
 * @param payload - 已解析的请求载荷（可能不是对象）。
 * @param fallback - 兜底 id。
 * @returns 用于应答的 id。
 */
function pickReplyId(payload: unknown, fallback: string): string {
  if (payload === null || typeof payload !== "object") return fallback;
  const proposed: unknown = Reflect.get(payload, "id");
  const looksLikeUuid = typeof proposed === "string" && UUID_PATTERN.test(proposed);
  return looksLikeUuid ? (proposed as string) : fallback;
}

/**
 * 校验请求来源：令牌匹配 + 运行范围。
 *
 * 令牌先比长度再比内容 —— `timingSafeEqual` 对不等长入参直接抛错，
 * 那不是我们想要的失败形态（应该是「拒绝」而不是「异常」）。
 *
 * @param request - 已通过 schema 校验的请求。
 * @param token - 本连接的共享令牌。
 */
function assertAuthorized(request: NodeReplBrowserBrokerRequest, token: string): void {
  const supplied = Buffer.from(request.token);
  const expected = Buffer.from(token);
  const equalLength = supplied.length === expected.length;
  if (!equalLength || !timingSafeEqual(supplied, expected)) {
    throw new Error(UNAUTHORIZED_TEXT);
  }
  if (request.runtimeScope !== "main") throw new Error(SUBAGENT_FORBIDDEN_TEXT);
}

/**
 * 把请求转发给浏览器控制端口。
 *
 * 这段做的是**纯字段搬运**：字段名由 wire 协议定死，不能改名也不能省。
 * 所以这里不做额外的中间变形 —— 多绕一步只会让「协议字段原样透传」更难核对。
 *
 * @param forwardRequest - 请求与这份连接的依赖。
 * @returns 应答载荷。
 */
async function forward({ request, deps }: ForwardRequest): Promise<NodeReplBrowserBrokerResponse> {
  deps.signal.throwIfAborted();
  /** 两种 op 的共同前缀：会话、回合、trace、信号。 */
  const scope = {
    sessionId: request.sessionId,
    turnId: request.turnId,
    traceContext: request.trace as TraceContext | undefined,
    signal: deps.signal,
  };
  const ok = (extra: Record<string, unknown>) => ({ id: request.id, ok: true as const, ...extra });
  if (request.op === "list") return ok({ browsers: await deps.port.list(scope) });
  // 执行路径：scope 之上补三项浏览器身份，字段名与协议逐字一致。
  const executed = await deps.port.execute({
    ...scope,
    browserId: request.browserId,
    browserGeneration: request.browserGeneration,
    command: request.command,
  });
  return ok({ result: executed });
}

/**
 * 处理一条 broker 连接。
 *
 * 监听 `error` **延续到写回与断开之后**：取消后对端可能已关闭，
 * 此时写回会触发 EPIPE —— 若不接住，它就成了进程级未捕获异常。
 *
 * @param socket - 已接受的连接。
 * @param deps - 端口、令牌、日志与外部中止信号。
 */
export async function serveBrowserBrokerConnection(
  socket: Socket,
  deps: ConnectionDeps,
): Promise<void> {
  // 本连接自己的中止源，与外部的合并：任一触发都停止处理。
  const owned = new AbortController();
  const signal = AbortSignal.any([owned.signal, deps.signal]);
  const connection: ConnectionDeps = { ...deps, signal };

  /** 是否已经把应答写回（或已尝试写回）。 */
  const exchange = { replied: false };
  /** 应答 id 先给默认值，读到请求后可能被客户端指定值覆盖。 */
  let replyId: string = randomUUID();

  const abortUnlessReplied = (): void => {
    if (!exchange.replied) owned.abort();
  };

  const noteDrop = (reason: Error): void => {
    abortUnlessReplied();
    deps.logger.debug("Node REPL browser broker connection dropped", {
      event: DROPPED_EVENT,
      error: reason.message,
    });
  };

  // 两条断开路径：socket 出错、socket 关闭。都只做「若未回复则中止」。
  socket.on("error", noteDrop);
  socket.once("close", abortUnlessReplied);

  /** 唯一的写回出口；`replied` 保证幂等且防写已销毁的 socket。 */
  const respond = (payload: NodeReplBrowserBrokerResponse): void => {
    exchange.replied = true;
    const writable = socket.writable && !socket.destroyed;
    if (writable) socket.end(`${JSON.stringify(payload)}\n`);
  };

  /** 失败应答：抹掉 token 后写回（Host 可能把凭据放进异常消息）。 */
  const respondFailure = (caught: unknown): void => {
    const raw = caught instanceof Error ? caught.message : String(caught);
    const scrubbed = raw.replaceAll(deps.token, REDACTED_TOKEN_TEXT);
    respond({ id: replyId, ok: false, error: scrubbed });
  };

  try {
    const payload = await readBrowserBrokerFrame({ socket, signal });
    replyId = pickReplyId(payload, replyId);
    const request = nodeReplBrowserBrokerRequestSchema.parse(payload);
    assertAuthorized(request, deps.token);
    respond(await forward({ request, deps: connection }));
  } catch (caught) {
    respondFailure(caught);
  }
}
