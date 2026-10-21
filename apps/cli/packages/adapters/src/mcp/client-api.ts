// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 适配器的门面（实现 McpPort）。这一层刻意保持「薄」：
// 它只做三件事 —— 组装依赖、把调用转给下层、在必要时补齐观测日志。
//
// 下层分工：
//   McpClientState  —— 世代编号、服务记录、诊断、工具响应 id 缓存；
//   McpConnections  —— 建立/恢复连接；
//   McpToolCalls    —— 工具调用与失败恢复。
//
// 几个容易写错的地方：
// 一、`connectConfiguredServers` 要先断开「本次没列出的服务」，再连新列出的；
// 二、同名的 pending 且授权信息一致时**复用**在途连接，不重复发起；
// 三、`pingServer` 里「协议层有回应」算连接可用（服务端还活着，只是这个 ping 失败）；
// 四、`close` 要给每个服务推进世代，让在途回调作废。

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
import { errorText } from "./client-stdio-log.js";
import { closeRecord } from "./client-cleanup.js";
import { McpConnections } from "./client-connection.js";
import {
  DEFAULT_CONNECTION_MS,
  DEFAULT_PING_MS,
  McpClientState,
  statusValue,
  type CreateMcpAdapterOptions,
} from "./client-state.js";
import { McpToolCalls } from "./client-tools.js";
import { waitForRecord } from "./client-wait.js";

/** ping 报错时判断错误是否来自协议层：协议层能报错说明服务端仍有响应。 */
function protocolLayerReply(candidate: unknown): boolean {
  if (candidate instanceof ProtocolError) return true;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  const code = (candidate as { code?: unknown }).code;
  return typeof code === "number";
}

