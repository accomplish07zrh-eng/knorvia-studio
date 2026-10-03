import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { McpServerConfig, McpSyncSource, SettingsDirectoryLocation } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "../paths.js";

export type ConfigObject = Record<string, unknown>;
export type ServerMap = Record<string, McpServerConfig>;
export type DirectoryScope = "user" | "workspace";

export interface McpDirectory {
  source: McpSyncSource;
  filePath(scope: DirectoryScope, workspacePath?: string): string;
  servers(config: ConfigObject): ServerMap;
  replaceServers(config: ConfigObject, servers: ServerMap): ConfigObject;
}

export function isRecord(value: unknown): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function currentHomeDirectory(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || homedir();
}

function workspaceFile(source: McpSyncSource, workspacePath: string | undefined): string {
  if (!workspacePath) {
    throw new Error(`Missing workspace path for ${source} workspace MCP config`);
  }
  return join(
    workspacePath,
    source === "knorvia" ? ".knorvia-studio" : ".agents",
    source === "knorvia" ? "config.json" : "mcp.json",
  );
}

export const knorviaDirectory: McpDirectory = {
  source: "knorvia",
  filePath: (scope, workspacePath) =>
    scope === "user"
      ? join(getKnorviaDataRootDir(), "cli", "config.json")
      : workspaceFile("knorvia", workspacePath),
  servers(config) {
    return isRecord(config.mcp) && isRecord(config.mcp.servers)
      ? (config.mcp.servers as ServerMap)
      : {};
  },
  replaceServers(config, servers) {
    return { ...config, mcp: { ...(isRecord(config.mcp) ? config.mcp : {}), servers } };
  },
};

const agentsDirectory: McpDirectory = {
  source: "agents",
  filePath: (scope, workspacePath) =>
    scope === "user"
      ? join(currentHomeDirectory(), ".agents", "mcp.json")
      : workspaceFile("agents", workspacePath),
  servers: (config) => (isRecord(config.mcpServers) ? (config.mcpServers as ServerMap) : {}),
  replaceServers: (config, servers) => ({ ...config, mcpServers: servers }),
};

export const mcpDirectories: readonly McpDirectory[] = [knorviaDirectory, agentsDirectory];

export function directoryForLocation(location: SettingsDirectoryLocation): McpDirectory {
  const directory = mcpDirectories.find((entry) => entry.source === location.source);
  if (!directory) {
    throw new Error(`Unsupported MCP settings directory source: ${location.source}`);
  }
  return directory;
}

export function directoryLocation(
  directory: McpDirectory,
  scope: DirectoryScope,
  workspacePath?: string,
): SettingsDirectoryLocation {
  return {
    source: directory.source,
    scope: scope === "workspace" ? "project" : "user",
    directoryPath: dirname(directory.filePath(scope, workspacePath)),
    ...(workspacePath ? { projectPath: workspacePath } : {}),
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readConfig(filePath: string): Promise<ConfigObject | null> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw new Error(`无法读取 MCP 配置文件 ${filePath}: ${errorMessage(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`无法解析 MCP 配置文件 ${filePath}: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`MCP 配置文件 ${filePath} 必须是 JSON 对象`);
  }
  return parsed;
}

export async function writeConfig(filePath: string, config: ConfigObject): Promise<void> {
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = join(
    dirname(filePath),
    `${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function withEnabled(config: McpServerConfig, enabled: boolean): McpServerConfig {
  const { enable: legacyEnable, enabled: oldEnabled, ...fields } = config;
  void legacyEnable;
  void oldEnabled;
  return enabled ? fields : { ...fields, enabled: false };
}

export async function readDirectoryServers(
  directory: McpDirectory,
  filePath: string,
): Promise<ServerMap | null> {
  const current = await readConfig(filePath);
  if (!current) return null;
  const original = directory.servers(current);
  const migrated: ServerMap = {};
  let changed = false;
  for (const [name, config] of Object.entries(original)) {
    let canonical = config;
    if (isRecord(config) && "enable" in config) {
      changed = true;
      canonical = withEnabled(config, config.enable !== false && config.enabled !== false);
    }
    if (name !== "__proto__") migrated[name] = canonical;
  }
  if (!changed) return migrated;
  try {
    await writeConfig(filePath, directory.replaceServers(current, migrated));
  } catch (error) {
    console.warn("[mcp-sync] legacy enable migration failed:", filePath, errorMessage(error));
  }
  return migrated;
}

export function removeLegacyOverride(
  config: ConfigObject,
  location: SettingsDirectoryLocation,
  name: string,
): { config: ConfigObject; changed: boolean } {
  if (!isRecord(config.mcp)) {
    return { config, changed: false };
  }
  const legacyOverrides = config.mcp[location.directoryPath];
  if (!isRecord(legacyOverrides)) return { config, changed: false };
  const mcp = { ...config.mcp };
  const pathConfig = { ...legacyOverrides };
  if (!(name in pathConfig)) return { config, changed: false };
  delete pathConfig[name];
  if (Object.keys(pathConfig).length) mcp[location.directoryPath] = pathConfig;
  else delete mcp[location.directoryPath];
  return { config: { ...config, mcp }, changed: true };
}

export async function writeDirectoryEnabled(
  directory: McpDirectory,
  location: SettingsDirectoryLocation,
  name: string,
  enabled: boolean,
): Promise<void> {
  const scope = location.scope === "project" ? "workspace" : "user";
  const filePath = directory.filePath(
    scope,
    scope === "workspace" ? location.projectPath : undefined,
  );
  const current = (await readConfig(filePath)) ?? {};
  const servers = directory.servers(current);
  const server = servers[name];
  if (!isRecord(server)) return;
  const updated = directory.replaceServers(current, {
    ...servers,
    [name]: withEnabled(server, enabled),
  });
  await writeConfig(filePath, removeLegacyOverride(updated, location, name).config);
}

export async function cleanUserLegacyOverride(
  location: SettingsDirectoryLocation,
  name: string,
): Promise<void> {
  const current = (await readConfig(knorviaDirectory.filePath("user"))) ?? {};
  const updated = removeLegacyOverride(current, location, name);
  if (updated.changed) await writeConfig(knorviaDirectory.filePath("user"), updated.config);
}
