// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 连接的生命周期：建立快照、失败收尾、断连观察。
//
// 状态机只有四态：connecting → connected / failed / disconnected。
// **本文件只产出 failed 与 disconnected**；connected 由门面写入。
//
// 关键约定：
// 一、`establishment()` 只做快照与初始化，不发起连接；`started` 用于算总耗时；
// 二、`failEstablishment()` 无论成败都先清理句柄，再判断本轮是否仍是当前代号；
// 三、过期的失败不上报状态（避免覆盖新一轮连接），但仍返回失败状态给调用方；
// 四、`watchEstablished()` 的 onclose 只在记录仍属于该 client 时生效（防旧连接误报）；
// 五、进程崩溃遥测只在 stdio **且已确认进程消失**时上报，避免重复计数；
// 六、本文件不抛错：所有失败都转成状态与日志。
//
// 观测契约（字段名逐字保留）：event / mcpServerName / mcpTransportPid / status / transport /
// stderr / connectDurationMs / listToolsDurationMs / authFailureKind / exitCode / signal。
// stderr 只在捕获到内容时附带，空捕获不写字段，避免日志里出现空串噪音。

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
import type { Establishment } from "./client-lifecycle-types.js";

export type { Establishment } from "./client-lifecycle-types.js";

/** 连接失败的兜底分类。 */
const DEFAULT_FAILURE_KIND: McpServerFailureKind = "connection_failed";

/** 断连状态的固定文案。 */
const UNEXPECTED_CLOSE_TEXT = "MCP server connection closed unexpectedly";

/** 建一份连接快照：不发起连接，只记录本轮的身份与起始时刻。 */
export function establishment(
  name: string,
  config: McpServerConfig,
  generation: number,
  timeoutMs: number,
  signal?: AbortSignal,
  workingDirectory?: string,
): Establishment {
  const journey = {} as Establishment;
  journey.name = name;
  journey.config = config;
  journey.generation = generation;
  journey.timeoutMs = timeoutMs;
  journey.started = Date.now();
  journey.stderr = new StderrCapture();
  journey.signal = signal;
  journey.workingDirectory = workingDirectory;
  return journey;
}

/**
 * 失败类型判定，优先级从高到低：
 * 官方来源未受信 → 诊断记录里的分类 → 超时（工具列表失败除外）→ 调用方兜底值。
 */
function resolveFailureKind(
  cause: unknown,
  authFailureKind: OfficialMcpAuthFailureKind | undefined,
  queued: ConnectionDiagnostic | undefined,
  fallbackKind: McpServerFailureKind | undefined,
): McpServerFailureKind {
  if (authFailureKind === "official_mcp_origin_untrusted") return "official_origin_untrusted";
  if (queued?.failureKind) return queued.failureKind;
  const timedOut = cause instanceof McpTimeoutError;
  if (timedOut && fallbackKind !== "tool_list_failed") return "connection_timeout";
  return fallbackKind ?? DEFAULT_FAILURE_KIND;
}

/** 组装失败日志字段：上下文 + 两段耗时 + 可选字段（缺席即不写）。 */
function failureLogFields(
  state: McpClientState,
  journey: Establishment,
  input: {
    detail: string;
    authFailureKind: OfficialMcpAuthFailureKind | undefined;
    pid: number | undefined;
    stderr: string | undefined;
  },
): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...state.context };
  fields.connectDurationMs = journey.connectDurationMs;
  fields.durationMs = Date.now() - journey.started;
  fields.error = input.detail;
  fields.event = "mcp.server.failed";
  fields.listToolsDurationMs = journey.listToolsDurationMs;
  fields.mcpServerName = journey.name;
  if (input.authFailureKind) fields.authFailureKind = input.authFailureKind;
  if (input.pid !== undefined) fields.mcpTransportPid = input.pid;
  fields.status = "failed";
  if (input.stderr) fields.stderr = input.stderr;
  fields.transport = journey.config.type;
  return fields;
}

