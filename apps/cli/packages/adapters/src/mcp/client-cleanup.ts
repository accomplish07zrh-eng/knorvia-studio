// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { errorText } from "./client-stdio-log.js";
import { terminateMcpStdioProcessTree } from "./process-tree.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

export function transportPid(transport: ProtocolTransport | undefined): number | undefined {
  if (!(transport instanceof StdioClientTransport)) return undefined;
  const pid = transport.pid;
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export async function closeHandles(
  state: McpClientState,
  name: string,
  client: Client | undefined,
  transport: ProtocolTransport | undefined,
): Promise<void> {
  const started = Date.now();
  const pid = transportPid(transport);
  if (client) client.onclose = undefined;
  if (pid !== undefined) {
    try {
      await terminateMcpStdioProcessTree(pid);
    } catch (error) {
      state.logger?.warn("MCP stdio process tree cleanup failed", {
        ...state.context,
        error: errorText(error),
        event: "mcp.stdio.process_tree_cleanup.failed",
        mcpServerName: name,
        mcpTransportPid: pid,
        pid,
        status: "failed",
      });
    }
  }
  try {
    await client?.close();
  } catch (error) {
    state.logger?.debug("MCP client close failed", {
      error: errorText(error),
      event: "mcp.client.close.failed",
      mcpServerName: name,
    });
  }
  try {
    await transport?.close();
  } catch (error) {
    state.logger?.debug("MCP transport close failed", {
      error: errorText(error),
      event: "mcp.transport.close.failed",
      mcpServerName: name,
    });
  }
  if (
    state.context &&
    transport instanceof ProcessTreeStdioClientTransport &&
    !transport.processAlive
  ) {
    state.telemetry?.recordProcessClosed({ connectionId: state.context.mcpConnectionId });
  }
  state.logger?.info("MCP server closed", {
    ...state.context,
    durationMs: Date.now() - started,
    event: "mcp.server.closed",
    mcpServerName: name,
    ...(pid !== undefined ? { mcpTransportPid: pid } : {}),
    status: "completed",
  });
}

export async function closeRecord(state: McpClientState, name: string): Promise<void> {
  const record = state.records.get(name);
  if (!record) return;
  record.owner?.abort(new Error(`MCP server ${name} connection closed`));
  if (!record.client && !record.transport) return;
  await closeHandles(state, name, record.client, record.transport);
}
