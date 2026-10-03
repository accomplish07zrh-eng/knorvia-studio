import { KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE } from "../errors.js";

import { mkdir, readFile, readdir, rmdir, rm, stat, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { createLockInstanceObserver, type ObserveLockInstance } from "./lockInstanceObserver.js";

const MAX_LOCK_METADATA_CLOCK_SKEW_MS = 5 * 60000;

interface FileLockMetadata {
  createdAt: number | null;
  pid: number | null;
}

interface LockRemovalAttempt {
  removed: boolean;
  error?: unknown;
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function admittedTimestamp(value: unknown, observedAt: number): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= observedAt + MAX_LOCK_METADATA_CLOCK_SKEW_MS
  ) {
    return value;
  }
  return null;
}

function parseMetadata(raw: string, observedAt: number): FileLockMetadata {
  try {
    const value = JSON.parse(raw);
    const createdAt = admittedTimestamp(value.createdAt, observedAt);
    const candidatePid = value.pid;
    const pid =
      typeof candidatePid === "number" && Number.isSafeInteger(candidatePid) && candidatePid > 0
        ? candidatePid
        : null;
    return { createdAt, pid };
  } catch {
    return { createdAt: null, pid: null };
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function isOwnerEntry(entry: string): boolean {
  return entry.startsWith("owner-") && entry.endsWith(".json");
}

async function isOwnerReclaimable(
  ownerFile: string,
  ownerlessGraceMs: number,
  observeLockInstance: ObserveLockInstance,
): Promise<boolean> {
  const observedAt = Date.now();
  const metadata = parseMetadata(await readFile(ownerFile, "utf-8"), observedAt);
  let createdAt = metadata.createdAt;
  if (createdAt === null) {
    const ownerStat = await stat(ownerFile);
    createdAt =
      admittedTimestamp(ownerStat.mtimeMs, observedAt) ??
      observeLockInstance(ownerFile, ownerStat, observedAt);
  }
  const ownerExited = metadata.pid !== null && !isProcessAlive(metadata.pid);
  const ownerlessStale = metadata.pid === null && observedAt - createdAt >= ownerlessGraceMs;
  return ownerExited || ownerlessStale;
}

async function removeAbandonedLock(
  lockFile: string,
  ownerlessGraceMs: number,
  observeLockInstance: ObserveLockInstance,
): Promise<LockRemovalAttempt> {
  try {
    const lockStat = await stat(lockFile);
    if (lockStat.isDirectory()) {
      const entries = await readdir(lockFile);
      const owners = entries.filter(isOwnerEntry);
      if (owners.length === 1) {
        const ownerFile = join(lockFile, owners[0]!);
        if (!(await isOwnerReclaimable(ownerFile, ownerlessGraceMs, observeLockInstance))) {
          return { removed: false };
        }
        await rm(ownerFile, { force: true });
        await rmdir(lockFile);
        return { removed: true };
      }

      const observedAt = Date.now();
      const createdAt =
        admittedTimestamp(lockStat.mtimeMs, observedAt) ??
        observeLockInstance(lockFile, lockStat, observedAt);
      if (observedAt - createdAt < ownerlessGraceMs) {
        return { removed: false };
      }
      for (const owner of owners) {
        if (
          !(await isOwnerReclaimable(join(lockFile, owner), ownerlessGraceMs, observeLockInstance))
        ) {
          return { removed: false };
        }
      }
      await Promise.all(entries.map((entry) => rm(join(lockFile, entry), { force: true })));
      await rmdir(lockFile);
      return { removed: true };
    }

    const originalContents = await readFile(lockFile, "utf-8");
    if (!(await isOwnerReclaimable(lockFile, ownerlessGraceMs, observeLockInstance))) {
      return { removed: false };
    }
    if ((await readFile(lockFile, "utf-8")) !== originalContents) {
      return { removed: false };
    }
    await rm(lockFile, { force: true });
    return { removed: true };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTEMPTY") {
      return { removed: false };
    }
    return { removed: false, error };
  }
}

function timeoutError(
  filePath: string,
  lockFile: string,
  waitedMs: number,
  cause: unknown,
): NodeJS.ErrnoException & { cause: unknown } {
  const error = new Error(
    `Timed out after ${waitedMs}ms waiting for the Knorvia Studio file lock: ${lockFile}`,
  ) as NodeJS.ErrnoException & { cause: unknown };
  error.code = KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
  error.path = filePath;
  error.syscall = "mkdir";
  error.cause = cause;
  return error;
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "EACCES" || code === "EPERM";
}

async function releaseOwnedLock(lockFile: string, ownerFile: string): Promise<void> {
  try {
    await rm(ownerFile, { force: true });
  } catch {}
  try {
    await rmdir(lockFile);
  } catch {}
}

export async function acquireFileLock(
  filePath: string,
  retryDelaysMs: readonly number[],
  ownerlessGraceMs: number,
  maxWaitMs: number,
): Promise<() => Promise<void>> {
  const lockFile = filePath + ".lock";
  const token = process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const ownerFile = join(lockFile, "owner-" + token + ".json");
  const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now(), token }) + "\n";
  const startedAt = Date.now();
  const effectiveGrace = Math.min(
    Math.max(ownerlessGraceMs, 0),
    Math.max(Math.floor(maxWaitMs / 2), 0),
  );
  const observeLockInstance = createLockInstanceObserver();
  let lastRemovalError: unknown = undefined;
  const ownerName = "owner-" + token + ".json";

  for (let attempt = 0; ; attempt += 1) {
    let createdLock = false;
    let acquisitionError: unknown;
    try {
      await mkdir(lockFile);
      createdLock = true;
      const createdStat = await stat(lockFile);
      await writeFile(ownerFile, payload, { encoding: "utf-8", flag: "wx" });
      const currentStat = await stat(lockFile);
      const currentOwners = (await readdir(lockFile)).filter(isOwnerEntry);
      const ownsLock =
        currentStat.dev === createdStat.dev &&
        currentStat.ino === createdStat.ino &&
        currentOwners.length === 1 &&
        currentOwners[0] === ownerName;
      if (!ownsLock) {
        throw Object.assign(
          new Error("Knorvia Studio file lock ownership changed during acquire"),
          {
            code: "EEXIST",
          },
        );
      }
      return async () => {
        await releaseOwnedLock(lockFile, ownerFile);
      };
    } catch (error) {
      if (createdLock) {
        await releaseOwnedLock(lockFile, ownerFile);
      }
      const code = errorCode(error);
      const lostCreatedLock = createdLock && code === "ENOENT";
      if (code !== "EEXIST" && !lostCreatedLock) {
        throw error;
      }
      acquisitionError = error;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxWaitMs) {
      if (isPermissionError(lastRemovalError)) {
        throw lastRemovalError;
      }
      throw timeoutError(filePath, lockFile, elapsed, acquisitionError);
    }

    const removalAttempt = await removeAbandonedLock(lockFile, effectiveGrace, observeLockInstance);
    if (removalAttempt.removed) {
      continue;
    }
    if (removalAttempt.error) {
      lastRemovalError = removalAttempt.error;
    }
    const remaining = Math.max(maxWaitMs - elapsed, 0);
    if (retryDelaysMs.length === 0 || remaining === 0) {
      if (isPermissionError(lastRemovalError)) {
        throw lastRemovalError;
      }
      throw timeoutError(filePath, lockFile, elapsed, lastRemovalError ?? acquisitionError);
    }
    const delay = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? remaining;
    await sleep(Math.min(delay, remaining));
  }
}
