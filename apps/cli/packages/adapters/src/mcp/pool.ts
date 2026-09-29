// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import type {
  Logger,
  McpConnectOptions,
  McpConnectionSnapshot,
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpToolDescriptor,
} from "@knorvia/contracts";
import type { McpTelemetryTracker } from "./telemetry.js";
import {
  connectionKey,
  createConnectionContext,
  type McpConnectionContext,
} from "./pool-identity.js";

export type { McpConnectionContext } from "./pool-identity.js";

interface CreateMcpAdapterForPoolInput {
  connectionContext: McpConnectionContext;
  config: McpServerConfig;
  serverName: string;
  workingDirectory?: string;
}

export interface McpConnectionPoolOptions {
  createAdapter(input: CreateMcpAdapterForPoolInput): McpPort;
  idleGraceMs?: number;
  logger?: Logger;
  telemetry?: McpTelemetryTracker;
}

export interface McpConnectionPool {
  acquireLease(options?: { leaseId?: string; sessionId?: string }): McpPort;
  close(): Promise<void>;
  stats(): { activeConnections: number; pendingCloseConnections: number };
}

interface Connection {
  key: string;
  serverName: string;
  context: McpConnectionContext;
  adapter: McpPort;
  handshake: Promise<McpServerStatus>;
  owners: Set<string>;
  idleTimer?: ReturnType<typeof setTimeout>;
  revalidation?: Promise<void>;
}

const DEFAULT_IDLE_GRACE_MS = 30_000;

