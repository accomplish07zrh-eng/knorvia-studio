import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PluginSyncImportResultItem, PluginSyncRemoteStatus } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "../paths.js";
import { checkRemoteSyncDirectoriesWriteAccess } from "../remote-sync/remoteSyncWriteAccess.js";
import type { IPluginSyncService } from "./pluginSync.js";
import {
  createPluginSyncArchive,
  extractPluginSyncArchive,
  PLUGIN_SYNC_METADATA_ARCHIVE_PATH,
} from "./pluginSyncArchive.js";
import {
  collectCandidates,
  configPath,
  configuredIds,
  pluginId,
  pluginRoot,
  readPluginManifest,
  record,
  registerPlugin,
  required,
  safeDirectory,
} from "./pluginSyncInventory.js";
import { exportMarketplace, importMarketplace } from "./pluginSyncMarketplaceArchive.js";
import { normalizePluginSyncRelativePath, resolvePluginSyncPathWithin } from "./pluginSyncPath.js";

interface PluginMetadata {
  name: string;
  pluginId: string;
  directoryName: string;
  enabled?: boolean;
}

function checkSize(size: number, max: number): void {
  if (size > max) throw new Error(`plugin sync archive exceeds limit: ${size}/${max}`);
}

function parseMetadata(value: unknown): PluginMetadata[] {
  if (!record(value) || !Array.isArray(value.plugins)) {
    throw new Error("invalid plugin sync archive metadata");
  }
  return value.plugins.map((entry: unknown) => {
    if (!record(entry)) throw new Error("invalid plugin sync archive plugin metadata");
    return {
      name: required(entry.name, "plugin metadata name"),
      pluginId: pluginId(required(entry.pluginId, "plugin metadata id")),
      directoryName: normalizePluginSyncRelativePath(
        required(entry.directoryName, "plugin metadata directory"),
      ),
      ...(typeof entry.enabled === "boolean" ? { enabled: entry.enabled } : {}),
    };
  });
}

async function importPluginEntries(entries: PluginMetadata[], temporary: string) {
  const root = pluginRoot();
  const ids = await configuredIds();
  const results: PluginSyncImportResultItem[] = [];
  for (const entry of entries) {
    const directoryName = normalizePluginSyncRelativePath(entry.directoryName);
    const id = pluginId(entry.pluginId);
    const extracted = resolvePluginSyncPathWithin(temporary, directoryName);
    const target = resolvePluginSyncPathWithin(root, directoryName);
    let staging: string | undefined;
    try {
      const manifest = await readPluginManifest(extracted);
      if (!manifest) throw new Error(`plugin manifest not found: ${directoryName}`);
      if (pluginId(manifest.pluginId).toLowerCase() !== id.toLowerCase()) {
        throw new Error(`plugin manifest id mismatch: ${manifest.pluginId} !== ${id}`);
      }
      const item = { name: manifest.name, pluginId: id, directoryName };
      if (existsSync(target)) {
        results.push({ ...item, status: "skipped", path: target });
        continue;
      }
      const existing = ids.get(id.toLowerCase());
      if (existing) {
        results.push({ ...item, status: "skipped", path: existing });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      staging = resolvePluginSyncPathWithin(
        root,
        `.importing-${safeDirectory(directoryName)}-${randomUUID()}`,
      );
      await cp(extracted, staging, { recursive: true, errorOnExist: true, force: false });
      if (existsSync(target)) throw new Error(`plugin target already exists: ${target}`);
      await rename(staging, target);
      staging = undefined;
      try {
        await registerPlugin(target, id, entry.enabled);
      } catch (error) {
        await rm(target, { recursive: true, force: true });
        throw error;
      }
      ids.set(id.toLowerCase(), target);
      results.push({ ...item, status: "synced", path: target });
    } catch (error) {
      if (staging) await rm(staging, { recursive: true, force: true });
      results.push({
        name: entry.name,
        pluginId: id,
        directoryName,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { results };
}

export function createPluginSyncService(options?: {
  maxArchiveBytes?: number;
}): IPluginSyncService {
  const max = options?.maxArchiveBytes ?? 50 * 1024 * 1024;
  return {
    async listLocalUserPluginCandidates() {
      return { candidates: await collectCandidates(), maxArchiveBytes: max };
    },
    async listRemoteUserPluginStatuses(params) {
      const root = pluginRoot();
      const ids = await configuredIds();
      const statuses: PluginSyncRemoteStatus[] = params.plugins.map((entry) => {
        const directoryName = normalizePluginSyncRelativePath(entry.directoryName);
        const id = pluginId(entry.pluginId);
        const target = resolvePluginSyncPathWithin(root, directoryName);
        if (existsSync(target)) {
          return {
            pluginId: id,
            directoryName,
            exists: true,
            path: target,
            reason: "targetExists",
          };
        }
        const existing = ids.get(id.toLowerCase());
        if (existing) {
          return {
            pluginId: id,
            directoryName,
            exists: true,
            path: existing,
            reason: "samePluginId",
          };
        }
        return { pluginId: id, directoryName, exists: false };
      });
      return { statuses };
    },
    async exportPluginsArchive(params) {
      const candidates = new Map(
        (await collectCandidates()).map((candidate) => [candidate.id, candidate]),
      );
      const selected = params.pluginIds.map((id) => {
        const candidate = candidates.get(id);
        if (!candidate) throw new Error(`plugin sync candidate not found: ${id}`);
        return candidate;
      });
      checkSize(
        selected.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        max,
      );
      const plugins = selected.map((candidate) => ({
        name: candidate.name,
        pluginId: candidate.pluginId,
        directoryName: candidate.directoryName,
        ...(candidate.enabledOverride !== undefined ? { enabled: candidate.enabledOverride } : {}),
      }));
      const entries = await Promise.all(
        selected.map(async (candidate) => ({
          sourcePath: await realpath(candidate.path),
          archivePath: candidate.directoryName,
        })),
      );
      const archive = await createPluginSyncArchive({ entries, metadata: { plugins } });
      checkSize(archive.byteLength, max);
      return {
        archive,
        archiveBytes: archive.byteLength,
        plugins: plugins.map((entry, index) => ({ id: selected[index]!.id, ...entry })),
      };
    },
    async importPluginsArchive(params) {
      if (params.overwrite) throw new Error("plugin sync overwrite is not supported");
      checkSize(params.archive.byteLength, max);
      const temporary = join(getKnorviaDataRootDir(), "tmp", `plugin-sync-${randomUUID()}`);
      try {
        await extractPluginSyncArchive(params.archive, temporary, { maxExtractedBytes: max });
        const metadata: unknown = JSON.parse(
          await readFile(join(temporary, PLUGIN_SYNC_METADATA_ARCHIVE_PATH), "utf8"),
        );
        return await importPluginEntries(parseMetadata(metadata), temporary);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
    async checkRemoteUserPluginWriteAccess() {
      return checkRemoteSyncDirectoriesWriteAccess([pluginRoot(), dirname(configPath())]);
    },
    exportMarketplaceSourceArchive(params) {
      return exportMarketplace(params, max);
    },
    importMarketplaceSourceArchive(params) {
      return importMarketplace(params, max);
    },
  };
}