/** 把状态表按状态值分组计数。 */
function tally(statuses: Record<string, McpServerStatus>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(statuses)) {
    const value = statuses[key]?.status ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** 配置表的快照：服务名 → 配置。 */
type ConfiguredServers = Record<string, McpServerConfig>;

/** 连接结果的快照：每个服务的状态 + 汇总的工具清单。 */
type ConnectOutcome = { statuses: Record<string, McpServerStatus>; tools: McpToolDescriptor[] };

/** ping 的可选项。 */
type PingOptions = { timeoutMs?: number };

export class McpClientApi implements McpPort {
  readonly #state: McpClientState;
  readonly #connections: McpConnections;
  readonly #toolCalls: McpToolCalls;

  constructor(options: CreateMcpAdapterOptions) {
    this.#state = new McpClientState(options);
    this.#connections = new McpConnections(this.#state);
    this.#toolCalls = new McpToolCalls(this.#state, this.#connections);
  }

  /** 断开本次配置里不再出现的服务。 */
  async #dropRemoved(servers: ConfiguredServers): Promise<void> {
    const keep = new Set(Object.keys(servers));
    const removed = [...this.#state.records.keys()].filter((name) => !keep.has(name));
    await Promise.all(removed.map((name) => this.disconnectServer(name)));
  }

  /** 连一个服务：能复用 pending 就复用，否则重新发起。 */
  async #connectOne(
    name: string,
    config: McpServerConfig,
    options: McpConnectOptions,
  ): Promise<McpServerStatus> {
    const existing = this.#state.records.get(name);
    const reusable =
      existing?.pending !== undefined &&
      existing.status.status === "connecting" &&
      existing.status.authorization !== undefined &&
      isDeepStrictEqual(existing.config, config);
    if (reusable) return waitForRecord(this.#state, name, existing, options);
    return this.connectServer(name, config, options);
  }

  /** 连接一批配置好的服务：先断开移除的，再连新增/保留的。 */
  async connectConfiguredServers(
    servers: ConfiguredServers,
    options: McpConnectOptions = {},
  ): Promise<McpConnectionSnapshot> {
    const startedAt = Date.now();
    const serverNames = Object.keys(servers);
    this.#logConnect("started", { serverCount: serverNames.length, serverNames });

    await this.#dropRemoved(servers);
    await Promise.all(
      Object.entries(servers).map(([name, config]) => this.#connectOne(name, config, options)),
    );

    const outcome: ConnectOutcome = {
      statuses: await this.status(),
      tools: await this.listTools(),
    };
    this.#logConnect("completed", {
      durationMs: Date.now() - startedAt,
      serverCount: Object.keys(outcome.statuses).length,
      statusCounts: Object.values(outcome.statuses).reduce<Record<string, number>>(
        (counts, entry) => {
          counts[entry.status] = (counts[entry.status] ?? 0) + 1;
          return counts;
        },
        {},
      ),
      toolCount: outcome.tools.length,
    });
    return outcome;
  }

  /**
   * 连接观测日志：两个阶段共用同一套字段拼装。
   * 事件名分别固定为 `mcp.configured_servers.connect.started` / `.completed`（观测契约）。
   */
  #logConnect(phase: "started" | "completed", delta: Record<string, unknown>): void {
    const logger = this.#state.logger;
    if (logger === undefined) return;
    const fields: Record<string, unknown> = {};
    Object.assign(fields, delta);
    fields.event = `mcp.configured_servers.connect.${phase}`;
    fields.status = phase;
    const label = phase === "started" ? "started" : "completed";
    logger.info(`MCP configured servers connection ${label}`, fields);
  }

  async connectServer(
    name: string,
    config: McpServerConfig,
    options: McpConnectOptions = {},
  ): Promise<McpServerStatus> {
    return this.#connections.connect(name, config, options);
  }

  async disconnectServer(name: string): Promise<McpServerStatus | undefined> {
    const state = this.#state;
    const record = state.records.get(name);
    if (record === undefined) return undefined;

    state.advance(name);
    await closeRecord(state, name);
    const status = statusValue(record.config, "disconnected");
    state.records.set(name, { config: record.config, status, tools: [] });
    return status;
  }

  /** ping 一次：超时取「请求值」与「服务配置」的较小者。 */
  #pingTimeoutMs(name: string, options: PingOptions): number {
    const configured = this.#state.records.get(name)?.config.timeoutMs;
    return Math.min(options.timeoutMs ?? DEFAULT_PING_MS, configured ?? DEFAULT_CONNECTION_MS);
  }

  /** ping 失败后把记录置为「非预期断开」，供上层决定是否重连。 */
  #markDisconnected(name: string, client: unknown): void {
    const current = this.#state.records.get(name);
    if (current === undefined || current.client !== client) return;
    current.status = statusValue(current.config, "disconnected", {
      toolCount: current.tools.length,
      error: "MCP server did not answer ping",
      failureKind: "unexpected_disconnect",
    });
  }

  async pingServer(name: string, options: PingOptions = {}): Promise<boolean> {
    const state = this.#state;
    const record = state.records.get(name);
    const client = record?.client;
    if (record === undefined || client === undefined) return false;
    if (record.status.status !== "connected") return false;

    const generation = state.generations.get(name);
    try {
      await client.ping({ timeout: this.#pingTimeoutMs(name, options) });
      return true;
    } catch (error) {
      // 协议层有回应说明服务端还活着，只是这次 ping 没成功。
      if (protocolLayerReply(error)) return true;
      if (state.generations.get(name) !== generation) return false;

      this.#markDisconnected(name, client);
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
    const byName: Record<string, McpServerStatus> = {};
    for (const [name, record] of this.#state.records) byName[name] = record.status;
    return byName;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    return [...this.#state.records.values()].flatMap((record) => record.tools);
  }

  async callTool(
    request: McpCallToolRequest,
    options: McpCallToolOptions = {},
  ): Promise<McpToolCallResult> {
    return this.#toolCalls.call(request, options);
  }

  /** 关闭：先给每个服务推进世代（作废在途回调），再逐个关闭记录。 */
  async close(): Promise<void> {
    const state = this.#state;
    const startedAt = Date.now();
    const serverCount = state.records.size;
    const names = [...state.records.keys()];

    for (const name of names) state.advance(name);
    await Promise.all(names.map((name) => closeRecord(state, name)));

    state.records.clear();
    state.diagnostics.clear();
    state.logger?.info("MCP adapter closed", {
      durationMs: Date.now() - startedAt,
      event: "mcp.adapter.closed",
      serverCount,
      status: "completed",
    });
  }
}
