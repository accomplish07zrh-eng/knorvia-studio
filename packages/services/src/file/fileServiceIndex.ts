import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { WorkspaceFileEntry } from "@knorvia/shared";
import { packWorkspaceFileEntries } from "@knorvia/shared/workspaceFileEntriesCodec";
import type { createServiceLogger } from "../logger/serviceLogger.js";
import { classifyFileEntry } from "./fileServiceIO.js";
import type { WorkspaceFileSearchFilter } from "./workspaceFileMentionFilter.js";
import { buildHostFileSearchCandidates } from "./workspaceFileSearch.js";
import {
  WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME,
  isWorkspaceFileSearchPathIgnored,
  loadWorkspaceFileSearchIgnoreRules,
} from "./workspaceFileIgnore.js";

interface WorkspaceIndex {
  at: number;
  signature: string;
  packed: string;
  candidates?: ReturnType<typeof buildHostFileSearchCandidates>;
}

async function ignoreFingerprint(root: string): Promise<string> {
  try {
    const metadata = await stat(join(root, WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME));
    return `${metadata.mtimeMs}:${metadata.size}`;
  } catch {
    return "none";
  }
}

function directoryUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "EACCES" || code === "EPERM" || code === "ENOENT";
}

export function createWorkspaceIndexOwner(
  filter: WorkspaceFileSearchFilter,
  logger: ReturnType<typeof createServiceLogger>,
): (root: string, identity?: string, refresh?: boolean) => Promise<WorkspaceIndex> {
  const indexes = new Map<string, WorkspaceIndex>();
  const scans = new Map<string, { signature: string; promise: Promise<WorkspaceIndex> }>();

  return async function ensureIndex(root, identity, refresh = false) {
    const key = identity?.trim() || root;
    const rules = await loadWorkspaceFileSearchIgnoreRules(root, logger);
    const signature = `${root}\n${await ignoreFingerprint(root)}`;
    for (const [cachedKey, cached] of indexes) {
      if (Date.now() - cached.at >= 60000) indexes.delete(cachedKey);
    }
    const underway = scans.get(key);
    if (!refresh && underway?.signature === signature) return underway.promise;
    const cached = indexes.get(key);
    if (!refresh && cached?.signature === signature) {
      indexes.delete(key);
      indexes.set(key, cached);
      return cached;
    }

    const scanning = (async (): Promise<WorkspaceIndex> => {
      const entries: WorkspaceFileEntry[] = [];
      const directories = [root];
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (true) {
            const directory = directories.pop();
            if (!directory) return;
            let children;
            try {
              children = await readdir(directory, { withFileTypes: true });
            } catch (error) {
              if (directoryUnavailable(error)) continue;
              throw error;
            }
            for (const child of children) {
              const path = join(directory, child.name);
              const relativePath = relative(root, path).split(sep).join("/");
              if (relativePath === WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME) continue;
              const type = await classifyFileEntry(path, child);
              if (isWorkspaceFileSearchPathIgnored(rules, relativePath, type)) continue;
              const entry = { name: child.name, path, relativePath, type };
              const decision = filter.evaluate(entry, { ignoreRulesActive: true });
              if (decision.include) entries.push({ name: child.name, path, relativePath, type });
              if (type === "directory" && !child.isSymbolicLink() && decision.traverse) {
                directories.push(path);
              }
            }
          }
        }),
      );
      entries.sort((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
        return left.relativePath.localeCompare(right.relativePath);
      });
      const packed = packWorkspaceFileEntries(entries);
      return { at: Date.now(), signature, packed };
    })();
    scans.set(key, { signature, promise: scanning });
    try {
      const completed = await scanning;
      if (scans.get(key)?.promise === scanning) {
        indexes.delete(key);
        indexes.set(key, completed);
        while (indexes.size > 4) {
          const oldest = indexes.keys().next().value;
          if (oldest === undefined) break;
          indexes.delete(oldest);
        }
      }
      return completed;
    } finally {
      if (scans.get(key)?.promise === scanning) scans.delete(key);
    }
  };
}
