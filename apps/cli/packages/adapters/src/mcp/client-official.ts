// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  McpHttpServerConfig,
  McpServerConfig,
  OfficialMcpAuthHeadersResult,
} from "@knorvia/contracts";
import {
  KNORVIA_OFFICIAL_MCP_AUTH_TYPE,
  OFFICIAL_MCP_AUTH_META_KEY,
  type OfficialMcpAuthPortFailureReason,
} from "@knorvia/shared";
import type { McpClientState } from "./client-state.js";
import { errorName, errorText } from "./client-stdio-log.js";
import { createOfficialMcpAuthFetch, OfficialMcpAuthError } from "./official-auth.js";

export function usesOfficialAuth(config: McpServerConfig): boolean {
  return (
    (config.type === "http" || config.type === "stdio") &&
    config.auth?.type === KNORVIA_OFFICIAL_MCP_AUTH_TYPE &&
    config.auth.provider === "jwt_token" &&
    config.official !== undefined
  );
}

export function officialHttpFetch(
  state: McpClientState,
  name: string,
  config: McpHttpServerConfig,
  generation: number,
  baseFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  if (!usesOfficialAuth(config) || !config.official) return baseFetch;
  const ports = state.official;
  if (!ports?.trustedOrigins) {
    return () => {
      throw new OfficialMcpAuthError(
        "official_auth_unavailable",
        `official MCP trusted origin registry is not available in this runtime: ${name}`,
      );
    };
  }
  return createOfficialMcpAuthFetch({
    baseFetch,
    official: config.official,
    onAuthFailure: (kind) => {
      state.authFailures.set(name, kind);
    },
    onServerResponse: (info) => {
      state.observeResponse(name, generation, info);
    },
    serverName: name,
    trustedOrigins: ports.trustedOrigins,
    url: config.url,
    ...(ports.authHeadersPort ? { authHeadersPort: ports.authHeadersPort } : {}),
    ...(state.logger ? { logger: state.logger } : {}),
    ...(ports.workspaceIdentity ? { workspaceIdentity: ports.workspaceIdentity } : {}),
    ...(state.workingDirectory ? { workspacePath: state.workingDirectory } : {}),
  });
}

export async function officialStdioMeta(
  state: McpClientState,
  name: string,
  config: McpServerConfig,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | undefined> {
  if (config.type !== "stdio" || !usesOfficialAuth(config) || !config.official) return undefined;
  const official = config.official;
  const ports = state.official;
  const authHeadersPort = ports?.authHeadersPort;
  const registry = ports?.trustedOrigins;
  const resolveOrigin = ports?.resolveKnorviaApiOrigin;
  const base = {
    event: "mcp.official_auth.stdio_meta",
    mcpKey: official.mcpKey,
    mcpServerName: name,
    module: "adapters.mcp",
  };
  const failure = (reason: OfficialMcpAuthPortFailureReason): OfficialMcpAuthHeadersResult => {
    state.logger?.warn("Official MCP stdio auth headers unavailable", {
      ...base,
      reason,
      status: "failed",
    });
    return { ok: false, reason };
  };
  const wrap = (payload: OfficialMcpAuthHeadersResult): Record<string, unknown> => ({
    [OFFICIAL_MCP_AUTH_META_KEY]: payload,
  });
  if (!authHeadersPort || !registry || !resolveOrigin)
    return wrap(failure("official_auth_unavailable"));
  let targetOrigin: string;
  let trust: Awaited<ReturnType<typeof registry.isTrusted>>;
  try {
    targetOrigin = resolveOrigin();
    trust = await registry.isTrusted({
      mcpKey: official.mcpKey,
      origin: targetOrigin,
      pluginId: official.pluginId,
    });
  } catch (error) {
    state.logger?.warn("Official MCP stdio origin resolution failed", {
      ...base,
      error: errorText(error),
      errorName: errorName(error),
      pluginId: official.pluginId,
    });
    return wrap(failure("official_auth_unavailable"));
  }
  if (!trust.trusted) {
    state.logger?.warn("Official MCP stdio origin is not trusted", {
      ...base,
      detail: trust.detail ?? "unknown",
      pluginId: official.pluginId,
      targetOrigin,
    });
    return wrap(failure("official_mcp_origin_untrusted"));
  }
  const result = await authHeadersPort.resolveHeaders({
    mcpKey: official.mcpKey,
    pluginId: official.pluginId,
    targetOrigin,
    ...(ports?.workspaceIdentity ? { workspaceIdentity: ports.workspaceIdentity } : {}),
    ...(state.workingDirectory ? { workspacePath: state.workingDirectory } : {}),
    ...(signal ? { signal } : {}),
  });
  if (!result.ok) return wrap(failure(result.reason));
  const targetType = result.headers["Bigmodel-Target-Type"];
  state.logger?.debug("Official MCP stdio auth headers attached", {
    ...base,
    identityHeaderNames: Object.keys(result.headers)
      .map((header) => header.toLowerCase())
      .sort(),
    ...(targetType ? { identityTargetType: targetType } : {}),
    status: "completed",
  });
  return wrap({ ok: true, headers: result.headers });
}