export function createMcpConnectionPool(options: McpConnectionPoolOptions): McpConnectionPool {
  const idleGraceMs = options.idleGraceMs ?? DEFAULT_IDLE_GRACE_MS;
  const logger = options.logger?.child({ module: "adapters.mcp.pool" });
  const connections = new Map<string, Connection>();
  let sequence = 0;
  let closed = false;

  function cancelIdle(connection: Connection): void {
    if (connection.idleTimer) clearTimeout(connection.idleTimer);
    connection.idleTimer = undefined;
  }

  async function closeConnection(connection: Connection): Promise<void> {
    const startedAt = Date.now();
    cancelIdle(connection);
    if (connections.get(connection.key) === connection) connections.delete(connection.key);
    try {
      await connection.adapter.close();
      logger?.info("MCP pooled connection closed", {
        ...connection.context,
        durationMs: Date.now() - startedAt,
        event: "mcp.pool.connection.closed",
        mcpServerName: connection.serverName,
        status: "completed",
      });
    } catch (error) {
      logger?.warn("MCP pooled connection close failed", {
        ...connection.context,
        error: error instanceof Error ? error.message : String(error),
        event: "mcp.pool.connection.close.failed",
        mcpServerName: connection.serverName,
      });
    } finally {
      options.telemetry?.unregisterConnection({ connectionId: connection.context.mcpConnectionId });
    }
  }

  function scheduleClose(connection: Connection): void {
    if (connection.idleTimer) return;
    if (idleGraceMs <= 0) {
      void closeConnection(connection);
      return;
    }
    connection.idleTimer = setTimeout(() => {
      connection.idleTimer = undefined;
      if (connection.owners.size === 0) void closeConnection(connection);
    }, idleGraceMs);
    connection.idleTimer.unref?.();
  }

  function removeOwner(
    connection: Connection,
    leaseId: string,
    sessionId: string | undefined,
  ): void {
    if (!connection.owners.delete(leaseId)) return;
    options.telemetry?.releaseOwner({
      connectionId: connection.context.mcpConnectionId,
      ownerId: leaseId,
    });
    logger?.info("MCP connection lease released", {
      ...connection.context,
      event: "mcp.pool.lease.released",
      mcpLeaseId: leaseId,
      mcpServerName: connection.serverName,
      refCount: connection.owners.size,
      ...(sessionId ? { sessionId } : {}),
    });
    if (connection.owners.size === 0) scheduleClose(connection);
  }

  function revalidate(
    connection: Connection,
    serverName: string,
    config: McpServerConfig,
    connectOptions: McpConnectOptions,
  ): Promise<void> {
    if (connection.revalidation) return connection.revalidation;
    const work = async (): Promise<void> => {
      let readable = false;
      try {
        await connection.handshake;
        readable = true;
      } catch {
        // 旧握手拒绝只跳过 status；不能把 status 或 ping 的错误也吞作失活。
      }
      const state = readable ? (await connection.adapter.status())[serverName]?.status : undefined;
      if (state === "connecting" || state === "disabled" || state === "untrusted") return;
      if (state === "connected" && ((await connection.adapter.pingServer?.(serverName)) ?? true)) {
        logger?.debug("MCP pooled connection revalidated", {
          ...connection.context,
          event: "mcp.pool.connection.revalidated",
          mcpServerName: serverName,
          status: "completed",
        });
        return;
      }
      logger?.warn("MCP pooled connection is stale; reconnecting", {
        ...connection.context,
        event: "mcp.pool.connection.stale",
        mcpConnectionState: state ?? "unknown",
        mcpServerName: serverName,
        status: "started",
      });
      connection.handshake = connection.adapter.connectServer(serverName, config, connectOptions);
      try {
        await connection.handshake;
      } catch {
        // acquisition 最后仍等待当前握手，向各调用者保留这次拒绝。
      }
    };
    connection.revalidation = work().finally(() => {
      connection.revalidation = undefined;
    });
    return connection.revalidation;
  }

  function acquireLease(leaseOptions: { leaseId?: string; sessionId?: string } = {}): McpPort {
    if (closed) throw new Error("MCP connection pool is closed");
    const leaseId = `${++sequence}:${leaseOptions.leaseId ?? "lease"}`;
    const sessionId = leaseOptions.sessionId?.trim() || undefined;
    const bindings = new Map<string, string>();
    const configured = new Map<string, McpServerConfig>();
    let leaseClosed = false;
    let startupReported = false;

    function findConnection(serverName: string): Connection | undefined {
      const key = bindings.get(serverName);
      return key ? connections.get(key) : undefined;
    }

    function release(serverName: string): void {
      const key = bindings.get(serverName);
      if (!key) return;
      bindings.delete(serverName);
      const connection = connections.get(key);
      if (connection) removeOwner(connection, leaseId, sessionId);
    }

    async function acquire(
      serverName: string,
      config: McpServerConfig,
      connectOptions: McpConnectOptions,
    ): Promise<McpServerStatus> {
      const key = connectionKey(serverName, config, connectOptions, leaseId);
      const previousKey = bindings.get(serverName);
      let connection = connections.get(key);
      let ownerAdded: boolean;
      if (connection) {
        cancelIdle(connection);
        const previousCount = connection.owners.size;
        connection.owners.add(leaseId);
        ownerAdded = connection.owners.size !== previousCount;
        if (connectOptions.revalidate)
          await revalidate(connection, serverName, config, connectOptions);
      } else {
        const context = createConnectionContext(config, connectOptions, sessionId);
        options.telemetry?.registerConnection({
          connectionId: context.mcpConnectionId,
          isolation: context.mcpIsolation,
          serverName,
          ...(config.source ? { source: config.source.kind } : {}),
        });
        const adapter = options.createAdapter({
          connectionContext: context,
          config,
          serverName,
          workingDirectory: connectOptions.workingDirectory,
        });
        const handshake = adapter.connectServer(serverName, config, connectOptions);
        connection = { key, serverName, context, adapter, handshake, owners: new Set([leaseId]) };
        connections.set(key, connection);
        ownerAdded = true;
        logger?.info("MCP pooled connection created", {
          ...context,
          event: "mcp.pool.connection.created",
          mcpServerName: serverName,
          transport: config.type,
        });
      }
      // 保留已有并发边界：await 后使用开始时的旧绑定，不补 freshness fence 或回滚。
      if (previousKey && previousKey !== key) {
        const previous = connections.get(previousKey);
        if (previous) removeOwner(previous, leaseId, sessionId);
      }
      bindings.set(serverName, key);
      if (ownerAdded) {
        options.telemetry?.acquireOwner({
          connectionId: connection.context.mcpConnectionId,
          ownerId: leaseId,
          ...(sessionId ? { sessionId } : {}),
        });
      }
      if (previousKey !== key) {
        logger?.info("MCP connection lease acquired", {
          ...connection.context,
          event: "mcp.pool.lease.acquired",
          mcpLeaseId: leaseId,
          mcpServerName: serverName,
          refCount: connection.owners.size,
          ...(sessionId ? { sessionId } : {}),
        });
      }
      return await connection.handshake;
    }

    async function snapshot(): Promise<McpConnectionSnapshot> {
      const statuses: Record<string, McpServerStatus> = {};
      const tools: McpToolDescriptor[] = [];
      for (const [serverName, key] of bindings) {
        const connection = connections.get(key);
        if (!connection) continue;
        const status = (await connection.adapter.status())[serverName];
        if (status) statuses[serverName] = status;
        tools.push(...(await connection.adapter.listTools()));
      }
      if (sessionId && !startupReported) {
        startupReported = true;
        const enabled = [...configured].filter(([, config]) => config.enabled !== false);
        const connectedCount = enabled.filter(
          ([name]) => statuses[name]?.status === "connected",
        ).length;
        options.telemetry?.recordSessionStartup({
          configuredCount: enabled.length,
          connectedCount,
          failedCount: enabled.length - connectedCount,
          processCount: enabled.filter(
            ([name, config]) => config.type === "stdio" && statuses[name]?.status === "connected",
          ).length,
          sessionId,
        });
      }
      return { statuses, tools };
    }

    return {
      async callTool(request, callOptions) {
        const serverName = request.serverName;
        const connection = findConnection(serverName);
        if (!connection) throw new Error("MCP server is not leased by this session: " + serverName);
        return await connection.adapter.callTool(request, callOptions);
      },
      async close() {
        if (leaseClosed) return;
        leaseClosed = true;
        const leasedNames = [...bindings.keys()];
        for (const serverName of leasedNames) release(serverName);
      },
      async connectConfiguredServers(servers, connectOptions = {}) {
        configured.clear();
        for (const [name, config] of Object.entries(servers)) configured.set(name, config);
        const names = new Set(Object.keys(servers));
        const bindingsBeforeBatch = [...bindings.keys()];
        for (const name of bindingsBeforeBatch) {
          if (!names.has(name)) release(name);
        }
        await Promise.all(
          Object.entries(servers).map(([name, config]) => acquire(name, config, connectOptions)),
        );
        return await snapshot();
      },
      async connectServer(serverName, config, connectOptions = {}) {
        return await acquire(serverName, config, connectOptions);
      },
      async disconnectServer(serverName) {
        const connection = findConnection(serverName);
        const status = connection ? (await connection.adapter.status())[serverName] : undefined;
        release(serverName);
        return status
          ? {
              ...status,
              status: "disconnected",
              toolCount: 0,
              updatedAt: new Date().toISOString(),
            }
          : undefined;
      },
      async listTools() {
        return (await snapshot()).tools;
      },
      async pingServer(serverName, pingOptions) {
        const connection = findConnection(serverName);
        if (!connection) return false;
        return (await connection.adapter.pingServer?.(serverName, pingOptions)) ?? true;
      },
      async status() {
        return (await snapshot()).statuses;
      },
    };
  }

  return {
    acquireLease,
    async close() {
      closed = true;
      const current = [...connections.values()];
      connections.clear();
      await Promise.all(current.map(closeConnection));
    },
    stats() {
      return {
        activeConnections: connections.size,
        pendingCloseConnections: [...connections.values()].filter(
          (connection) => connection.owners.size === 0,
        ).length,
      };
    },
  };
}
