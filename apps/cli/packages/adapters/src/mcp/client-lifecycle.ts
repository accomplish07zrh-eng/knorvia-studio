// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Client } from "@modelcontextprotocol/client";
import type { McpServerConfig, McpServerStatus } from "@knorvia/contracts";
import type { McpServerFailureKind, OfficialMcpAuthFailureKind } from "@knorvia/shared";
import { closeHandles, transportPid } from "./client-cleanup.js";
import {
  type ConnectionDiagnostic,
  type McpClientState,
  type ProtocolTransport,
  statusValue,
} from "./client-state.js";
import { errorText, StderrCapture } from "./client-stdio-log.js";
import { OfficialMcpAuthError } from "./official-auth.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";
import type { McpProcessTelemetryIdentity } from "./telemetry.js";
import { McpTimeoutError } from "./timeout.js";

export type { Establishment } from "./client-lifecycle-types.js";

import type { Establishment } from "./client-lifecycle-types.js";

// 生命周期约定：
// 一、establishment() 只做快照与初始化，不发起连接；started 用于计算总耗时。
// 二、failEstablishment() 无论成败都先清理句柄，再判断本轮是否仍是当前代号。
// 三、过期的失败不上报状态（避免覆盖新一轮连接），但仍返回失败状态供调用方使用。
// 四、失败日志字段（event/mcpServerName/mcpTransportPid/status/transport/stderr）是观测契约。
// 五、watchEstablished() 的 onclose 只在记录仍属于该 client 时生效（防旧连接误报）。
// 六、进程崩溃遥测只在 stdio + 已确认进程消失时上报，避免重复计数。
export function establishment(
  name: string,
  config: McpServerConfig,
  generation: number,
  timeoutMs: number,
  signal?: AbortSignal,
  workingDirectory?: string,
): Establishment {
  return {
    name,
    config,
    generation,
    timeoutMs,
    started: Date.now(),
    stderr: new StderrCapture(),
    signal,
    workingDirectory,
  };
}

/** 失败类型判定：官方来源未受信 > 诊断记录 > 超时 > 兜底默认值。 */
function resolveFailureKind(
  cause: unknown,
  authFailureKind: OfficialMcpAuthFailureKind | undefined,
  queued: ConnectionDiagnostic | undefined,
  fallbackKind: McpServerFailureKind | undefined,
): McpServerFailureKind {
  if (authFailureKind === "official_mcp_origin_untrusted") return "official_origin_untrusted";
  if (queued?.failureKind) return queued.failureKind;
  if (cause instanceof McpTimeoutError && fallbackKind !== "tool_list_failed")
    return "connection_timeout";
  return fallbackKind ?? "connection_failed";
}

export async function failEstablishment(
  state: McpClientState,
  journey: Establishment,
  cause: unknown,
  fallbackKind?: McpServerFailureKind,
): Promise<McpServerStatus> {
  const { name, config, generation } = journey;
  const detail = errorText(cause);
  const authFailureKind =
    cause instanceof OfficialMcpAuthError ? cause.kind : state.authFailures.get(name);
  state.authFailures.delete(name);
  const queued = state.diagnostics.get(name);
  state.diagnostics.delete(name);
  const failureKind = resolveFailureKind(cause, authFailureKind, queued, fallbackKind);
  const serverRequestId = queued?.serverRequestId;
  const failureStatus = statusValue(config, "failed", {
    error: serverRequestId ? `${detail} - ${serverRequestId}` : detail,
    failureKind,
    serverRequestId,
  });
  const stderr = journey.stderr.read();
  const pid = transportPid(journey.transport);
  await closeHandles(state, name, journey.client, journey.transport);
  if (!state.current(name, generation)) return state.snapshot(name, failureStatus);
  state.records.set(name, { config, status: failureStatus, tools: [] });
  state.logger?.warn("MCP server connection failed", {
    ...state.context,
    connectDurationMs: journey.connectDurationMs,
    durationMs: Date.now() - journey.started,
    error: detail,
    event: "mcp.server.failed",
    listToolsDurationMs: journey.listToolsDurationMs,
    mcpServerName: name,
    ...(authFailureKind ? { authFailureKind } : {}),
    ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
    status: "failed",
    ...(stderr ? { stderr } : {}),
    transport: config.type,
  });
  return failureStatus;
}

