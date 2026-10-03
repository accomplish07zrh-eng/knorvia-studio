import type { SettingsDirectoryLocation } from "./settings-source.js";

import type { McpServerFailureKind } from "./protocol/index.js";

export type McpSource = "mcp" | "knorviaagentmcp";

export type CliMcpSource = Exclude<McpSource, "mcp">;

export type McpScope = "common" | "user" | "workspace";

export type McpFileFormat = "json";

export interface McpServerConfig {
  type?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  http_headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  apiKey?: string;
  projectId?: string;
  issueType?: string;
  personalAccessToken?: string;
  fileId?: string;
  nodeId?: string;
  organizationName?: string;
  projectName?: string;
  dsn?: string;
  apiEndpoint?: string;
  [key: string]: any;
}

export type McpServerStatus = "connected" | "disconnected" | "error" | "connecting" | "unknown";

export interface CliMcpConfig {
  mcpServers: Record<string, McpServerConfig>;
  projects: Record<string, Record<string, McpServerConfig>>;
}

export interface SaveCliMcpToUserDirectoryRequest {
  action: "upsert" | "delete" | "set-enabled";
  source: CliMcpSource;
  name: string;
  config?: McpServerConfig;
  enabled?: boolean;
  projectPath?: string;
  location?: SettingsDirectoryLocation;
}

export interface NativeMcpFileReference {
  format: McpFileFormat;
  filePath: string;
}

export interface NativeMcpServerRecord {
  source: McpSource;
  scope: McpScope;
  name: string;
  config: McpServerConfig;
  enabled?: boolean;
  projectPath?: string;
  location?: SettingsDirectoryLocation;
  file?: NativeMcpFileReference;
}

export interface LoadCliMcpFromUserDirectoryRequest {
  workspacePath?: string;
}

export interface LoadCliMcpFromUserDirectoryResult {
  servers: NativeMcpServerRecord[];
}

export interface MigrateLegacyCommonMcpRequest {
  legacyStorageDir?: string;
}

export interface MigrateLegacyCommonMcpResult {
  servers: Record<string, McpServerConfig>;
  sourcePath?: string;
  totalCount: number;
  importedCount: number;
  skippedCount: number;
}

export interface McpConfig {
  mcp: {
    mcpServers: Record<string, McpServerConfig>;
  };
  knorviaagentmcp: CliMcpConfig;
}

export interface KnorviaMcpServer {
  id: string;
  name: string;
  config: McpServerConfig;
  enabled: boolean;
  changed?: boolean;
  status?: McpServerStatus;
  lastConnected?: Date;
  error?: string;
  failureKind?: McpServerFailureKind;
  serverRequestId?: string;
  toolCount?: number;
  authorization?: {
    type: "oauth_authorization_code";
    authorizationUrl: string;
    startedAt: string;
  };
  source: McpSource;
  projectPath?: string;
  scope: McpScope;
  location?: SettingsDirectoryLocation;
  file?: NativeMcpFileReference;
}

export interface McpServerListItem {
  id: string;
  name: string;
  enabled: boolean;
  status: McpServerStatus;
  hasConfig: boolean;
  error?: string;
  toolCount?: number;
  source: McpSource;
  projectPath?: string;
  scope: McpScope;
  file?: NativeMcpFileReference;
}

export interface McpTestResult {
  success: boolean;
  error?: string;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema?: any;
  }>;
  serverInfo?: {
    name: string;
    version: string;
  };
  response_time?: number;
}

export type KnorviaAgentMcpServer =
  | {
      name: string;
      command: string;
      args: string[];
      env: Array<{
        name: string;
        value: string;
      }>;
      isolation?: "session" | "workspace";
      protocolVersion?: "legacy" | "auto" | "2026-07-28";
      timeoutMs?: number;
    }
  | {
      name: string;
      type: "http" | "sse";
      url: string;
      isolation?: "session" | "workspace";
      protocolVersion?: "legacy" | "auto" | "2026-07-28";
      headers: Array<{
        name: string;
        value: string;
      }>;
      oauth?: McpOAuthConfig;
      timeoutMs?: number;
    };

export interface McpClientCredentialsOAuthConfig {
  type: "client_credentials";
  clientId: string;
  clientSecret: string;
  clientName?: string;
  scope?: string;
}

