// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { isDeepStrictEqual } from "node:util";
import { ProtocolError } from "@modelcontextprotocol/client";
import type {
  McpCallToolOptions,
  McpCallToolRequest,
  McpConnectOptions,
  McpConnectionSnapshot,
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpToolCallResult,
  McpToolDescriptor,
} from "@knorvia/contracts";
import { closeRecord } from "./client-cleanup.js";
import { McpConnections } from "./client-connection.js";
import {
  DEFAULT_CONNECTION_MS,
  DEFAULT_PING_MS,
  McpClientState,
  statusValue,
  type CreateMcpAdapterOptions,
} from "./client-state.js";
import { errorText } from "./client-stdio-log.js";
import { McpToolCalls } from "./client-tools.js";
import { waitForRecord } from "./client-wait.js";

export class McpClientApi implements McpPort {
  private readonly state: McpClientState;
  private readonly connections: McpConnections;
  private readonly toolCalls: McpToolCalls;

  constructor(options: CreateMcpAdapterOptions) {
    this.state = new McpClientState(options);
    this.connections = new McpConnections(this.state);
    this.toolCalls = new McpToolCalls(this.state, this.connections);
  }

  async connectConfiguredServers(
    servers: Record<string, McpServerConfig>,
    options: McpConnectOptions = {},
  ): Promise<McpConnectionSnapshot> {
    const started = Date.now();
    const serverNames = Object.keys(servers);
    this.state.logger?.info("MCP configured servers connection started", {
      event: "mcp.configured_servers.connect.started",
      serverCount: serverNames.length,
      serverNames,
      status: "started",
    });
    const names = new Set(Object.keys(servers));
    await Promise.all(
      [...this.state.records.keys()]
        .filter((name) => !names.has(name))
        .map((name) => this.disconnectServer(name)),
    );
    await Promise.all(
      Object.entries(servers).map(([name, config]) => {
        const existing = this.state.records.get(name);
        if (
          existing?.pending &&
          existing.status.status === "connecting" &&
          existing.status.authorization &&
          isDeepStrictEqual(existing.config, config)
        ) {
          return waitForRecord(this.state, name, existing, options);
        }
        return this.connectServer(name, config, options);
      }),
    );
    const statuses = await this.status();
    const tools = await this.listTools();
    const statusCounts: Record<string, number> = {};
    for (const { status } of Object.values(statuses))
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    this.state.logger?.info("MCP configured servers connection completed", {
      durationMs: Date.now() - started,
      event: "mcp.configured_servers.connect.completed",
      serverCount: Object.keys(statuses).length,
      status: "completed",
      statusCounts,
      toolCount: tools.length,
    });
    return { statuses, tools };
  }

  async connectServer(
    name: string,
    config: McpServerConfig,
    options: McpConnectOptions = {},
  ): Promise<McpServerStatus> {
    return this.connections.connect(name, config, options);
  }

  async disconnectServer(name: string): Promise<McpServerStatus | undefined> {
    const record = this.state.records.get(name);
    if (!record) return undefined;
    this.state.advance(name);
    await closeRecord(this.state, name);
    const status = statusValue(record.config, "disconnected");
    this.state.records.set(name, { config: record.config, status, tools: [] });
    return status;
  }

  async pingServer(name: string, options: { timeoutMs?: number } = {}): Promise<boolean> {
    const state = this.state;
    const record = state.records.get(name);
    if (!record?.client || record.status.status !== "connected") return false;
    const client = record.client;
    const generation = state.generations.get(name);
    const timeout = Math.min(
      options.timeoutMs ?? DEFAULT_PING_MS,
      record.config.timeoutMs ?? DEFAULT_CONNECTION_MS,
    );
    try {
      await client.ping({ timeout });
      return true;
    } catch (error) {
      if (
        error instanceof ProtocolError ||
        (error !== null &&
          typeof error === "object" &&
          !Array.isArray(error) &&
          "code" in error &&
          typeof error.code === "number")
      )
        return true;
      if (state.generations.get(name) !== generation) return false;
      const current = state.records.get(name);
      if (current?.client === client)
        current.status = statusValue(current.config, "disconnected", {
          toolCount: current.tools.length,
          error: "MCP server did not answer ping",
          failureKind: "unexpected_disconnect",
        });
      state.logger?.warn("MCP server ping failed", {
        ...state.context,
        error: errorText(error),
        event: "mcp.server.ping.failed",
        mcpServerName: name,
        status: "failed",
        transport: record.config.type,
      });
      return false;
    }
  }

  async status(): Promise<Record<string, McpServerStatus>> {
    return Object.fromEntries(
      [...this.state.records].map(([name, record]) => [name, record.status]),
    );
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    return [...this.state.records.values()].flatMap((record) => record.tools);
  }

  async callTool(
    request: McpCallToolRequest,
    options: McpCallToolOptions = {},
  ): Promise<McpToolCallResult> {
    return this.toolCalls.call(request, options);
  }

  async close(): Promise<void> {
    const state = this.state;
    const started = Date.now();
    const count = state.records.size;
    for (const name of state.records.keys()) state.advance(name);
    await Promise.all([...state.records.keys()].map((name) => closeRecord(state, name)));
    state.records.clear();
    state.diagnostics.clear();
    state.logger?.info("MCP adapter closed", {
      durationMs: Date.now() - started,
      event: "mcp.adapter.closed",
      serverCount: count,
      status: "completed",
    });
  }
}
