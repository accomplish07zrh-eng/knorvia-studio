// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

export interface NodeReplBrowserBroker {
  ready: Promise<void>;
  socketPath: string;
  token: string;
  close(): Promise<void>;
}

export function createNodeReplBrowserBroker(options: {
  browserControlPort: BrowserControlPort;
  logger: Logger;
  platform?: NodeJS.Platform | string;
}): NodeReplBrowserBroker {
  const windows = (options.platform ?? process.platform) === "win32";
  const id = randomUUID();
  const socketPath = windows
    ? `\\\\.\\pipe\\knorvia-node-repl-${id}`
    : join(tmpdir(), `znr-${id}.sock`);
  const token = randomBytes(32).toString("hex");
  const peers = new Set<Socket>();
  const lifetime = new AbortController();
  let stopping = false;
  let closing: Promise<void> | undefined;
  const server = createServer((socket) => {
    if (stopping) {
      socket.destroy();
      return;
    }
    peers.add(socket);
    socket.once("close", () => peers.delete(socket));
    void serveBrowserBrokerConnection(socket, { ...options, token, signal: lifetime.signal }).catch(
      (error) => {
        options.logger.warn("Node REPL browser broker request failed", {
          event: "node_repl.browser_broker.request.failed",
          error: String(error),
        });
        socket.destroy();
      },
    );
  });
  const ready = new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  server.on("error", (error) =>
    options.logger.error("Node REPL browser broker failed", error, {
      event: "node_repl.browser_broker.failed",
    }),
  );
  server.listen(socketPath);
  server.unref();
  return {
    socketPath,
    token,
    ready,
    close() {
      if (closing) return closing;
      stopping = true;
      closing = (async () => {
        // listen 尚未完成也必须收尾；server.close 本身不会结束空闲或不合作的客户端。
        await ready.catch(() => undefined);
        for (const peer of peers) peer.destroy();
        try {
          if (server.listening)
            await new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            });
        } finally {
          if (!windows) await rm(socketPath, { force: true });
        }
      })();
      // 立即撤销在途 admission；不能等 socket 的 close 事件才阻止已读完的帧。
      // closing 已先登记，abort 监听中的重入 close 仍返回同一个 Promise。
      lifetime.abort();
      return closing;
    },
  };
}

export function injectNodeReplBrowserBroker(
  servers: Record<string, McpServerConfig>,
  broker: NodeReplBrowserBroker | undefined,
): Record<string, McpServerConfig> {
  const entry = servers.node_repl;
  if (!broker || entry?.type !== "stdio") return servers;
  const env = Object.assign({}, entry.env, {
    [NODE_REPL_BROWSER_BROKER_SOCKET_ENV]: broker.socketPath,
    [NODE_REPL_BROWSER_BROKER_TOKEN_ENV]: broker.token,
  });
  return { ...servers, node_repl: { ...entry, env } };
}
