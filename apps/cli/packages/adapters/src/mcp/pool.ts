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
  /* 隔离与身份上下文 */ connectionContext: McpConnectionContext;
  /* 服务配置 */ config: McpServerConfig;
  /* 目标服务名 */ serverName: string;
  /* 进程工作目录 */ workingDirectory?: string;
}

export interface McpConnectionPoolOptions {
  /* 适配器工厂（池负责调度，工厂只管创建） */ createAdapter(
    input: CreateMcpAdapterForPoolInput,
  ): McpPort;
  /* 空闲连接的关闭宽限 */ idleGraceMs?: number;
  /* 模块日志 */ logger?: Logger;
  /* 进程遥测登记器 */ telemetry?: McpTelemetryTracker;
}

export interface McpConnectionPool {
  /* 领取一个按服务名绑定的租约端口 */ acquireLease(options?: {
    leaseId?: string;
    sessionId?: string;
  }): McpPort;
  /* 关闭池并断开全部连接 */ close(): Promise<void>;
  /* 当前连接数与待关闭连接数 */ stats(): {
    activeConnections: number;
    pendingCloseConnections: number;
  };
}

interface Connection {
  /* 连接键 */ key: string;
  /* 所属服务名 */ serverName: string;
  /* 隔离上下文 */ context: McpConnectionContext;
  /* 底层适配器 */ adapter: McpPort;
  /* 当前握手结果 */ handshake: Promise<McpServerStatus>;
  /* 持有该连接的租约集合 */ owners: Set<string>;
  /* 空闲关闭定时器 */ idleTimer?: ReturnType<typeof setTimeout>;
  /* 进行中的重校验 */ revalidation?: Promise<void>;
}

const IDLE_CLOSE_GRACE_MS = 30_000;