/** 非预期断连：先校验记录归属，再改状态、记日志、按需上报进程崩溃。 */
function handleUnexpectedClose(
  state: McpClientState,
  journey: Establishment,
  client: Client,
  transport: ProtocolTransport,
  telemetryIdentity: McpProcessTelemetryIdentity | undefined,
  pid: number | undefined,
): void {
  if (!state.current(journey.name, journey.generation)) return;
  const record = state.records.get(journey.name);
  if (record?.client !== client) return;
  const stderr = journey.stderr.read();
  const processExitInfo =
    transport instanceof ProcessTreeStdioClientTransport ? transport.processExit : undefined;
  record.status = statusValue(record.config, "disconnected", {
    toolCount: record.tools.length,
    error: "MCP server connection closed unexpectedly",
    failureKind: "unexpected_disconnect",
  });
  state.logger?.warn("MCP server connection lost", {
    ...state.context,
    event: "mcp.server.connection_lost",
    mcpServerName: journey.name,
    ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
    ...telemetryIdentity,
    ...(processExitInfo
      ? { exitCode: processExitInfo.exitCode, signal: processExitInfo.signal }
      : {}),
    status: "failed",
    transport: record.config.type,
    ...(stderr ? { stderr } : {}),
  });
  if (
    record.config.type === "stdio" &&
    state.context &&
    (processExitInfo ||
      (transport instanceof ProcessTreeStdioClientTransport && !transport.processAlive))
  ) {
    state.telemetry?.recordProcessCrashed({
      connectionId: state.context.mcpConnectionId,
      exitCode: processExitInfo?.exitCode ?? null,
      signal: processExitInfo?.signal ?? null,
    });
  }
}

export function watchEstablished(
  state: McpClientState,
  journey: Establishment,
  client: Client,
  transport: ProtocolTransport,
  telemetryIdentity: McpProcessTelemetryIdentity | undefined,
  pid: number | undefined,
): void {
  client.onclose = () =>
    handleUnexpectedClose(state, journey, client, transport, telemetryIdentity, pid);
}
// 排障与接管要点：
// 一、状态机只有四态：connecting → connected / failed / disconnected；本文件产出 failed 与 disconnected。
// 二、failed 一定会写入 records（除非本轮已过期），disconnected 则改写既有记录的状态。
// 三、过期判定基于 generations：新一轮连接一旦 advance，旧回调的写状态动作全部作废。
// 四、断连日志与失败日志都带 transport 字段（stdio/http/sse），便于按传输聚合。
// 五、stderr 只在捕获到内容时附带，空捕获不写字段，避免日志里出现空串噪音。
// 六、进程崩溃遥测需要 stdio 且确认进程消失；仅断连而上层仍在运行时不上报。
// 七、authorizationAttempted 由调用方设置，本文件只读取它来决定是否再触发授权。
// 八、establishment() 产出的对象是可变的：connect/listTools 耗时由调用方回填。
// 九、closeHandles 在本文件被调用一次（失败路径）；成功路径的关闭由门面负责。
// 十、本文件不抛错：所有失败都转成状态与日志，由调用方决定后续动作。
// 十一、timeoutMs 只是记录字段，实时超时判定在 timeout 模块完成。
// 十二、建立的 started 时间戳用于 durationMs，与连接耗时字段区分（前者含列表工具阶段）。
// 补充说明（与门面/清理模块的协作）：
// 一、failEstablishment 会调用 closeHandles，因此调用方不必再重复清理句柄。
// 二、成功后由门面写入 records 与 generations；本文件只负责失败与断连两种改写。
// 三、断连后是否重连由门面决定；本文件只把状态置为 disconnected。
// 四、日志中的 durationMs 与 connectDurationMs 语义不同，排查耗时请分别看。
// 观测字段补充：
// 一、日志里的 mcpServerName 与 records 的键一致，可按服务名聚合。
// 二、失败状态对象里的 serverRequestId 来自诊断记录，可能缺席。
// 三、断连状态不写 serverRequestId：它描述的是连接丢失，不是某次请求失败。
// 四、崩溃遥测的 exitCode 为 null 表示进程未给出退出码（常见于被强杀）。
// 五、本文件所有日志都是 warn 级别：失败与断连都需要运维可见。
