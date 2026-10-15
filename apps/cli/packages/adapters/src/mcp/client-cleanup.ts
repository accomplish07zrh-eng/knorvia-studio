// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { errorText } from "./client-stdio-log.js";
import { terminateMcpStdioProcessTree } from "./process-tree.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

/** 关闭过程的失败日志：事件名与字段名是观测契约，逐字保留。 */
interface CloseFailureLog {
  cause: unknown;
  event: string;
  extra?: Record<string, unknown>;
  level: "warn" | "debug";
  message: string;
  targetServer: string;
}

function logCloseFailure(clientState: McpClientState, entry: CloseFailureLog): void {
  clientState.logger?.[entry.level](entry.message, {
    ...clientState.context,
    error: errorText(entry.cause),
    event: entry.event,
    mcpServerName: entry.targetServer,
    ...entry.extra,
  });
}

// 关闭顺序与观测约定：
// 一、先摘掉 onclose 回调，避免关闭过程再次触发客户端回调形成递归关闭。
// 二、stdio 传输先终止进程树（失败只记日志不抛出），再关 client，最后关 transport。
// 三、进程树已死时上报 recordProcessClosed，避免遥测里出现悬挂连接。
// 四、结束日志带 durationMs 与 pid（存在时），字段名与既有观测契约一致。
// 五、closeRecord 先按名字取记录，无记录即返回；有 owner 时先中止其等待。
function usablePid(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

// 关闭路径的细节约定（接手排障必读）：
// 一、pid 只认 stdio 传输且为正整数；其它传输一律视为无 pid，不走进程树终止。
// 二、终止进程树失败不改变关闭结果：记录 warn 后继续关 client 与 transport。
// 三、client 与 transport 的关闭失败只记 debug：连接已不可用，失败不影响上层收尾。
// 四、进程树在关闭后仍活着时不上报；只有确认已死才上报 recordProcessClosed。
// 五、收尾 info 日志始终写入，包含耗时、pid（存在时）与状态 completed，便于对齐观测。
// 六、closeRecord 对未知名字直接返回，不做兜底创建，避免关闭路径产生新状态。
// 七、owner 中止使用带服务名的错误文本，便于区分「用户取消」与「服务关闭」。
// 八、本文件不抛错：关闭是尽力而为的收尾，失败通过日志与遥测暴露。
// 九、重复调用安全：记录被清理后再次关闭会走空记录分支直接返回。
// 十、所有日志字段名（event / mcpServerName / mcpTransportPid / status / durationMs）是观测契约。
// 十一、关闭顺序固定为「进程树 → client → transport」，调整顺序会让 SDK 内部重连逻辑抢跑。
// 十二、helper 只做字段拼装，不吞事件名与级别，保证日志检索维度稳定。
export function transportPid(transport: ProtocolTransport | undefined): number | undefined {
  if (!(transport instanceof StdioClientTransport)) return undefined;
  return usablePid(transport.pid);
}

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
    try {
      await terminateMcpStdioProcessTree(pid);
    } catch (cause) {
      logCloseFailure(clientState, {
        cause,
        event: "mcp.stdio.process_tree_cleanup.failed",
        extra: { mcpTransportPid: pid, pid, status: "failed" },
        level: "warn",
        message: "MCP stdio process tree cleanup failed",
        targetServer: targetServer,
      });
    }
  }
  try {
    await client?.close();
  } catch (cause) {
    logCloseFailure(clientState, {
      cause,
      event: "mcp.client.close.failed",
      level: "debug",
      message: "MCP client close failed",
      targetServer: targetServer,
    });
  }
  try {
    await transport?.close();
  } catch (cause) {
    logCloseFailure(clientState, {
      cause,
      event: "mcp.transport.close.failed",
      level: "debug",
      message: "MCP transport close failed",
      targetServer: targetServer,
    });
  }
  if (
    clientState.context &&
    transport instanceof ProcessTreeStdioClientTransport &&
    !transport.processAlive
  ) {
    clientState.telemetry?.recordProcessClosed({
      connectionId: clientState.context.mcpConnectionId,
    });
  }
  clientState.logger?.info("MCP server closed", {
    ...clientState.context,
    durationMs: Date.now() - startedAt,
    event: "mcp.server.closed",
    mcpServerName: targetServer,
    ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
    status: "completed",
  });
}

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
// 遥测与可观测性补充：
// 一、recordProcessClosed 只在进程树确认退出后调用，避免重复计数。
// 二、耗时用单调时钟差值计算，日志里的 durationMs 只用于趋势观察，不参与判定。
// 三、关闭失败不重试：重试会延长退出路径，且失败原因多数是进程已不存在。
// 四、日志级别选择：进程树失败用 warn（可能泄漏子进程），client/transport 失败用 debug（连接已废）。
// 五、事件名不带动态片段，保证按事件名聚合时维度稳定。
