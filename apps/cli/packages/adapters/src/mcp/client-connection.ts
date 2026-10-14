// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import type { McpConnectOptions, McpServerConfig, McpServerStatus } from "@knorvia/contracts";
import { KNORVIA_OFFICIAL_MCP_AUTH_TYPE, type McpServerFailureKind } from "@knorvia/shared";
import { authorizationCode, authorize, authorizationFailure } from "./client-auth.js";
import { closeHandles, closeRecord, transportPid } from "./client-cleanup.js";
import {
  establishment,
  failEstablishment,
  watchEstablished,
  type Establishment,
} from "./client-lifecycle.js";
import {
  McpClientState,
  DEFAULT_CONNECTION_MS,
  statusValue,
  type ServerRecord,
} from "./client-state.js";
import { createTransport, negotiation, protocolFailure } from "./client-transport.js";
import { waitForRecord } from "./client-wait.js";
import { normalizeMcpToolDescriptor } from "./descriptor.js";
import {
  classifyInteractiveAuthorizationTrigger,
  type InteractiveAuthorizationTrigger,
} from "./oauth-errors.js";
import { withTimeout } from "./timeout.js";

export class McpConnections {
  constructor(readonly state: McpClientState) {}

  async connect(
    /* 服务名 */ name: string,
    /* 服务配置 */ config: McpServerConfig,
    options: McpConnectOptions = {},
  ): Promise<McpServerStatus> {
    const sessionState = this.state;
    const started = Date.now();
    const budgetMs = config.timeoutMs ?? DEFAULT_CONNECTION_MS;
    const generation = sessionState.advance(name);
    sessionState.authFailures.delete(name);
    sessionState.diagnostics.delete(name);
    sessionState.logger?.info("MCP server connection started", {
      event: /* 连接开始 */ "mcp.server.connect.started",
      mcpServerName: name,
      status: /* 已开始 */ "started",
      timeoutMs: budgetMs,
      transport: config.type,
    });
    await closeRecord(sessionState, name);
    const disabled = config.enabled === false;
    if (disabled) {
      const status = statusValue(config, "disabled");
      sessionState.records.set(name, { config, status, tools: /* 未连接无工具 */ [] });
      sessionState.logger?.info("MCP server connection skipped", {
        durationMs: Date.now() - started,
        event: /* 因禁用被跳过 */ "mcp.server.connect.skipped",
        mcpServerName: name,
        status: /* 无需连接 */ "completed",
        transport: config.type,
      });
      return /* 直接返回禁用状态 */ status;
    }
    const owner = new AbortController();
    const forward = () =>
      owner.abort(options.signal?.reason instanceof Error ? options.signal.reason : undefined);
    if (options.signal?.aborted) forward();
    else options.signal?.addEventListener("abort", forward, { once: true });
    const record: ServerRecord = {
      config: /* 待连接的配置 */ config,
      status: statusValue(config, "connecting"),
      tools: /* 握手完成后才填充 */ [],
      owner,
    };
    sessionState.records.set(name, record);
    record.pending = this.open(
      establishment(name, config, generation, budgetMs, owner.signal, options.workingDirectory),
    ).finally(() => {
      options.signal?.removeEventListener("abort", forward);
    });
    return waitForRecord(sessionState, name, record, options);
  }