export interface McpAuthorizationCodeOAuthConfig {
  type: "authorization_code";
  clientId?: string;
  clientSecret?: string;
  clientName?: string;
  redirectPath?: string;
  scope?: string;
}

export type McpOAuthConfig = McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig;

export const KNORVIA_CUA_OFFICIAL_PLUGIN_ID = "computer-use@knorvia-plugins-bundled";
export const KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME = "plugin:computer-use:computer-use";
export const KNORVIA_PLUGIN_ID_ENV_KEY = "KNORVIA_PLUGIN_ID";

export function getMcpServerRequestHeaders(
  config: McpServerConfig,
): Record<string, string> | undefined {
  return config.headers ?? config.http_headers;
}

function matchesCuaCandidate(value: string): boolean {
  const candidate = value.replace(/_/g, "-");
  return (
    candidate === "cua" ||
    ["cua[", "cua@", "cua==", "cua."].some((prefix) => candidate.startsWith(prefix))
  );
}

function cuaLeaf(value: string): string {
  return (
    value
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? value
  );
}

export function isKnorviaCuaMcpCommand(command: string): boolean {
  return matchesCuaCandidate(command) || matchesCuaCandidate(cuaLeaf(command));
}

export function isKnorviaCuaMcpPackageArg(value: string): boolean {
  return matchesCuaCandidate(value) || matchesCuaCandidate(cuaLeaf(value));
}

function optionalStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => value[field] === undefined || typeof value[field] === "string");
}

function acceptsOAuth(value: unknown): value is McpOAuthConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "client_credentials":
      return (
        typeof record.clientId === "string" &&
        record.clientId.trim().length > 0 &&
        typeof record.clientSecret === "string" &&
        record.clientSecret.trim().length > 0 &&
        optionalStringFields(record, ["clientName", "scope"])
      );
    case "authorization_code":
      return optionalStringFields(record, [
        "clientId",
        "clientSecret",
        "clientName",
        "redirectPath",
        "scope",
      ]);
    default:
      return false;
  }
}

function entryPairs(
  record: Record<string, string> | undefined,
): Array<{ name: string; value: string }> {
  return record ? Object.entries(record).map(([name, value]) => ({ name, value })) : [];
}

function attachServerOptions(server: KnorviaAgentMcpServer, config: McpServerConfig): void {
  if (
    typeof config.timeoutMs === "number" &&
    Number.isInteger(config.timeoutMs) &&
    config.timeoutMs > 0
  ) {
    server.timeoutMs = config.timeoutMs;
  }
  if (config.isolation === "session" || config.isolation === "workspace") {
    server.isolation = config.isolation;
  }
  switch (config.protocolVersion) {
    case "legacy":
    case "auto":
    case "2026-07-28":
      server.protocolVersion = config.protocolVersion;
  }
}

export function convertToKnorviaAgentMcpServer(
  name: string,
  config: McpServerConfig,
): KnorviaAgentMcpServer | null {
  let inferredType = config.type;
  if (!inferredType) {
    if (config.command) {
      inferredType = "stdio";
    } else if (config.url) {
      inferredType = "http";
    }
  }

  let server: KnorviaAgentMcpServer;
  if (inferredType === "stdio" && config.command) {
    let command = config.command;
    let args = config.args || [];
    const windows =
      (typeof process !== "undefined" && process.platform === "win32") ||
      (typeof navigator !== "undefined" && /win/i.test(navigator.platform));
    if (windows) {
      const executable = command.toLowerCase();
      if ((executable === "cmd" || executable === "cmd.exe") && args[0] === "/c" && args[1]) {
        // Windows 外层已由运行时包装；剥离显式 cmd /c，避免双层包装改变参数传递。
        command = args[1];
        args = args.slice(2);
      }
    }
    server = { name, command, args, env: entryPairs(config.env) };
  } else if (config.url && inferredType) {
    server = {
      name,
      type: inferredType === "sse" ? "sse" : "http",
      url: config.url,
      headers: entryPairs(getMcpServerRequestHeaders(config)),
    };
    if (acceptsOAuth(config.oauth)) {
      server.oauth = config.oauth;
    }
  } else {
    return null;
  }

  attachServerOptions(server, config);
  return server;
}
