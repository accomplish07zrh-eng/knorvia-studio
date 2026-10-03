import {
  getCapturedKnorviaCuaBrokerCredentials,
  KNORVIA_CUA_OFFICIAL_PLUGIN_ID,
  KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY,
  KNORVIA_PLUGIN_ID_ENV_KEY,
} from "@knorvia/shared";
import { registerMcpTools, traceContextToLogContext } from "../deps.js";
import type { McpConnectionSnapshot, McpServerConfig, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

export function computeOfficialCuaServerNames(
  servers: Record<string, McpServerConfig>,
  trustedServerNames: ReadonlySet<string>,
): Set<string> {
  const admitted = new Set<string>();
  const authority = getCapturedKnorviaCuaBrokerCredentials().pluginAuthority;
  if (!authority) return admitted;
  for (const [name, server] of Object.entries(servers)) {
    if (!trustedServerNames.has(name)) continue;
    if (server.type !== "stdio") continue;
    if (server.env?.[KNORVIA_PLUGIN_ID_ENV_KEY]?.trim().toLowerCase() !== KNORVIA_CUA_OFFICIAL_PLUGIN_ID) continue;
    if (server.env?.[KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY]?.trim() !== authority) continue;
    admitted.add(name);
  }
  return admitted;
}

export function startMcpStartup(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<McpConnectionSnapshot> | undefined {
  if (this.mcpInitialized) return this.mcpStartupPromise;
  this.mcpInitialized = true;
  if (!this.mcpPort || this.config.mcp?.enabled === false) {
    this.mcpToolsRegistered = true;
    return undefined;
  }
  const servers = this.config.mcp?.servers ?? {};
  if (Object.keys(servers).length === 0) {
    const statuses = this.mcpPort.status();
    const tools = this.mcpPort.listTools();
    const discovery = Promise.all([statuses, tools])
      .then(([statuses, tools]) => ({ statuses, tools }))
      .catch((error: unknown) => {
        this.logger?.warn("MCP existing tool discovery failed", {
          ...traceContextToLogContext(traceContext),
          error: error instanceof Error ? error.message : String(error),
          event: "mcp.existing_tools.failed",
          module: "core.runtime",
          status: "failed",
        });
        return { statuses: {}, tools: [] };
      });
    const tracked = this.trackResidencyBlockingWork(discovery);
    this.mcpStartupPromise = tracked;
    return tracked;
  }
  const start = Date.now();
  const outcome = this.mcpPort.connectConfiguredServers(servers, {
    oauthAuthorizationTimeoutMs: 15000,
    trace: traceContext,
    workingDirectory: this.workingDirectory,
    workspaceIdentity: this.config.workspaceIdentity?.toString(),
  }).then((snapshot) => {
    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(snapshot.statuses)) {
      statusCounts[status.status] = (statusCounts[status.status] ?? 0) + 1;
    }
    this.logger?.info("MCP startup completed", {
      ...traceContextToLogContext(traceContext),
      durationMs: Date.now() - start,
      event: "mcp.startup.completed",
      module: "core.runtime",
      serverCount: Object.keys(servers).length,
      status: "completed",
      statusCounts,
      toolCount: snapshot.tools.length,
    });
    return snapshot;
  }).catch((error: unknown) => {
    this.logger?.warn("MCP startup failed", {
      ...traceContextToLogContext(traceContext),
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.startup.failed",
      module: "core.runtime",
      status: "failed",
    });
    return { statuses: {}, tools: [] };
  });
  const tracked = this.trackResidencyBlockingWork(outcome);
  this.mcpStartupPromise = tracked;
  this.logger?.debug("MCP startup scheduled", {
    ...traceContextToLogContext(traceContext),
    event: "mcp.startup.scheduled",
    module: "core.runtime",
    serverCount: Object.keys(servers).length,
    status: "started",
  });
  return tracked;
}

export async function initializeMcp(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  if (this.mcpToolsRegistered) return;
  const startup = this.startMcpStartup(traceContext);
  const port = this.mcpPort;
  if (!startup || !port) {
    this.mcpToolsRegistered = true;
    return;
  }
  const serverCount = Object.keys(this.config.mcp?.servers ?? {}).length;
  try {
    const snapshot = await startup;
    const registered = registerMcpTools(this.registry, port, snapshot.tools, {
      allowedTools: this.config.toolAllowlist,
      disallowedTools: this.config.toolDisallowlist,
      trustedWindowsComputerUseServerNames: new Set(
        this.config.runtimeFeatures?.computerUse === true
          ? this.config.mcp?.trustedWindowsComputerUseServerNames ?? []
          : [],
      ),
      officialCuaServerNames: computeOfficialCuaServerNames(
        this.config.mcp?.servers ?? {},
        new Set(this.config.mcp?.trustedOfficialCuaServerNames ?? []),
      ),
    });
    if (registered.length > 0) this.invalidateToolCache();
    this.logger?.info("MCP tools registered", {
      ...traceContextToLogContext(traceContext),
      event: "mcp.tools.registered",
      module: "core.runtime",
      registeredToolCount: registered.length,
      serverCount,
      status: "completed",
    });
  } catch (error: unknown) {
    this.mcpToolsRegistered = true;
    this.logger?.warn("MCP initialization failed", {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.initialization.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
  this.mcpToolsRegistered = true;
}