  async open(attempt: Establishment): Promise<McpServerStatus> {
    const sessionState = this.state;
    const { name, config, generation, timeoutMs: budgetMs, signal } = attempt;
    let fallback: McpServerFailureKind =
      /* stdio 归进程启动失败，其余归网络不可达 */ config.type === "stdio"
        ? "process_start_failed"
        : "network_unreachable";
    try {
      const wire = createTransport(
        /* 状态 */ sessionState,
        /* 服务名 */ name,
        /* 配置 */ config,
        /* 代次 */ generation,
        /* 取消信号 */ signal,
        attempt.workingDirectory,
      );
      attempt.transport = wire;
      attempt.stderr.attach(wire, name, sessionState.logger);
      const versionNegotiation = negotiation(config, budgetMs);
      const mcpClient = new Client(
        { name: sessionState.clientName, version: sessionState.clientVersion },
        { versionNegotiation },
      );
      attempt.client = mcpClient;
      const existing = sessionState.records.get(name);
      if (sessionState.current(name, generation) && existing) {
        existing.client = mcpClient;
        existing.transport = wire;
      }
      const connecting = Date.now();
      /* 握手阶段：统一超时 + 取消透传 */
      await withTimeout(
        mcpClient.connect(wire),
        budgetMs,
        `MCP server ${name} connection timed out after ${budgetMs}ms`,
        /* 取消信号 */ signal,
      );
      attempt.connectDurationMs = Date.now() - connecting;
      fallback = "tool_list_failed";
      const listing = Date.now();
      const result = await withTimeout(
        /* 工具清单拉取同样受超时约束 */ mcpClient.listTools(),
        budgetMs,
        `MCP server ${name} tool listing timed out after ${budgetMs}ms`,
        signal,
      );
      attempt.listToolsDurationMs = Date.now() - listing;
      const toolDescriptors = result.tools.map((tool) =>
        normalizeMcpToolDescriptor(
          name,
          tool,
          config.timeoutMs,
          config.type === "http" && config.auth?.type === KNORVIA_OFFICIAL_MCP_AUTH_TYPE,
        ),
      );
      const protocolEra = mcpClient.getProtocolEra();
      const protocolVersion = mcpClient.getNegotiatedProtocolVersion();
      const status = statusValue(config, "connected", {
        toolCount: toolDescriptors.length,
        protocolEra,
      });
      if (!sessionState.current(name, generation)) {
        await closeHandles(sessionState, name, mcpClient, wire);
        return sessionState.snapshot(name, status);
      }
      sessionState.diagnostics.delete(name);
      sessionState.records.set(name, {
        config,
        status,
        tools: toolDescriptors,
        client: mcpClient,
        transport: wire,
      });
      const pid = transportPid(wire);
      const identity =
        pid !== undefined && sessionState.context
          ? sessionState.telemetry?.recordProcessStarted({
              connectionId: sessionState.context.mcpConnectionId,
              pid,
            })
          : undefined;
      watchEstablished(sessionState, attempt, mcpClient, wire, identity, pid);
      sessionState.logger?.info("MCP server connected", {
        ...sessionState.context,
        connectDurationMs: attempt.connectDurationMs,
        durationMs: Date.now() - attempt.started,
        event: /* 连接成功 */ "mcp.server.connected",
        listToolsDurationMs: attempt.listToolsDurationMs,
        mcpClientName: sessionState.clientName,
        mcpClientVersion: sessionState.clientVersion,
        mcpProtocolEra: protocolEra ?? "unknown",
        mcpProtocolVersion: protocolVersion ?? "unknown",
        mcpServerName: name,
        ...identity,
        ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
        mcpVersionNegotiationMode:
          typeof versionNegotiation.mode === "object"
            ? versionNegotiation.mode.pin
            : versionNegotiation.mode,
        status: /* 完成 */ "completed",
        toolCount: toolDescriptors.length,
        transport: config.type,
      });
      return status;
    } catch (failure) {
      const trigger = !attempt.authorizationAttempted
        ? classifyInteractiveAuthorizationTrigger(failure)
        : undefined;
      const code = trigger && config.type !== "stdio" ? authorizationCode(config) : undefined;
      if (trigger && code && config.type !== "stdio") {
        await closeHandles(sessionState, name, attempt.client, attempt.transport);
        const outcome = await authorize(
          sessionState,
          name,
          config,
          code,
          generation,
          trigger,
          signal,
        );
        if (outcome.status === "authorized" || outcome.status === "already-authorized") {
          const retry = establishment(
            name,
            config,
            generation,
            budgetMs,
            signal,
            attempt.workingDirectory,
          );
          retry.authorizationAttempted = true;
          return this.open(retry);
        }
        return failEstablishment(
          sessionState,
          { ...attempt, client: undefined, transport: undefined },
          authorizationFailure(name, outcome),
          "oauth_authorization_failed",
        );
      }
      return failEstablishment(
        sessionState,
        attempt,
        failure,
        protocolFailure(failure) ? "protocol_negotiation_failed" : fallback,
      );
    }
  }

  recoverAuthorization(
    /* 服务名 */ name: string,
    /* 失败前的服务器记录 */ previous: ServerRecord,
    /* 触发交互授权的原因 */ trigger: InteractiveAuthorizationTrigger,
    /* 原始失败 */ error: unknown,
  ): Promise<McpServerStatus> {
    const sessionState = this.state;
    const config = previous.config;
    const code = authorizationCode(config);
    if (config.type === "stdio" || !code) throw error;
    const ongoing = sessionState.records.get(name);
    if (
      ongoing?.pending &&
      ongoing.status.status === "connecting" &&
      isDeepStrictEqual(ongoing.config, config)
    )
      return ongoing.pending;
    const generation = sessionState.advance(name);
    const owner = new AbortController();
    const record: ServerRecord = {
      config: /* 沿用原配置 */ config,
      status: statusValue(config, "connecting", { toolCount: previous.tools.length }),
      tools: /* 沿用失败前已知的工具列表 */ previous.tools,
      owner,
    };
    sessionState.records.set(name, record);
    const attempt = establishment(
      name,
      config,
      generation,
      config.timeoutMs ?? DEFAULT_CONNECTION_MS,
      owner.signal,
    );
    record.pending = (async () => {
      try {
        await closeHandles(sessionState, name, previous.client, previous.transport);
        const outcome = await authorize(
          sessionState,
          name,
          config,
          code,
          generation,
          trigger,
          owner.signal,
        );
        if (outcome.status === "authorized" || outcome.status === "already-authorized") {
          attempt.authorizationAttempted = true;
          return await this.open(attempt);
        }
        return await failEstablishment(
          sessionState,
          attempt,
          authorizationFailure(name, outcome),
          "oauth_authorization_failed",
        );
      } catch (failure) {
        return failEstablishment(sessionState, attempt, failure, "oauth_authorization_failed");
      }
    })();
    return record.pending;
  }
}
