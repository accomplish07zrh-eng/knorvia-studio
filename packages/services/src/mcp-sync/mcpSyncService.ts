import { dirname } from "node:path";
import type { McpSyncImportResultItem } from "@knorvia/shared";
import { checkRemoteSyncDirectoryWriteAccess } from "../remote-sync/remoteSyncWriteAccess.js";
import type { IMcpSyncService } from "./mcpSync.js";
import { rewriteFilesystemArguments } from "./mcpArgumentPaths.js";
import {
  cleanUserLegacyOverride,
  currentHomeDirectory,
  directoryForLocation,
  directoryLocation,
  errorMessage,
  knorviaDirectory,
  readConfig,
  withEnabled,
  writeConfig,
  writeDirectoryEnabled,
} from "./mcpConfig.js";
import {
  cloneConfig,
  directoryRecords,
  discoverUserCandidates,
  effectiveUserNames,
  normalizedName,
  preferredDirectoryRecords,
} from "./mcpDirectories.js";

export function createMcpSyncService(
  dependencies: {
    listMcpServerStatuses?: IMcpSyncService["listWorkspaceMcpServerStatuses"];
  } = {},
): IMcpSyncService {
  return {
    async loadMcpFromUserDirectory(request) {
      const workspacePath = request?.workspacePath;
      const workspaceServers = workspacePath
        ? await preferredDirectoryRecords("workspace", workspacePath)
        : [];
      const userServers = await preferredDirectoryRecords("user", request?.workspacePath);
      return { servers: [...workspaceServers, ...userServers] };
    },

    async listWorkspaceMcpServerStatuses(params) {
      if (!dependencies.listMcpServerStatuses) {
        throw new Error("MCP server status listing is unavailable in this runtime");
      }
      return dependencies.listMcpServerStatuses(params);
    },

    async saveMcpToUserDirectory(payload) {
      const scope = payload.projectPath ? "workspace" : "user";
      if (payload.action === "set-enabled") {
        if (typeof payload.enabled !== "boolean") {
          throw new Error("Missing enabled value for MCP set-enabled action");
        }
        const location =
          payload.location ?? directoryLocation(knorviaDirectory, scope, payload.projectPath);
        const directory = directoryForLocation(location);
        await writeDirectoryEnabled(directory, location, payload.name, payload.enabled);
        await cleanUserLegacyOverride(location, payload.name);
        return;
      }
      const records = await directoryRecords(knorviaDirectory, scope, payload.projectPath);
      const servers = Object.fromEntries(records.map((record) => [record.name, record.config]));
      if (payload.action === "upsert") {
        if (!payload.config) throw new Error("Missing MCP config for upsert action");
        servers[payload.name] = payload.config;
      } else {
        delete servers[payload.name];
      }
      const filePath = knorviaDirectory.filePath(scope, payload.projectPath);
      const current = (await readConfig(filePath)) ?? {};
      await writeConfig(filePath, knorviaDirectory.replaceServers(current, servers));
    },

    async listLocalUserMcpCandidates() {
      const localHomeDir = currentHomeDirectory();
      return { candidates: await discoverUserCandidates(), localHomeDir };
    },

    async listRemoteUserMcpStatuses(params) {
      const remoteHomeDir = currentHomeDirectory();
      const existing = await effectiveUserNames();
      const statuses = params.names.map((name) => {
        const record = existing.get(normalizedName(name));
        return record ? { name, exists: true, path: record.path } : { name, exists: false };
      });
      return { statuses, remoteHomeDir };
    },

    async exportMcpServers(params) {
      const candidates = await discoverUserCandidates();
      const localHomeDir = currentHomeDirectory();
      const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const servers = params.serverIds.map((id) => {
        const candidate = candidatesById.get(id);
        if (!candidate) throw new Error(`mcp sync candidate not found: ${id}`);
        return { ...candidate, config: cloneConfig(candidate.config) };
      });
      return { servers, localHomeDir };
    },

    async checkRemoteUserMcpWriteAccess() {
      return checkRemoteSyncDirectoryWriteAccess(dirname(knorviaDirectory.filePath("user")));
    },

    async importMcpServers(params) {
      if (params.overwrite) throw new Error("mcp sync overwrite is not supported");
      const filePath = knorviaDirectory.filePath("user");
      const current = (await readConfig(filePath)) ?? {};
      const targetServers = knorviaDirectory.servers(current);
      const existingByName = await effectiveUserNames();
      const results: McpSyncImportResultItem[] = [];
      let changed = false;
      for (const server of params.servers) {
        const nameKey = normalizedName(server.name);
        if (targetServers[server.name]) {
          results.push({ name: server.name, status: "skipped", path: filePath });
          continue;
        }
        const existing = existingByName.get(nameKey);
        if (existing) {
          results.push({ name: server.name, status: "skipped", path: existing.path });
          continue;
        }
        try {
          const config = rewriteFilesystemArguments(
            server.name,
            withEnabled(cloneConfig(server.config), server.enabled),
            params,
          );
          targetServers[server.name] = config;
          existingByName.set(nameKey, {
            name: server.name,
            config,
            enabled: server.enabled,
            source: "knorvia",
            path: filePath,
          });
          results.push({ name: server.name, status: "synced", path: filePath });
          changed = true;
        } catch (error) {
          results.push({
            name: server.name,
            status: "failed",
            path: filePath,
            error: errorMessage(error),
          });
        }
      }
      if (changed)
        await writeConfig(filePath, knorviaDirectory.replaceServers(current, targetServers));
      return { results };
    },
  };
}
