import { mkdir, writeFile, rename, rm, readdir, stat } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { acquireFileLock } from "@knorvia/shared/node";
import { isInjectedFsFaultError, maybeThrowInjectedFsFault } from "./fsFaultInjection.js";

interface AtomicWriteTextOptions {
  renameRetryDelaysMs?: readonly number[];
  lockRetryDelaysMs?: readonly number[];
  lockOwnerlessGraceMs?: number;
  lockMaxWaitMs?: number;
  tempFileStaleMs?: number;
  useFileLock?: boolean;
  beforeRename?: () => void | Promise<void>;
  runRename?: (renameFile: () => Promise<void>) => Promise<void>;
}

const RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800, 1600, 3200];
const LOCK_RETRY_DELAYS_MS = [25, 50, 100, 200, 400];
const LOCK_OWNERLESS_GRACE_MS = 100;
const LOCK_MAX_WAIT_MS = 8000;
const TEMP_FILE_STALE_MS = 60000;

async function cleanupStaleTempFiles(
  directory: string,
  targetName: string,
  ownTempPath: string,
  staleMs: number,
): Promise<void> {
  const prefix = `${targetName}.`;
  const now = Date.now();

  try {
    const entries = await readdir(directory);
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.startsWith(prefix) || !entry.endsWith(".tmp")) return;
        const entryPath = join(directory, entry);
        if (entryPath === ownTempPath) return;

        try {
          const entryStat = await stat(entryPath);
          if (now - entryStat.mtimeMs < staleMs) return;
          await rm(entryPath, { force: true });
        } catch {
          // Stale-file maintenance must not prevent the requested write.
        }
      }),
    );
  } catch {
    // Listing stale temporary files is best effort.
  }
}

async function renameWithRetry(
  tempPath: string,
  targetPath: string,
  delays: readonly number[] = RENAME_RETRY_DELAYS_MS,
): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      maybeThrowInjectedFsFault({ operation: "rename", path: targetPath });
      await rename(tempPath, targetPath);
      return;
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || isInjectedFsFaultError(error)) throw error;
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (typeof code !== "string" || !["EPERM", "EBUSY", "EACCES"].includes(code)) {
        throw error;
      }
      await sleep(delay);
      attempt += 1;
    }
  }
}

export async function atomicWriteText(
  filePath: string,
  content: string,
  options?: AtomicWriteTextOptions,
): Promise<void> {
  const directory = dirname(filePath);
  const targetName = basename(filePath);
  const tempPath = join(
    directory,
    `${targetName}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  maybeThrowInjectedFsFault({ operation: "mkdir", path: directory });
  await mkdir(directory, { recursive: true });
  const releaseLock =
    options?.useFileLock === false
      ? null
      : await acquireFileLock(
          filePath,
          options?.lockRetryDelaysMs ?? LOCK_RETRY_DELAYS_MS,
          options?.lockOwnerlessGraceMs ?? LOCK_OWNERLESS_GRACE_MS,
          options?.lockMaxWaitMs ?? LOCK_MAX_WAIT_MS,
        );

  try {
    await cleanupStaleTempFiles(
      directory,
      targetName,
      tempPath,
      options?.tempFileStaleMs ?? TEMP_FILE_STALE_MS,
    );
    maybeThrowInjectedFsFault({ operation: "writeFile", path: tempPath });
    await writeFile(tempPath, content, "utf-8");
    await options?.beforeRename?.();

    const renameFile = () => renameWithRetry(tempPath, filePath, options?.renameRetryDelaysMs);
    if (options?.runRename) {
      await options.runRename(renameFile);
    } else {
      await renameFile();
    }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await releaseLock?.();
  }
}

export async function atomicWriteJson(
  filePath: string,
  data: Record<string, unknown>,
  options?: AtomicWriteTextOptions,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await atomicWriteText(filePath, content, options);
}
