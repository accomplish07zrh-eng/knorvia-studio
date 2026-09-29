// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const networkSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const seams = () => globalThis[key];
export function buildMcpStdioEnv(options) {
  return seams().invoke("network.buildStdioEnv", this, [options], seams().getValue("network.stdioEnv", { BASE: "1" }));
}
export function createMcpTransportFetch(options) {
  return seams().invoke("network.createFetch", this, [options], () => seams().getValue("network.fetch", function fixtureFetch() {
    throw new Error("Fixture fetch must not be called without an explicit hook");
  }));
}
`;

export const poolSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const retainedKey = Symbol.for("knorvia.mcp.independent.retained-exports");
export function createMcpConnectionPool(options) {
  const seams = globalThis[key];
  return seams.invoke("pool.create", this, [options], {
    options,
    acquireLease() { return options.createAdapter({ connectionContext: { mcpConnectionId: "lease", mcpIsolation: "session" }, config: {}, serverName: "lease" }); },
    async close() {},
    stats() { return { activeConnections: 0, pendingCloseConnections: 0 }; },
  });
}
(globalThis[retainedKey] ??= {}).createMcpConnectionPool = createMcpConnectionPool;
`;

export const telemetrySource = String.raw`
const retainedKey = Symbol.for("knorvia.mcp.independent.retained-exports");
export function createMcpTelemetryTracker(options) { return { options }; }
export function resolvePluginName(name) { return name.startsWith("plugin:") ? name.slice(7) : undefined; }
const retained = globalThis[retainedKey] ??= {};
retained.createMcpTelemetryTracker = createMcpTelemetryTracker;
retained.resolvePluginName = resolvePluginName;
`;

export const descriptorSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function normalizeMcpToolDescriptor(serverName, tool, timeoutMs, official) {
  const seams = globalThis[key];
  return seams.invoke("descriptor.normalize", this, [serverName, tool, timeoutMs, official], () => ({
    serverName,
    toolName: tool.name,
    name: tool.title,
    description: tool.description,
    timeoutMs,
    inputSchema: tool.inputSchema ?? {},
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
    official,
  }));
}
`;

export const timeoutSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const seams = () => globalThis[key];
export class McpTimeoutError extends Error {}
export function createMcpDeadline(timeoutMs) {
  return seams().invoke("timeout.createDeadline", this, [timeoutMs], { expiresAt: Date.now() + timeoutMs, timeoutMs });
}
export function remainingMcpDeadlineMs(deadline, message) {
  return seams().invoke("timeout.remaining", this, [deadline, message], () => {
    const remaining = deadline.expiresAt - Date.now();
    if (remaining <= 0) throw new McpTimeoutError(message);
    return remaining;
  });
}
export function waitWithinMcpDeadline(promise, deadline, message, signal) {
  return Promise.resolve(seams().invoke("timeout.waitDeadline", this, [promise, deadline, message, signal], promise));
}
export function withTimeout(promise, timeoutMs, message, signal) {
  return Promise.resolve(seams().invoke("timeout.withTimeout", this, [promise, timeoutMs, message, signal], promise));
}
(globalThis[Symbol.for("knorvia.mcp.independent.retained-exports")] ??= {}).McpTimeoutError = McpTimeoutError;
`;

export const sharedSource = String.raw`
export const KNORVIA_OFFICIAL_MCP_AUTH_TYPE = "knorvia_official";
export const OFFICIAL_MCP_AUTH_META_KEY = "com.knorvia-studio/official-mcp-auth";
`;

export const contractsSource = String.raw`
export const KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY = "knorvia/officialMcpServerRequestId";
`;
