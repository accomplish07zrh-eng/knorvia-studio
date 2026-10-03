import { createHash } from "node:crypto";
import type {
  McpServerConfig,
  McpSyncCandidate,
  McpSyncSource,
  NativeMcpServerRecord,
} from "@knorvia/shared";
import { directoryLocation, mcpDirectories, readDirectoryServers } from "./mcpConfig.js";
import type { DirectoryScope, McpDirectory } from "./mcpConfig.js";

export interface UserMcpRecord {
  name: string;
  config: McpServerConfig;
  enabled: boolean;
  source: McpSyncSource;
  path: string;
}

export function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

export function cloneConfig(config: McpServerConfig): McpServerConfig {
  return JSON.parse(JSON.stringify(config));
}

export async function directoryRecords(
  directory: McpDirectory,
  scope: DirectoryScope,
  workspacePath?: string,
): Promise<NativeMcpServerRecord[]> {
  const filePath = directory.filePath(scope, workspacePath);
  const servers = await readDirectoryServers(directory, filePath);
  if (!servers) return [];
  const location = directoryLocation(directory, scope, workspacePath);
  return Object.entries(servers).map(([name, config]) => ({
    source: "knorviaagentmcp",
    scope,
    name,
    config,
    enabled: config.enabled !== false,
    projectPath: scope === "workspace" ? workspacePath : undefined,
    location,
    file: { format: "json", filePath },
  }));
}

export async function preferredDirectoryRecords(
  scope: DirectoryScope,
  workspacePath?: string,
): Promise<NativeMcpServerRecord[]> {
  for (const directory of mcpDirectories) {
    const records = await directoryRecords(directory, scope, workspacePath);
    if (records.length) return records;
  }
  return [];
}

export async function preferredUserRecords(): Promise<UserMcpRecord[]> {
  for (const directory of mcpDirectories) {
    const path = directory.filePath("user");
    const servers = await readDirectoryServers(directory, path);
    if (!servers) continue;
    const records = Object.entries(servers).map(([name, config]) => ({
      name,
      config,
      enabled: config.enabled !== false,
      source: directory.source,
      path,
    }));
    if (records.length) {
      records.sort((left, right) => left.name.localeCompare(right.name));
      return records;
    }
  }
  return [];
}

export async function effectiveUserNames(): Promise<Map<string, UserMcpRecord>> {
  const names = new Map<string, UserMcpRecord>();
  for (const record of await preferredUserRecords()) {
    const name = normalizedName(record.name);
    if (!names.has(name)) names.set(name, record);
  }
  return names;
}

export async function discoverUserCandidates(): Promise<McpSyncCandidate[]> {
  const records = await preferredUserRecords();
  return records.map((record) => ({
    id: createHash("sha256")
      .update(`${record.source}:${record.path}:${record.name}`, "utf8")
      .digest("hex"),
    name: record.name,
    config: cloneConfig(record.config),
    enabled: record.enabled,
    source: record.source,
    path: record.path,
  }));
}
