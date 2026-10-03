import {
  STORAGE_CATEGORY_IDS,
  STORAGE_MORE_ENTRIES_PATH,
  type StorageCategoryId,
  type StorageCategoryUsage,
  type StorageEntryUsage,
  type StorageRootSpec,
  type StorageRootUsage,
  type StorageVolume,
} from "@knorvia/shared";
import { classifyStoragePath, getStorageCategoryCleanability } from "./storageCatalog.js";

export interface StorageScanEntry {
  relativePath: string;
  bytes: number;
  mtimeMs: number;
}

interface StorageUsageAccumulator {
  add(entry: StorageScanEntry): void;
  snapshot(volume: StorageVolume | null): StorageRootUsage;
}

interface CategoryTotals {
  bytes: number;
  fileCount: number;
  entries: Map<string, StorageEntryUsage>;
}

function projectEntries(
  totals: CategoryTotals | undefined,
  maxEntries: number,
): StorageEntryUsage[] {
  if (!totals) return [];

  const sorted = Array.from(totals.entries.values(), (entry) => ({
    relativePath: entry.relativePath,
    bytes: entry.bytes,
    fileCount: entry.fileCount,
  })).sort((a, b) => b.bytes - a.bytes || a.relativePath.localeCompare(b.relativePath));

  if (sorted.length <= maxEntries) return sorted;

  const kept = sorted.slice(0, maxEntries);
  const rest = sorted.slice(maxEntries);
  kept.push({
    relativePath: STORAGE_MORE_ENTRIES_PATH,
    bytes: rest.reduce((sum, entry) => sum + entry.bytes, 0),
    fileCount: rest.reduce((sum, entry) => sum + entry.fileCount, 0),
  });
  return kept;
}

export function createStorageUsageAccumulator(
  spec: StorageRootSpec,
  options: { maxEntriesPerCategory?: number } = {},
): StorageUsageAccumulator {
  const maxEntries = options.maxEntriesPerCategory ?? 100;
  const context = {
    rootId: spec.id,
    hasCustomDataBaseDir: spec.hasCustomDataBaseDir,
  };
  const categories = new Map<StorageCategoryId, CategoryTotals>();
  let totalBytes = 0;
  let totalFiles = 0;

  return {
    add(entry) {
      const { categoryId, entryKey } = classifyStoragePath(entry.relativePath, context);
      const bytes = entry.bytes;
      let category = categories.get(categoryId);
      if (!category) {
        category = { bytes: 0, fileCount: 0, entries: new Map() };
        categories.set(categoryId, category);
      }
      let detail = category.entries.get(entryKey);
      if (!detail) {
        detail = { relativePath: entryKey, bytes: 0, fileCount: 0 };
        category.entries.set(entryKey, detail);
      }
      detail.bytes += bytes;
      detail.fileCount += 1;
      category.bytes += bytes;
      category.fileCount += 1;
      totalBytes += bytes;
      totalFiles += 1;
    },

    snapshot(volume) {
      const projectedCategories = STORAGE_CATEGORY_IDS.map((id): StorageCategoryUsage => {
        const category = categories.get(id);
        return {
          id,
          bytes: category?.bytes ?? 0,
          fileCount: category?.fileCount ?? 0,
          cleanability: getStorageCategoryCleanability(id),
          entries: projectEntries(category, maxEntries),
        };
      });
      return {
        id: spec.id,
        path: spec.path,
        volume,
        bytes: totalBytes,
        fileCount: totalFiles,
        categories: projectedCategories,
      };
    },
  };
}
