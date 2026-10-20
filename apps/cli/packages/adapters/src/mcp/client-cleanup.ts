// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 连接的关闭收尾。关闭是**尽力而为**的动作：任何一步失败都只记日志，不向上抛错。
//
// 关闭顺序固定为三步，不可调整（调整会让 SDK 内部的重连逻辑抢跑）：
//   1. 终止 stdio 进程树 —— 失败记 warn（可能泄漏子进程）；
//   2. 关闭 client —— 失败记 debug（连接已不可用）；
//   3. 关闭 transport —— 失败记 debug。
// 另外在开始前先摘掉 onclose 回调，避免关闭过程再次触发客户端回调形成递归关闭。
//
// 观测契约（字段名逐字保留，勿改）：event / mcpServerName / mcpTransportPid / status / durationMs。
// 事件名不带动态片段，保证按事件名聚合时维度稳定。

import type { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { errorText } from "./client-stdio-log.js";
import { terminateMcpStdioProcessTree } from "./process-tree.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

/** 关闭过程的一条失败日志：级别、事件名、文案与附加字段。 */
interface CloseFailureLog {
  cause: unknown;
  event: string;
  extra?: Record<string, unknown>;
  level: "warn" | "debug";
  message: string;
  targetServer: string;
}

/** 三个关闭步骤各自的日志规格（事件名与级别是观测契约）。 */
const CLOSE_STEP_LOGS = {
  processTree: {
    event: "mcp.stdio.process_tree_cleanup.failed",
    level: "warn" as const,
    message: "MCP stdio process tree cleanup failed",
  },
  client: {
    event: "mcp.client.close.failed",
    level: "debug" as const,
    message: "MCP client close failed",
  },
  transport: {
    event: "mcp.transport.close.failed",
    level: "debug" as const,
    message: "MCP transport close failed",
  },
} as const;

/** 关闭收尾的统一日志出口：把上下文与错误文本拼进日志字段。 */
function logCloseFailure(clientState: McpClientState, entry: CloseFailureLog): void {
  const fields: Record<string, unknown> = { ...clientState.context };
  fields.error = errorText(entry.cause);
  fields.event = entry.event;
  fields.mcpServerName = entry.targetServer;
  if (entry.extra !== undefined) Object.assign(fields, entry.extra);
  clientState.logger?.[entry.level](entry.message, fields);
}

/** pid 只认正整数；其它一律视为「无 pid」，不走进程树终止。 */
function usablePid(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

/** 关闭某一步并吞掉失败（失败只记日志）。 */
async function closeStep(
  clientState: McpClientState,
  step: keyof typeof CLOSE_STEP_LOGS,
  targetServer: string,
  run: () => Promise<void>,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    await run();
  } catch (cause) {
    const spec = CLOSE_STEP_LOGS[step];
    logCloseFailure(clientState, {
      cause,
      event: spec.event,
      level: spec.level,
      message: spec.message,
      targetServer,
      ...(extra === undefined ? {} : { extra }),
    });
  }
}

/** stdio 传输的进程号；非 stdio 或 pid 不是正整数时返回 undefined。 */
export function transportPid(transport: ProtocolTransport | undefined): number | undefined {
  if (!(transport instanceof StdioClientTransport)) return undefined;
  return usablePid(transport.pid);
}

/** 进程树确认退出后上报，避免遥测里出现悬挂连接与重复计数。 */
function reportClosedIfDead(
  clientState: McpClientState,
  transport: ProtocolTransport | undefined,
): void {
  if (!clientState.context) return;
  if (!(transport instanceof ProcessTreeStdioClientTransport)) return;
  if (transport.processAlive) return;
  clientState.telemetry?.recordProcessClosed({
    connectionId: clientState.context.mcpConnectionId,
  });
}

/** 收尾完成日志：耗时、pid（存在时）与固定状态。 */
function logClosed(
  clientState: McpClientState,
  targetServer: string,
  startedAt: number,
  pid: number | undefined,
): void {
  const fields: Record<string, unknown> = { ...clientState.context };
  fields.durationMs = Date.now() - startedAt;
  fields.event = "mcp.server.closed";
  fields.mcpServerName = targetServer;
  if (pid !== undefined) fields.mcpTransportPid = pid;
  fields.status = "completed";
  clientState.logger?.info("MCP server closed", fields);
}

/** 关闭一组句柄：进程树 → client → transport，最后上报与记日志。 */
export async function closeHandles(
  clientState: McpClientState,
  targetServer: string,
  client: Client | undefined,
  transport: ProtocolTransport | undefined,
): Promise<void> {
  const startedAt = Date.now();
  const pid = transportPid(transport);
  if (client) client.onclose = undefined;

  if (pid !== undefined) {
    await closeStep(
      clientState,
      "processTree",
      targetServer,
      () => terminateMcpStdioProcessTree(pid),
      { mcpTransportPid: pid, pid, status: "failed" },
    );
  }
  await closeStep(clientState, "client", targetServer, async () => client?.close());
  await closeStep(clientState, "transport", targetServer, async () => transport?.close());

  reportClosedIfDead(clientState, transport);
  logClosed(clientState, targetServer, startedAt, pid);
}

/**
 * 按名字关闭一条连接记录。未知名字直接返回（不做兜底创建，避免关闭路径产生新状态）；
 * 有 owner 时先中止其等待，并把服务名带进错误文本以便区分「用户取消」与「服务关闭」。
 */
export async function closeRecord(
  clientState: McpClientState,
  targetServer: string,
): Promise<void> {
  const entry = clientState.records.get(targetServer);
  if (!entry) return;
  entry.owner?.abort(new Error(`MCP server ${targetServer} connection closed`));
  if (!entry.client && !entry.transport) return;
  await closeHandles(clientState, targetServer, entry.client, entry.transport);
}