export function createMcpConnectionPool(options: McpConnectionPoolOptions): McpConnectionPool {
  const graceMs = options.idleGraceMs ?? IDLE_CLOSE_GRACE_MS;
  const moduleLog = /* 固定模块命名空间的子日志 */ options.logger?.child({
    module: "adapters.mcp.pool",
  });
  const registry = new Map<string, Connection>();
  let leaseSeq = 0;
  let shuttingDown = false;

  function cancelIdle(slot: Connection): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = undefined;
  }

  async function closeConnection(slot: Connection): Promise<void> {
    const closeStartedAt = Date.now();
    cancelIdle(slot);
    if (registry.get(slot.key) === slot) registry.delete(slot.key);
    try {
      await slot.adapter.close();
      moduleLog?.info("MCP pooled connection closed", {
        ...slot.context,
        /* 从开始关闭到关闭完成的耗时 */ durationMs: Date.now() - closeStartedAt,
        event: /* 连接关闭 */ "mcp.pool.connection.closed",
        mcpServerName: slot.serverName,
        status: /* 正常完成 */ "completed",
      });
    } catch (failure) {
      moduleLog?.warn("MCP pooled connection close failed", {
        ...slot.context,
        error:
          /* 只留文本，避免带出堆栈 */ failure instanceof Error ? failure.message : String(failure),
        event: /* 关闭失败 */ "mcp.pool.connection.close.failed",
        mcpServerName: slot.serverName,
      });
    } finally {
      options.telemetry?.unregisterConnection({ connectionId: slot.context.mcpConnectionId });
    }
  }

  function scheduleClose(slot: Connection): void {
    if (slot.idleTimer) return;
    if (graceMs <= 0) {
      void closeConnection(slot);
      return;
    }
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = undefined;
      /* 宽限到期时仍无人持有才真正关闭 */
      if (slot.owners.size === 0) void closeConnection(slot);
    }, graceMs);
    slot.idleTimer.unref?.();
  }

  function removeOwner(slot: Connection, grantedId: string, sessionRef: string | undefined): void {
    if (!slot.owners.delete(grantedId)) return;
    options.telemetry?.releaseOwner({
      connectionId: slot.context.mcpConnectionId,
      ownerId: grantedId,
    });
    moduleLog?.info("MCP connection lease released", {
      ...slot.context,
      event: /* 租约归还 */ "mcp.pool.lease.released",
      mcpLeaseId: grantedId,
      mcpServerName: slot.serverName,
      refCount: /* 归还后的持有数 */ slot.owners.size,
      ...(sessionRef ? { sessionId: sessionRef } : {}),
    });
    /* 归零即进入空闲关闭流程 */
    if (slot.owners.size === 0) scheduleClose(slot);
  }

  function revalidate(
    slot: Connection,
    serverName: string,
    config: McpServerConfig,
    connectOptions: McpConnectOptions,
  ): Promise<void> {
    /* 同一连接上的重校验只跑一次 */
    if (slot.revalidation) return slot.revalidation;
    const probe = async (): Promise<void> => {
      let handshakeOk = false;
      try {
        await slot.handshake;
        handshakeOk = true;
      } catch {
        // 旧握手拒绝只跳过 status；不能把 status 或 ping 的错误也吞作失活。
      }
      const serverState = handshakeOk
        ? (await slot.adapter.status())[serverName]?.status
        : undefined;
      if (serverState === "connecting" || serverState === "disabled" || serverState === "untrusted")
        return;
      if (serverState === "connected" && ((await slot.adapter.pingServer?.(serverName)) ?? true)) {
        moduleLog?.debug("MCP pooled connection revalidated", {
          ...slot.context,
          event: /* 重校验通过 */ "mcp.pool.connection.revalidated",
          mcpServerName: serverName,
          status: /* 正常完成 */ "completed",
        });
        return;
      }
      moduleLog?.warn("MCP pooled connection is stale; reconnecting", {
        ...slot.context,
        event: /* 判定失活 */ "mcp.pool.connection.stale",
        mcpConnectionState: serverState ?? "unknown",
        mcpServerName: serverName,
        status: /* 开始重连 */ "started",
      });
      slot.handshake = slot.adapter.connectServer(serverName, config, connectOptions);
      try {
        await slot.handshake;
      } catch {
        // acquisition 最后仍等待当前握手，向各调用者保留这次拒绝。
      }
    };
    slot.revalidation = probe().finally(() => {
      slot.revalidation = undefined;
    });
    return slot.revalidation;
  }

  function acquireLease(leaseOptions: { leaseId?: string; sessionId?: string } = {}): McpPort {
    if (shuttingDown) throw new Error("MCP connection pool is closed");
    const grantedId = `${++leaseSeq}:${leaseOptions.leaseId ?? "lease"}`;
    const sessionRef = leaseOptions.sessionId?.trim() || undefined;
    const boundKeys = new Map<string, string>();
    const declared = new Map<string, McpServerConfig>();
    let leaseDisposed = false;
    let startupLogged = false;

    function findConnection(serverName: string): Connection | undefined {
      const slotKey = boundKeys.get(serverName);
      return slotKey ? registry.get(slotKey) : undefined;
    }

    function release(serverName: string): void {
      const slotKey = boundKeys.get(serverName);
      if (!slotKey) return;
      boundKeys.delete(serverName);
      const slot = registry.get(slotKey);
      if (slot) removeOwner(slot, grantedId, sessionRef);
    }

    async function acquire(
      serverName: string,
      config: McpServerConfig,
      connectOptions: McpConnectOptions,
    ): Promise<McpServerStatus> {
      const slotKey = connectionKey(serverName, config, connectOptions, grantedId);
      const priorKey = boundKeys.get(serverName);
      let slot = registry.get(slotKey);
      let addedOwner: boolean;
      if (slot) {
        cancelIdle(slot);
        const previousCount = slot.owners.size;
        slot.owners.add(grantedId);
        addedOwner = slot.owners.size !== previousCount;
        if (connectOptions.revalidate) await revalidate(slot, serverName, config, connectOptions);
      } else {
        const identity = createConnectionContext(config, connectOptions, sessionRef);
        options.telemetry?.registerConnection({
          connectionId: identity.mcpConnectionId,
          isolation: identity.mcpIsolation,
          serverName,
          ...(config.source ? { source: config.source.kind } : {}),
        });
        const created = options.createAdapter({
          connectionContext: identity,
          config,
          serverName,
          workingDirectory: connectOptions.workingDirectory,
        });
        const started = created.connectServer(serverName, config, connectOptions);
        slot = {
          key: slotKey,
          serverName,
          context: identity,
          adapter: created,
          handshake: started,
          owners: new Set([grantedId]),
        };
        registry.set(slotKey, slot);
        addedOwner = true;
        moduleLog?.info("MCP pooled connection created", {
          ...identity,
          event: /* 新建连接 */ "mcp.pool.connection.created",
          mcpServerName: serverName,
          transport: /* 传输类型 */ config.type,
        });
      }
      // 保留已有并发边界：await 后使用开始时的旧绑定，不补 freshness fence 或回滚。
      if (priorKey && priorKey !== slotKey) {
        const previous = registry.get(priorKey);
        if (previous) removeOwner(previous, grantedId, sessionRef);
      }
      boundKeys.set(serverName, slotKey);
      if (addedOwner) {
        options.telemetry?.acquireOwner({
          connectionId: slot.context.mcpConnectionId,
          ownerId: grantedId,
          ...(sessionRef ? { sessionId: sessionRef } : {}),
        });
      }
      if (priorKey !== slotKey) {
        moduleLog?.info("MCP connection lease acquired", {
          ...slot.context,
          event: /* 领取租约 */ "mcp.pool.lease.acquired",
          mcpLeaseId: grantedId,
          mcpServerName: serverName,
          refCount: /* 领取后的持有数 */ slot.owners.size,
          ...(sessionRef ? { sessionId: sessionRef } : {}),
        });
      }
      return await slot.handshake;
    }

    async function snapshot(): Promise<McpConnectionSnapshot> {
      const statusMap: Record<string, McpServerStatus> = {};
      const toolList: McpToolDescriptor[] = [];
      for (const [serverName, slotKey] of boundKeys) {
        const slot = registry.get(slotKey);
        if (!slot) continue;
        const reported = (await slot.adapter.status())[serverName];
        if (reported) statusMap[serverName] = reported;
        toolList.push(...(await slot.adapter.listTools()));
      }
      if (sessionRef && !startupLogged) {
        startupLogged = true;
        /* 启动遥测只统计显式启用的服务 */
        const active = [...declared].filter(([, config]) => config.enabled !== false);
        const connectedCount = active.filter(
          ([name]) => statusMap[name]?.status === "connected",
        ).length;
        options.telemetry?.recordSessionStartup({
          configuredCount: active.length,
          connectedCount,
          failedCount: active.length - connectedCount,
          processCount: active.filter(
            ([name, config]) => config.type === "stdio" && statusMap[name]?.status === "connected",
          ).length,
          sessionId: sessionRef,
        });
      }
      return { statuses: statusMap, tools: toolList };
    }

    return {
      async callTool(request, callOptions) {
        const serverName = request.serverName;
        const slot = findConnection(serverName);
        if (!slot) throw new Error("MCP server is not leased by this session: " + serverName);
        return await slot.adapter.callTool(request, callOptions);
      },
      async close() {
        if (leaseDisposed) return;
        leaseDisposed = true;
        const leasedNames = [...boundKeys.keys()];
        for (const serverName of leasedNames) release(serverName);
      },
      async connectConfiguredServers(servers, connectOptions = {}) {
        declared.clear();
        for (const [name, config] of Object.entries(servers)) declared.set(name, config);
        const names = new Set(Object.keys(servers));
        const boundBeforeBatch = [...boundKeys.keys()];
        for (const name of boundBeforeBatch) {
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
        const slot = findConnection(serverName);
        const reported = slot ? (await slot.adapter.status())[serverName] : undefined;
        release(serverName);
        return reported
          ? {
              ...reported,
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
        const slot = findConnection(serverName);
        if (!slot) return false;
        return (await slot.adapter.pingServer?.(serverName, pingOptions)) ?? true;
      },
      async status() {
        return (await snapshot()).statuses;
      },
    };
  }

  return {
    acquireLease,
    async close() {
      shuttingDown = true;
      const open = [...registry.values()];
      registry.clear();
      await Promise.all(open.map(closeConnection));
    },
    stats() {
      return {
        activeConnections: registry.size,
        pendingCloseConnections: [...registry.values()].filter((slot) => slot.owners.size === 0)
          .length,
      };
    },
  };
}
