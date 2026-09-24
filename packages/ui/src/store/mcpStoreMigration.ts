import type { McpServerConfig, NativeMcpServerRecord } from "@knorvia/shared";
import { logger } from "@/logger.js";
import {
  fetchNativeMcpServers,
  persistCliMcpToUserDirectory,
  type McpPlatformService,
  type MigrateLegacyResult,
} from "@/store/mcpStoreDesktop.js";
import {
  clearLegacyCommonMcpServers,
  readLegacyCommonMcpServers,
} from "@/store/mcpStoreHelpers.js";

interface CommonMcpMigrationResult extends MigrateLegacyResult {
  completed: boolean;
  changed: boolean;
}

function isKnorviaAgentUserServer(server: NativeMcpServerRecord): boolean {
  return (
    server.source === "knorviaagentmcp" &&
    server.scope === "user" &&
    (!server.location || server.location.source === "knorvia")
  );
}

export async function importLegacyCommonServersToKnorviaAgent(
  platform: McpPlatformService | null,
  legacyServers: Record<string, McpServerConfig>,
  nativeServers: NativeMcpServerRecord[],
  sourcePath?: string,
): Promise<CommonMcpMigrationResult> {
  const entries = Object.entries(legacyServers);
  const totalCount = entries.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      importedCount: 0,
      skippedCount: 0,
      sourcePath,
      completed: true,
      changed: false,
    };
  }

  const existingNames = new Set(
    nativeServers.filter(isKnorviaAgentUserServer).map((server) => server.name),
  );
  let importedCount = 0;
  let skippedCount = 0;

  for (const [name, config] of entries) {
    if (existingNames.has(name)) {
      skippedCount += 1;
      continue;
    }

    try {
      const persisted = await persistCliMcpToUserDirectory(platform, {
        action: "upsert",
        source: "knorviaagentmcp",
        name,
        config,
      });
      if (!persisted) {
        return {
          totalCount,
          importedCount,
          skippedCount,
          sourcePath,
          completed: false,
          changed: importedCount > 0,
        };
      }
    } catch (error) {
      logger.warn(`[mcpStore] migrate legacy common MCP ${name} failed`, String(error));
      return {
        totalCount,
        importedCount,
        skippedCount,
        sourcePath,
        completed: false,
        changed: importedCount > 0,
      };
    }

    existingNames.add(name);
    importedCount += 1;
  }

  return {
    totalCount,
    importedCount,
    skippedCount,
    sourcePath,
    completed: true,
    changed: importedCount > 0,
  };
}

export async function migrateStoredCommonMcpToKnorviaAgent(
  platform: McpPlatformService | null,
  nativeServers: NativeMcpServerRecord[],
  workspacePath?: string,
): Promise<NativeMcpServerRecord[]> {
  const legacyServers = readLegacyCommonMcpServers();
  if (Object.keys(legacyServers).length === 0) {
    return nativeServers;
  }

  // 旧通用 MCP 保存在 localStorage，不迁移就直接去掉 common 读取会让用户配置从设置页和运行时消失。
  const migration = await importLegacyCommonServersToKnorviaAgent(
    platform,
    legacyServers,
    nativeServers,
    "localStorage:knorvia-mcp-config",
  );
  if (migration.completed) {
    // 只有确认写入 knorvia agent 目录后才清理旧数据，避免 Web 端没有 desktop bridge 时丢配置。
    clearLegacyCommonMcpServers();
  }
  if (!migration.changed) {
    return nativeServers;
  }

  logger.info(
    `[mcpStore] migrated ${migration.importedCount} legacy common MCP servers to knorvia agent config`,
  );
  return fetchNativeMcpServers(platform, { workspacePath });
}
