// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// node_repl 的浏览器代理：起一个本地套接字接受连接，并把「套接字路径 + 共享令牌」
// 注入 node_repl 的 MCP 配置里，供子进程回连。
//
// 三个必须守住的边界：
// 一、**关闭可重入**：先登记 closing 再 abort，重入时返回同一个 Promise；
// 二、**listen 未完成也要能收尾**：server.close 不会结束空闲或不合作的客户端，
//     所以要先主动 destroy 所有 peer；
// 三、**关闭后拒绝新连接**：stopping 置位后新到的 socket 直接销毁，不进 peers。

import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserControlPort, Logger, McpServerConfig } from "@knorvia/contracts";
import {
  NODE_REPL_BROWSER_BROKER_SOCKET_ENV,
  NODE_REPL_BROWSER_BROKER_TOKEN_ENV,
} from "@knorvia/shared";
import { serveBrowserBrokerConnection } from "./browser-broker-connection.js";

/** 服务句柄的可观测部分：就绪信号、套接字路径、共享令牌。 */
type BrokerFacts = { ready: Promise<void>; socketPath: string; token: string };

/** 服务句柄：上面三项 + 关闭入口。 */
export type NodeReplBrowserBroker = BrokerFacts & { close: () => Promise<void> };

/** 起服务所需的依赖（platform 可覆盖，测试用）。 */
type BrokerAsk = { browserControlPort: BrowserControlPort; logger: Logger; platform?: string };

/** 注入前后的 MCP 配置表形状相同。 */
type McpServerTable = Record<string, McpServerConfig>;

/** 关闭状态：一次性登记，重入复用。 */
type CloseState = { stopping: boolean; closing: Promise<void> | undefined };

/** 服务器生命周期的三个监听点。表驱动的好处：新增来源只需加一行，不会漏。 */
const SERVER_LISTENERS = [
  { on: "once", event: "listening", role: "ready" },
  { on: "once", event: "error", role: "reject" },
  { on: "on", event: "error", role: "report" },
] as const;

/** 本次运行的套接字路径：Windows 用命名管道，其余用临时目录里的 sock。 */
function socketPathFor(platform: string | undefined, id: string): string {
  const windows = (platform ?? process.platform) === "win32";
  return windows ? `\\\\.\\pipe\\knorvia-node-repl-${id}` : join(tmpdir(), `znr-${id}.sock`);
}

/** 接一条连接：关闭中直接销毁，否则登记进 peers 并交给伺服函数。 */
function acceptSocket(
  socket: Socket,
  options: BrokerAsk,
  token: string,
  peers: Set<Socket>,
  lifetime: AbortController,
  state: CloseState,
): void {
  if (state.stopping) {
    socket.destroy();
    return;
  }
  peers.add(socket);
  socket.once("close", () => peers.delete(socket));

  const serving = serveBrowserBrokerConnection(socket, {
    ...options,
    token,
    signal: lifetime.signal,
  });
  void serving.catch((error) => {
    options.logger.warn("Node REPL browser broker request failed", {
      event: "node_repl.browser_broker.request.failed",
      error: String(error),
    });
    socket.destroy();
  });
}

/** 按表挂上监听与错误处理，返回就绪 Promise。 */
function armServer(
  server: ReturnType<typeof createServer>,
  socketPath: string,
  logger: Logger,
): Promise<void> {
  const settle: Record<string, (value?: never) => void> = {};
  const ready = new Promise<void>((resolve, reject) => {
    settle.ready = resolve;
    settle.reject = reject as (value?: never) => void;
  });

  for (const listener of SERVER_LISTENERS) {
    const handler =
      listener.role === "report"
        ? (error: Error) => {
            logger.error("Node REPL browser broker failed", error, {
              event: "node_repl.browser_broker.failed",
            });
          }
        : settle[listener.role];
    server[listener.on](listener.event, handler as never);
  }

  server.listen(socketPath);
  server.unref();
  return ready;
}

/** 关闭实现：先等 ready（失败也算），再销毁 peer，最后关服务器并清理套接字文件。 */
function makeClose(ctx: {
  server: ReturnType<typeof createServer>;
  peers: Set<Socket>;
  socketPath: string;
  windows: boolean;
  state: CloseState;
  lifetime: AbortController;
  ready: Promise<void>;
}): () => Promise<void> {
  const { server, peers, socketPath, windows, state, lifetime, ready } = ctx;
  const stopServer = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  return () => {
    if (state.closing) return state.closing;
    state.stopping = true;
    state.closing = (async () => {
      // listen 尚未完成也必须收尾；server.close 本身不会结束空闲或不合作的客户端。
      await ready.catch(() => undefined);
      for (const peer of peers) peer.destroy();
      try {
        if (server.listening) await stopServer();
      } finally {
        if (!windows) await rm(socketPath, { force: true });
      }
    })();
    // 立即撤销在途 admission；不能等 socket 的 close 事件才阻止已读完的帧。
    lifetime.abort();
    return state.closing;
  };
}

export function createNodeReplBrowserBroker(options: BrokerAsk): NodeReplBrowserBroker {
  const id = randomUUID();
  const socketPath = socketPathFor(options.platform, id);
  const windows = (options.platform ?? process.platform) === "win32";
  const state: CloseState = { stopping: false, closing: undefined };
  const peers = new Set<Socket>();
  const lifetime = new AbortController();
  const token = randomBytes(32).toString("hex");

  const server = createServer((socket) =>
    acceptSocket(socket, options, token, peers, lifetime, state),
  );
  const ready = armServer(server, socketPath, options.logger);

  const handle = {} as NodeReplBrowserBroker;
  handle.socketPath = socketPath;
  handle.token = token;
  handle.ready = ready;
  handle.close = makeClose({ server, peers, socketPath, windows, state, lifetime, ready });
  return handle;
}

/** 把套接字路径与令牌注入 node_repl 的 MCP 配置；未提供 broker 或类型不符时原样返回。 */
export function injectNodeReplBrowserBroker(
  servers: McpServerTable,
  broker: NodeReplBrowserBroker | undefined,
): McpServerTable {
  const entry = servers.node_repl;
  const usable = broker !== undefined && entry?.type === "stdio";
  if (!usable) return servers;

  const injected = { ...servers };
  injected.node_repl = {
    ...entry,
    env: {
      ...entry.env,
      [NODE_REPL_BROWSER_BROKER_SOCKET_ENV]: broker.socketPath,
      [NODE_REPL_BROWSER_BROKER_TOKEN_ENV]: broker.token,
    },
  };
  return injected;
}
