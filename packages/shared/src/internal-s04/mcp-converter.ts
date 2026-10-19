// SPDX-License-Identifier: Apache-2.0
/**
 * MCP 转换与运行层辅助实现。
 */

import type { KnorviaAgentMcpServer, McpOAuthConfig, McpServerConfig } from "./mcp-contract.js";

export const KNORVIA_CUA_OFFICIAL_PLUGIN_ID = "computer-use@knorvia-plugins-bundled";
export const KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME = "plugin:computer-use:computer-use";
export const KNORVIA_PLUGIN_ID_ENV_KEY = "KNORVIA_PLUGIN_ID";

export function getMcpServerRequestHeaders(
  config: McpServerConfig,
): Record<string, string> | undefined {
  return config.headers ?? config.http_headers;
}

const CUA_PREFIX_TOKENS = ["cua[", "cua@", "cua==", "cua."];

function checkCuaCandidate(text: string): boolean {
  const normalized = text.replace(/_/g, "-");
  if (normalized === "cua") {
    return true;
  }
  for (const token of CUA_PREFIX_TOKENS) {
    if (normalized.startsWith(token)) {
      return true;
    }
  }
  return false;
}

function extractLastPathSegment(filePath: string): string {
  const trimmed = filePath.replace(/[\\/]+$/u, "");
  const parts = trimmed.split(/[\\/]/u);
  return parts.pop() ?? filePath;
}

export function isKnorviaCuaMcpCommand(command: string): boolean {
  return checkCuaCandidate(command) || checkCuaCandidate(extractLastPathSegment(command));
}

export function isKnorviaCuaMcpPackageArg(value: string): boolean {
  return checkCuaCandidate(value) || checkCuaCandidate(extractLastPathSegment(value));
}

function verifyStringAttributes(
  obj: Record<string, unknown>,
  attributeKeys: readonly string[],
): boolean {
  for (const key of attributeKeys) {
    const val = obj[key];
    if (val !== undefined && typeof val !== "string") {
      return false;
    }
  }
  return true;
}

function isOAuthPayloadAcceptable(raw: unknown): raw is McpOAuthConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const data = raw as Record<string, unknown>;
  const mode = data.type;

  if (mode === "client_credentials") {
    const validId = typeof data.clientId === "string" && data.clientId.trim().length > 0;
    const validSecret =
      typeof data.clientSecret === "string" && data.clientSecret.trim().length > 0;
    return validId && validSecret && verifyStringAttributes(data, ["clientName", "scope"]);
  }

  if (mode === "authorization_code") {
    return verifyStringAttributes(data, [
      "clientId",
      "clientSecret",
      "clientName",
      "redirectPath",
      "scope",
    ]);
  }

  return false;
}

function collectKeyValuePairList(
  recordMap?: Record<string, string>,
): Array<{ name: string; value: string }> {
  if (!recordMap) {
    return [];
  }
  return Object.entries(recordMap).map(([name, value]) => ({ name, value }));
}

function injectRuntimeConfigAttributes(
  instance: KnorviaAgentMcpServer,
  cfg: McpServerConfig,
): void {
  const timeout = cfg.timeoutMs;
  if (typeof timeout === "number" && Number.isInteger(timeout) && timeout > 0) {
    instance.timeoutMs = timeout;
  }
  if (cfg.isolation === "session" || cfg.isolation === "workspace") {
    instance.isolation = cfg.isolation;
  }
  const ver = cfg.protocolVersion;
  if (ver === "legacy" || ver === "auto" || ver === "2026-07-28") {
    instance.protocolVersion = ver;
  }
}

export function convertToKnorviaAgentMcpServer(
  name: string,
  config: McpServerConfig,
): KnorviaAgentMcpServer | null {
  const targetMode = config.type || (config.command ? "stdio" : config.url ? "http" : undefined);
  if (!targetMode) {
    return null;
  }

  let serverInstance: KnorviaAgentMcpServer;

  if (targetMode === "stdio" && config.command) {
    let binary = config.command;
    let params = config.args ? [...config.args] : [];

    const isWin =
      (typeof process !== "undefined" && process.platform === "win32") ||
      (typeof navigator !== "undefined" && /win/i.test(navigator.platform));

    if (isWin && binary.toLowerCase() === "cmd.exe") {
      if (params[0] === "/c" && params[1]) {
        binary = params[1];
        params = params.slice(2);
      }
    }

    serverInstance = {
      name,
      command: binary,
      args: params,
      env: collectKeyValuePairList(config.env),
    };
  } else if (config.url && (targetMode === "http" || targetMode === "sse")) {
    const headersList = collectKeyValuePairList(getMcpServerRequestHeaders(config));
    serverInstance = {
      name,
      type: targetMode === "sse" ? "sse" : "http",
      url: config.url,
      headers: headersList,
    };
    if (isOAuthPayloadAcceptable(config.oauth)) {
      serverInstance.oauth = config.oauth;
    }
  } else {
    return null;
  }

  injectRuntimeConfigAttributes(serverInstance, config);
  return serverInstance;
}
