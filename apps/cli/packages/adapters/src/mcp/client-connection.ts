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
    name: string,
    config: McpServerConfig,
    options: McpConnectOptions = {},
  ): Promise<McpServerStatus> {
    const state = this.state;
    const started = Date.now();
    const timeoutMs = config.timeoutMs ?? DEFAULT_CONNECTION_MS;
    const generation = state.advance(name);
    state.authFailures.delete(name);
    state.diagnostics.delete(name);
    state.logger?.info("MCP server connection started", {
      event: "mcp.server.connect.started",
      mcpServerName: name,
      status: "started",
      timeoutMs,
      transport: config.type,
    });
    await closeRecord(state, name);
    if (config.enabled === false) {
      const status = statusValue(config, "disabled");
      state.records.set(name, { config, status, tools: [] });
      state.logger?.info("MCP server connection skipped", {
        durationMs: Date.now() - started,
        event: "mcp.server.connect.skipped",
        mcpServerName: name,
        status: "completed",
        transport: config.type,
      });
      return status;
    }
    const owner = new AbortController();
    const forward = () =>
      owner.abort(options.signal?.reason instanceof Error ? options.signal.reason : undefined);
    if (options.signal?.aborted) forward();
    else options.signal?.addEventListener("abort", forward, { once: true });
    const record: ServerRecord = {
      config,
      status: statusValue(config, "connecting"),
      tools: [],
      owner,
    };
    state.records.set(name, record);
    record.pending = this.open(
      establishment(name, config, generation, timeoutMs, owner.signal, options.workingDirectory),
    ).finally(() => {
      options.signal?.removeEventListener("abort", forward);
    });
    return waitForRecord(state, name, record, options);
  }

  async open(attempt: Establishment): Promise<McpServerStatus> {
    const state = this.state;
    const { name, config, generation, timeoutMs, signal } = attempt;
    let fallback: McpServerFailureKind =
      config.type === "stdio" ? "process_start_failed" : "network_unreachable";
    try {
      const transport = createTransport(
        state,
        name,
        config,
        generation,
        signal,
        attempt.workingDirectory,
      );
      attempt.transport = transport;
      attempt.stderr.attach(transport, name, state.logger);
      const versionNegotiation = negotiation(config, timeoutMs);
      const client = new Client(
        { name: state.clientName, version: state.clientVersion },
        { versionNegotiation },
      );
      attempt.client = client;
      const current = state.records.get(name);
      if (state.current(name, generation) && current) {
        current.client = client;
        current.transport = transport;
      }
      const connecting = Date.now();
      await withTimeout(
        client.connect(transport),
        timeoutMs,
        `MCP server ${name} connection timed out after ${timeoutMs}ms`,
        signal,
      );
      attempt.connectDurationMs = Date.now() - connecting;
      fallback = "tool_list_failed";
      const listing = Date.now();
      const result = await withTimeout(
        client.listTools(),
        timeoutMs,
        `MCP server ${name} tool listing timed out after ${timeoutMs}ms`,
        signal,
      );
      attempt.listToolsDurationMs = Date.now() - listing;
      const tools = result.tools.map((tool) =>
        normalizeMcpToolDescriptor(
          name,
          tool,
          config.timeoutMs,
          config.type === "http" && config.auth?.type === KNORVIA_OFFICIAL_MCP_AUTH_TYPE,
        ),
      );
      const protocolEra = client.getProtocolEra();
      const protocolVersion = client.getNegotiatedProtocolVersion();
      const status = statusValue(config, "connected", { toolCount: tools.length, protocolEra });
      if (!state.current(name, generation)) {
        await closeHandles(state, name, client, transport);
        return state.snapshot(name, status);
      }
      state.diagnostics.delete(name);
      state.records.set(name, { config, status, tools, client, transport });
      const pid = transportPid(transport);
      const identity =
        pid !== undefined && state.context
          ? state.telemetry?.recordProcessStarted({
              connectionId: state.context.mcpConnectionId,
              pid,
            })
          : undefined;
      watchEstablished(state, attempt, client, transport, identity, pid);
      state.logger?.info("MCP server connected", {
        ...state.context,
        connectDurationMs: attempt.connectDurationMs,
        durationMs: Date.now() - attempt.started,
        event: "mcp.server.connected",
        listToolsDurationMs: attempt.listToolsDurationMs,
        mcpClientName: state.clientName,
        mcpClientVersion: state.clientVersion,
        mcpProtocolEra: protocolEra ?? "unknown",
        mcpProtocolVersion: protocolVersion ?? "unknown",
        mcpServerName: name,
        ...identity,
        ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
        mcpVersionNegotiationMode:
          typeof versionNegotiation.mode === "object"
            ? versionNegotiation.mode.pin
            : versionNegotiation.mode,
        status: "completed",
        toolCount: tools.length,
        transport: config.type,
      });
      return status;
    } catch (error) {
      const trigger = !attempt.authorizationAttempted
        ? classifyInteractiveAuthorizationTrigger(error)
        : undefined;
      const code = trigger && config.type !== "stdio" ? authorizationCode(config) : undefined;
      if (trigger && code && config.type !== "stdio") {
        await closeHandles(state, name, attempt.client, attempt.transport);
        const outcome = await authorize(state, name, config, code, generation, trigger, signal);
        if (outcome.status === "authorized" || outcome.status === "already-authorized") {
          const retry = establishment(
            name,
            config,
            generation,
            timeoutMs,
            signal,
            attempt.workingDirectory,
          );
          retry.authorizationAttempted = true;
          return this.open(retry);
        }
        return failEstablishment(
          state,
          { ...attempt, client: undefined, transport: undefined },
          authorizationFailure(name, outcome),
          "oauth_authorization_failed",
        );
      }
      return failEstablishment(
        state,
        attempt,
        error,
        protocolFailure(error) ? "protocol_negotiation_failed" : fallback,
      );
    }
  }

  recoverAuthorization(
    name: string,
    previous: ServerRecord,
    trigger: InteractiveAuthorizationTrigger,
    error: unknown,
  ): Promise<McpServerStatus> {
    const state = this.state;
    const config = previous.config;
    const code = authorizationCode(config);
    if (config.type === "stdio" || !code) throw error;
    const current = state.records.get(name);
    if (
      current?.pending &&
      current.status.status === "connecting" &&
      isDeepStrictEqual(current.config, config)
    )
      return current.pending;
    const generation = state.advance(name);
    const owner = new AbortController();
    const record: ServerRecord = {
      config,
      status: statusValue(config, "connecting", { toolCount: previous.tools.length }),
      tools: previous.tools,
      owner,
    };
    state.records.set(name, record);
    const attempt = establishment(
      name,
      config,
      generation,
      config.timeoutMs ?? DEFAULT_CONNECTION_MS,
      owner.signal,
    );
    record.pending = (async () => {
      try {
        await closeHandles(state, name, previous.client, previous.transport);
        const outcome = await authorize(
          state,
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
          state,
          attempt,
          authorizationFailure(name, outcome),
          "oauth_authorization_failed",
        );
      } catch (failure) {
        return failEstablishment(state, attempt, failure, "oauth_authorization_failed");
      }
    })();
    return record.pending;
  }
}