/** 失败收尾：清理句柄、写状态、记日志；过期轮次只返回状态不写记录。 */
export async function failEstablishment(
  state: McpClientState,
  journey: Establishment,
  cause: unknown,
  fallbackKind?: McpServerFailureKind,
): Promise<McpServerStatus> {
  const { name, config, generation } = journey;
  const detail = errorText(cause);

  const fromError = cause instanceof OfficialMcpAuthError ? cause.kind : undefined;
  const authFailureKind = fromError ?? state.authFailures.get(name);
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

  // 过期轮次：状态只返回给调用方，不覆盖新一轮的记录与日志。
  if (!state.current(name, generation)) return state.snapshot(name, failureStatus);

  state.records.set(name, { config, status: failureStatus, tools: [] });
  state.logger?.warn(
    "MCP server connection failed",
    failureLogFields(state, journey, { detail, authFailureKind, pid, stderr }),
  );
  return failureStatus;
}

/** 是否属于「本轮仍是当前代号、且记录仍归这个 client」的活连接。 */
function stillOwned(state: McpClientState, journey: Establishment, client: Client): boolean {
  if (!state.current(journey.name, journey.generation)) return false;
  return state.records.get(journey.name)?.client === client;
}

/** 断连日志字段：在上下文之外补事件名、pid、遥测身份与退出信息。 */
function closeLogFields(
  state: McpClientState,
  journey: Establishment,
  transportType: string,
  input: {
    pid: number | undefined;
    telemetryIdentity: McpProcessTelemetryIdentity | undefined;
    processExitInfo: { exitCode: number | null; signal: NodeJS.Signals | null } | undefined;
    stderr: string | undefined;
  },
): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...state.context };
  fields.event = "mcp.server.connection_lost";
  fields.mcpServerName = journey.name;
  if (input.pid !== undefined) fields.mcpTransportPid = input.pid;
  if (input.telemetryIdentity !== undefined) Object.assign(fields, input.telemetryIdentity);
  if (input.processExitInfo !== undefined) {
    fields.exitCode = input.processExitInfo.exitCode;
    fields.signal = input.processExitInfo.signal;
  }
  fields.status = "failed";
  fields.transport = transportType;
  if (input.stderr) fields.stderr = input.stderr;
  return fields;
}

/** 判断进程是否已确认消失：有退出信息，或 stdio 传输自报不存活。 */
function processGone(
  transport: ProtocolTransport,
  processExitInfo: { exitCode: number | null; signal: NodeJS.Signals | null } | undefined,
): boolean {
  if (processExitInfo !== undefined) return true;
  if (!(transport instanceof ProcessTreeStdioClientTransport)) return false;
  return !transport.processAlive;
}

/** 非预期断连：先校验归属，再改状态、记日志、按需上报进程崩溃。 */
function handleUnexpectedClose(
  state: McpClientState,
  journey: Establishment,
  client: Client,
  transport: ProtocolTransport,
  telemetryIdentity: McpProcessTelemetryIdentity | undefined,
  pid: number | undefined,
): void {
  if (!stillOwned(state, journey, client)) return;
  const record = state.records.get(journey.name);
  if (record === undefined) return;

  const stderr = journey.stderr.read();
  const processExitInfo =
    transport instanceof ProcessTreeStdioClientTransport ? transport.processExit : undefined;

  record.status = statusValue(record.config, "disconnected", {
    toolCount: record.tools.length,
    error: UNEXPECTED_CLOSE_TEXT,
    failureKind: "unexpected_disconnect",
  });
  state.logger?.warn(
    "MCP server connection lost",
    closeLogFields(state, journey, record.config.type, {
      pid,
      telemetryIdentity,
      processExitInfo,
      stderr,
    }),
  );

  const reportable =
    record.config.type === "stdio" &&
    Boolean(state.context) &&
    processGone(transport, processExitInfo);
  if (!reportable) return;
  const context = state.context;
  if (context === undefined) return;
  state.telemetry?.recordProcessCrashed({
    connectionId: context.mcpConnectionId,
    exitCode: processExitInfo?.exitCode ?? null,
    signal: processExitInfo?.signal ?? null,
  });
}

/** 挂上 onclose：只有仍属当前代号的连接才会被记录为断连。 */
export function watchEstablished(
  state: McpClientState,
  journey: Establishment,
  client: Client,
  transport: ProtocolTransport,
  telemetryIdentity: McpProcessTelemetryIdentity | undefined,
  pid: number | undefined,
): void {
  const onLost = (): void =>
    handleUnexpectedClose(state, journey, client, transport, telemetryIdentity, pid);
  client.onclose = onLost;
}
