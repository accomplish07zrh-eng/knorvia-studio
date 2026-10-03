import { createHash } from "node:crypto";

import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { basename, dirname, join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { acquireFileLock } from "./atomicFileLock.js";

const DEFAULT_LOCK_RETRY_DELAYS_MS = [25, 50, 100, 200, 400] as const;

const DEFAULT_LOCK_OWNERLESS_GRACE_MS = 100;

const DEFAULT_LOCK_MAX_WAIT_MS = 8000;

const DEFAULT_RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800] as const;

const processFileLockTails = new Map<string, Promise<void>>();

export interface SharedFileLockOptions {
  lockRetryDelaysMs?: readonly number[];
  lockOwnerlessGraceMs?: number;
  lockMaxWaitMs?: number;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isRetryableRenameError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

async function renameWithRetry(
  tempPath: string,
  filePath: string,
  retryDelaysMs: readonly number[],
): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      const delay = retryDelaysMs[attempt];
      if (delay === undefined || !isRetryableRenameError(error)) {
        throw error;
      }

      await sleep(delay);
      attempt += 1;
    }
  }
}

export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
  options: SharedFileLockOptions = {},
): Promise<T> {
  const previousTail = processFileLockTails.get(filePath) ?? Promise.resolve();
  let releaseProcessQueue!: () => void;
  const currentTail = new Promise<void>((resolve) => {
    releaseProcessQueue = resolve;
  });
  processFileLockTails.set(filePath, currentTail);

  await previousTail;

  let releaseLock: (() => Promise<void>) | undefined;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    releaseLock = await acquireFileLock(
      filePath,
      options.lockRetryDelaysMs ?? DEFAULT_LOCK_RETRY_DELAYS_MS,
      options.lockOwnerlessGraceMs ?? DEFAULT_LOCK_OWNERLESS_GRACE_MS,
      options.lockMaxWaitMs ?? DEFAULT_LOCK_MAX_WAIT_MS,
    );
    return await operation();
  } finally {
    try {
      await releaseLock?.();
    } finally {
      releaseProcessQueue();
      if (processFileLockTails.get(filePath) === currentTail) {
        processFileLockTails.delete(filePath);
      }
    }
  }
}

export async function atomicWritePrivateTextFile(
  filePath: string,
  content: string,
  renameRetryDelaysMs: readonly number[] = DEFAULT_RENAME_RETRY_DELAYS_MS,
): Promise<void> {
  const directory = dirname(filePath);
  const tempPath = join(
    directory,
    "." +
      basename(filePath) +
      "." +
      process.pid +
      "." +
      Date.now() +
      "." +
      Math.random().toString(16).slice(2) +
      ".tmp",
  );
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempPath, content, { encoding: "utf-8", mode: 0o600 });
    await renameWithRetry(tempPath, filePath, renameRetryDelaysMs);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function backupCorruptFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const contentId = createHash("sha256").update(content).digest("hex").slice(0, 24);
  const backupPath = filePath + ".corrupt-" + contentId + ".bak";

  try {
    await writeFile(backupPath, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (getErrorCode(error) !== "EEXIST") {
      throw error;
    }
  }

  await chmod(backupPath, 0o600);
  return backupPath;
}
