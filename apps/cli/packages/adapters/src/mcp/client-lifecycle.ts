// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Client } from "@modelcontextprotocol/client";
import type { McpServerConfig, McpServerStatus } from "@knorvia/contracts";
import type { McpServerFailureKind } from "@knorvia/shared";
import { closeHandles, transportPid } from "./client-cleanup.js";
import { type McpClientState, type ProtocolTransport, statusValue } from "./client-state.js";
import { errorText, StderrCapture } from "./client-stdio-log.js";
import { OfficialMcpAuthError } from "./official-auth.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";
import type { McpProcessTelemetryIdentity } from "./telemetry.js";
import { McpTimeoutError } from "./timeout.js";

export interface Establishment {
  name: string;
  config: McpServerConfig;
  generation: number;
  timeoutMs: number;
  started: number;
  connectDurationMs?: number;
  listToolsDurationMs?: number;
  stderr: StderrCapture;
  client?: Client;
  transport?: ProtocolTransport;
  signal?: AbortSignal;
  workingDirectory?: string;
  authorizationAttempted?: boolean;
}

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

export async function failEstablishment(
  state: McpClientState,
  attempt: Establishment,
  error: unknown,
  fallback?: McpServerFailureKind,
): Promise<McpServerStatus> {
  const { name, config, generation } = attempt;
  const message = errorText(error);
  const officialAuthKind =
    error instanceof OfficialMcpAuthError ? error.kind : state.authFailures.get(name);
  state.authFailures.delete(name);
  const diagnostic = state.diagnostics.get(name);
  state.diagnostics.delete(name);
  const failureKind =
    officialAuthKind === "official_mcp_origin_untrusted"
      ? "official_origin_untrusted"
      : (diagnostic?.failureKind ??
        (error instanceof McpTimeoutError && fallback !== "tool_list_failed"
          ? "connection_timeout"
          : (fallback ?? "connection_failed")));
  const serverRequestId = diagnostic?.serverRequestId;
  const failed = statusValue(config, "failed", {
    error: serverRequestId ? `${message} - ${serverRequestId}` : message,
    failureKind,
    serverRequestId,
  });
  const stderr = attempt.stderr.read();
  const pid = transportPid(attempt.transport);
  await closeHandles(state, name, attempt.client, attempt.transport);
  if (!state.current(name, generation)) return state.snapshot(name, failed);
  state.records.set(name, { config, status: failed, tools: [] });
  state.logger?.warn("MCP server connection failed", {
    ...state.context,
    connectDurationMs: attempt.connectDurationMs,
    durationMs: Date.now() - attempt.started,
    error: message,
    event: "mcp.server.failed",
    listToolsDurationMs: attempt.listToolsDurationMs,
    mcpServerName: name,
    ...(officialAuthKind ? { officialAuthKind } : {}),
    ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
    status: "failed",
    ...(stderr ? { stderr } : {}),
    transport: config.type,
  });
  return failed;
}

export function watchEstablished(
  state: McpClientState,
  attempt: Establishment,
  client: Client,
  transport: ProtocolTransport,
  processIdentity: McpProcessTelemetryIdentity | undefined,
  pid: number | undefined,
): void {
  client.onclose = () => {
    if (!state.current(attempt.name, attempt.generation)) return;
    const record = state.records.get(attempt.name);
    if (record?.client !== client) return;
    const stderr = attempt.stderr.read();
    const processExit =
      transport instanceof ProcessTreeStdioClientTransport ? transport.processExit : undefined;
    record.status = statusValue(record.config, "disconnected", {
      toolCount: record.tools.length,
      error: "MCP server connection closed unexpectedly",
      failureKind: "unexpected_disconnect",
    });
    state.logger?.warn("MCP server connection lost", {
      ...state.context,
      event: "mcp.server.connection_lost",
      mcpServerName: attempt.name,
      ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
      ...processIdentity,
      ...(processExit ? { exitCode: processExit.exitCode, signal: processExit.signal } : {}),
      status: "failed",
      transport: record.config.type,
      ...(stderr ? { stderr } : {}),
    });
    if (
      record.config.type === "stdio" &&
      state.context &&
      (processExit ||
        (transport instanceof ProcessTreeStdioClientTransport && !transport.processAlive))
    ) {
      state.telemetry?.recordProcessCrashed({
        connectionId: state.context.mcpConnectionId,
        exitCode: processExit?.exitCode ?? null,
        signal: processExit?.signal ?? null,
      });
    }
  };
}
