// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  isOfficialMarketplaceId,
  type McpOAuthConfig,
  type McpServerConfig,
} from "@knorvia/contracts";
import {
  KNORVIA_PLUGIN_ID_ENV_KEY,
  findOfficialMcpReservedHeaders,
  sanitizeKnorviaRuntimeEnv,
} from "@knorvia/shared";
import { isRecord } from "./helpers.js";
import { buildOfficialProvenance, parseKnorviaOfficialAuth } from "./mcp-official-auth.js";
import { expandPluginString, expandStringMap, type TemplateContext } from "./mcp-templates.js";

function stringField(value: unknown, context: TemplateContext, secret: boolean): string {
  if (typeof value !== "string") throw new Error("Expected string field");
  return expandPluginString(value, context, secret);
}

function oauthConfig(value: unknown, context: TemplateContext): McpOAuthConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Invalid OAuth configuration");
  const optional: { clientName?: string; scope?: string } = {};
  if (value.clientName !== undefined)
    optional.clientName = stringField(value.clientName, context, false);
  if (value.scope !== undefined) optional.scope = stringField(value.scope, context, false);
  if (value.type === "client_credentials")
    return {
      ...optional,
      type: "client_credentials",
      clientId: stringField(value.clientId, context, false),
      clientSecret: stringField(value.clientSecret, context, true),
    };
  if (value.type !== "authorization_code") throw new Error("Invalid OAuth grant type");
  return {
    ...optional,
    type: "authorization_code",
    ...(value.clientId === undefined
      ? {}
      : { clientId: stringField(value.clientId, context, false) }),
    ...(value.clientSecret === undefined
      ? {}
      : { clientSecret: stringField(value.clientSecret, context, true) }),
    ...(value.redirectPath === undefined
      ? {}
      : { redirectPath: stringField(value.redirectPath, context, false) }),
  };
}

function commonFields(
  raw: Record<string, unknown>,
  context: TemplateContext,
): Pick<McpServerConfig, "enabled" | "isolation" | "protocolVersion" | "source" | "timeoutMs"> {
  const output: Pick<
    McpServerConfig,
    "enabled" | "isolation" | "protocolVersion" | "source" | "timeoutMs"
  > = {
    source: { kind: isOfficialMarketplaceId(context.loaded.marketplace) ? "builtin" : "plugin" },
  };
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") throw new Error("Invalid enabled setting");
    output.enabled = raw.enabled;
  }
  if (raw.timeoutMs !== undefined) {
    if (typeof raw.timeoutMs !== "number" || !Number.isFinite(raw.timeoutMs) || raw.timeoutMs <= 0)
      throw new Error("Invalid MCP timeout");
    output.timeoutMs = raw.timeoutMs;
  }
  if (raw.isolation !== undefined) {
    if (raw.isolation !== "session" && raw.isolation !== "workspace")
      throw new Error("Invalid MCP isolation");
    output.isolation = raw.isolation;
  }
  if (raw.protocolVersion !== undefined) {
    if (
      raw.protocolVersion !== "auto" &&
      raw.protocolVersion !== "legacy" &&
      raw.protocolVersion !== "2026-07-28"
    )
      throw new Error("Invalid MCP protocol version");
    output.protocolVersion = raw.protocolVersion;
  }
  return output;
}

export function projectMcpTransport(
  raw: unknown,
  key: string,
  context: TemplateContext,
): McpServerConfig {
  if (!isRecord(raw)) throw new Error("MCP server must be an object");
  const type = raw.type ?? (typeof raw.command === "string" ? "stdio" : "http");
  const common = commonFields(raw, context);
  const auth = parseKnorviaOfficialAuth(raw.auth, key);
  if (auth && raw.oauth !== undefined)
    throw new Error("Official authentication cannot be combined with OAuth");
  const officialFields = auth
    ? { auth, official: buildOfficialProvenance({ mcpKey: key, pluginId: context.loaded.id }) }
    : {};
  if (type === "stdio") {
    const command = stringField(raw.command, context, false);
    if (!command.trim()) throw new Error("MCP command is empty");
    let args: string[] | undefined;
    if (raw.args !== undefined) {
      if (!Array.isArray(raw.args)) throw new Error("MCP args must be an array");
      args = raw.args
        .filter((value): value is string => typeof value === "string")
        .map((value) => expandPluginString(value, context, false));
    }
    const env = {
      ...sanitizeKnorviaRuntimeEnv(expandStringMap(raw.env, context, true) ?? {}),
      KNORVIA_PLUGIN_ROOT: context.loaded.rootPath,
      KNORVIA_PLUGIN_DATA: context.dataPath,
      KNORVIA_PROJECT_DIR: context.workingDirectory,
      CLAUDE_PLUGIN_ROOT: context.loaded.rootPath,
      CLAUDE_PLUGIN_DATA: context.dataPath,
      CLAUDE_PROJECT_DIR: context.workingDirectory,
      [KNORVIA_PLUGIN_ID_ENV_KEY]: context.loaded.id,
    };
    return {
      ...common,
      ...officialFields,
      type: "stdio",
      command,
      env,
      ...(args ? { args } : {}),
      ...(raw.cwd === undefined ? {} : { cwd: stringField(raw.cwd, context, false) }),
    };
  }
  if (type !== "http" && type !== "sse") throw new Error("Unsupported MCP transport");
  if (type === "sse" && auth) throw new Error("Official authentication is unavailable for SSE");
  const url = stringField(raw.url, context, false);
  if (!url.trim()) throw new Error("MCP URL is empty");
  const headers = expandStringMap(raw.headers, context, true);
  if (auth && findOfficialMcpReservedHeaders(headers).length > 0)
    throw new Error("Official authentication owns reserved headers");
  const oauth = oauthConfig(raw.oauth, context);
  const transport = {
    ...common,
    url,
    ...(headers ? { headers } : {}),
    ...(oauth ? { oauth } : {}),
  };
  return type === "sse"
    ? { ...transport, type: "sse" }
    : { ...transport, ...officialFields, type: "http" };
}
