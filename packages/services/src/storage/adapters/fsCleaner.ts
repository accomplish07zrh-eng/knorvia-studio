import { lstat, readdir, rm, rmdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { FsCleanerPort, StorageDeleteResult } from "../app/ports.js";
import type { StorageCleanCandidate } from "../domain/cleanPlan.js";
import { normalizeStorageRelativePath, type StorageCleanScope } from "../domain/storageCatalog.js";
import { walkStorageRoot } from "./fsWalker.js";

async function listShallow(rootPath: string, prefix: string): Promise<StorageCleanCandidate[]> {
  const directory = join(rootPath, prefix);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  const candidates: StorageCleanCandidate[] = [];
  for (const name of names) {
    try {
      const stats = await lstat(join(directory, name));
      if (!stats.isFile()) continue;
      candidates.push({
        relativePath: `${prefix}/${name}`,
        bytes: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    } catch {
      continue;
    }
  }
  return candidates;
}

async function listRecursive(rootPath: string, prefix: string): Promise<StorageCleanCandidate[]> {
  const candidates: StorageCleanCandidate[] = [];
  await walkStorageRoot({
    rootPath: join(rootPath, prefix),
    onEntry: (entry) => {
      candidates.push({ ...entry, relativePath: `${prefix}/${entry.relativePath}` });
    },
  });
  return candidates;
}

export function createFsStorageCleaner(): FsCleanerPort {
  return {
    async listCandidates(rootPath: string, scopes: StorageCleanScope[]) {
      const groups = await Promise.all(
        scopes.map((scope) =>
          scope.recursive
            ? listRecursive(rootPath, scope.prefix)
            : listShallow(rootPath, scope.prefix),
        ),
      );
      const unique = new Map<string, StorageCleanCandidate>();
      for (const candidate of groups.flat()) {
        unique.set(normalizeStorageRelativePath(candidate.relativePath), candidate);
      }
      return Array.from(unique.values());
    },

    async deleteFiles(rootPath, targets, options) {
      const result: StorageDeleteResult = { deletedCount: 0, freedBytes: 0, failures: [] };
      const deleted: string[] = [];
      const queue = [...targets];
      const worker = async () => {
        for (let target = queue.shift(); target; target = queue.shift()) {
          const normalized = normalizeStorageRelativePath(target.relativePath);
          const absolute = join(rootPath, normalized);
          const back = relative(rootPath, absolute);
          if (back.startsWith("..") || back.split(sep).includes("..")) {
            result.failures.push({ path: normalized, code: "EOUTSIDE" });
            continue;
          }

          try {
            await rm(absolute, { force: false });
            result.deletedCount++;
            result.freedBytes += target.bytes;
            deleted.push(normalized);
          } catch (error) {
            const code =
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              typeof error.code === "string"
                ? error.code
                : "UNKNOWN";
            result.failures.push({ path: normalized, code });
          }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));

      const keep = new Set(options.keepDirectories);
      const directories = new Set<string>();
      for (const path of deleted) {
        let current = dirname(path);
        while (current && current !== "." && !keep.has(current)) {
          directories.add(current);
          current = dirname(current);
        }
      }
      const ordered = Array.from(directories).sort(
        (a, b) => b.split("/").length - a.split("/").length,
      );
      for (const directory of ordered) {
        await rmdir(join(rootPath, directory)).catch(() => {});
      }
      return result;
    },
  };
}
