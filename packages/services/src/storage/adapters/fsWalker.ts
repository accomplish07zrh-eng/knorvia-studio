import { lstat, opendir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { StoragePathError } from "@knorvia/shared";
import type { StorageScanEntry } from "../domain/usageAggregate.js";

interface WalkStorageRootOptions {
  rootPath: string;
  onEntry: (entry: StorageScanEntry) => void;
  onError?: (error: StoragePathError) => void;
  signal?: AbortSignal;
  /** 同时打开的目录数，默认 4。 */
  concurrency?: number;
  /** 每处理多少条目让出一次事件循环，默认 256。 */
  yieldEvery?: number;
}

interface WalkStorageRootResult {
  directoriesScanned: number;
  filesScanned: number;
  /** 根目录本身不存在时为 true（视为空根，不算错误）。 */
  missingRoot: boolean;
}

export async function walkStorageRoot(
  options: WalkStorageRootOptions,
): Promise<WalkStorageRootResult> {
  const { rootPath, onEntry, onError, signal } = options;
  const pending = [rootPath];
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const yieldEvery = Math.max(1, options.yieldEvery ?? 256);
  const result: WalkStorageRootResult = {
    directoriesScanned: 0,
    filesScanned: 0,
    missingRoot: false,
  };
  let active = 0;
  let failed = false;
  let entriesSinceYield = 0;

  function checkCancellation(): void {
    if (signal?.aborted) {
      throw new DOMException("storage scan aborted", "AbortError");
    }
  }

  function relativePath(path: string): string {
    return relative(rootPath, path).split(sep).join("/");
  }

  function errorCode(error: unknown): string {
    if (error !== null && typeof error === "object" && "code" in error) {
      const code = error.code;
      if (typeof code === "string") return code;
    }
    return "UNKNOWN";
  }

  async function yieldIfNeeded(): Promise<void> {
    entriesSinceYield += 1;
    if (entriesSinceYield >= yieldEvery) {
      entriesSinceYield = 0;
      await new Promise<void>((resolve) => setImmediate(resolve));
      checkCancellation();
    }
  }

  async function visitDirectory(path: string): Promise<void> {
    checkCancellation();
    let directory: Awaited<ReturnType<typeof opendir>>;
    try {
      directory = await opendir(path);
    } catch (error) {
      const code = errorCode(error);
      if (path === rootPath && code === "ENOENT") {
        result.missingRoot = true;
      } else {
        onError?.({ path: relativePath(path), code });
      }
      return;
    }

    result.directoriesScanned += 1;
    try {
      for await (const entry of directory) {
        checkCancellation();
        const entryPath = join(path, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        if (!entry.isFile()) continue;

        try {
          const stats = await lstat(entryPath);
          if (!stats.isFile()) continue;
          result.filesScanned += 1;
          onEntry({
            relativePath: relativePath(entryPath),
            bytes: stats.size,
            mtimeMs: stats.mtimeMs,
          });
        } catch (error) {
          const code = errorCode(error);
          if (code !== "ENOENT") {
            onError?.({ path: relativePath(entryPath), code });
          }
        }

        await yieldIfNeeded();
      }
    } finally {
      await directory.close().catch(() => {});
    }
  }

  await new Promise<void>((resolve, reject) => {
    function pump(): void {
      if (failed) return;
      while (pending.length > 0 && active < concurrency) {
        const path = pending.pop()!;
        active += 1;
        void visitDirectory(path)
          .then(() => {
            active -= 1;
            pump();
          })
          .catch((error: unknown) => {
            if (failed) return;
            failed = true;
            reject(error);
          });
      }
      if (pending.length === 0 && active === 0) resolve();
    }
    pump();
  });
  return result;
}
