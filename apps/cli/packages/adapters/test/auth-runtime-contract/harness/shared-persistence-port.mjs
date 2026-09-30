// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getPersistenceState } from "./seam-state.mjs";

const DEFAULT_LOCK_RETRIES_MS = Object.freeze([0, 2, 5, 10, 20, 40, 80, 160, 320, 640]);
const DEFAULT_RENAME_RETRIES_MS = Object.freeze([0, 5, 10, 20]);

function allowedRoot() {
  const value = process.env.KNORVIA_TEST_TEMP_ROOT;
  if (!value) throw new Error("KNORVIA_TEST_TEMP_ROOT is required by the owned persistence seam");
  return path.resolve(value);
}

function assertOwned(filePath) {
  const root = allowedRoot();
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  ) {
    return target;
  }
  throw new Error(`Owned persistence seam refused path outside test temp: ${target}`);
}

function record(type, detail = {}) {
  getPersistenceState().events.push({ at: Date.now(), pid: process.pid, type, ...detail });
}

async function acquireLock(lockPath, delays, maxWaitMs) {
  const started = Date.now();
  for (const waitMs of delays) {
    if (waitMs > 0) await delay(waitMs);
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - started >= maxWaitMs) break;
    }
  }
  throw new Error(`Owned test lock timed out: ${lockPath}`);
}

export async function withFileLock(filePath, operation, options = {}) {
  const target = assertOwned(filePath);
  const lockPath = `${target}.knorvia-test-lock`;
  const delays = options.lockRetryDelaysMs ?? DEFAULT_LOCK_RETRIES_MS;
  const maxWaitMs = Math.min(options.lockMaxWaitMs ?? 2000, 5000);
  record("lock:waiting", { target });
  await mkdir(path.dirname(lockPath), { mode: 0o700, recursive: true });
  await acquireLock(lockPath, delays, maxWaitMs);
  record("lock:acquired", { target });
  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
    record("lock:released", { target });
  }
}

export async function atomicWritePrivateTextFile(filePath, content, renameRetryDelaysMs) {
  const target = assertOwned(filePath);
  const state = getPersistenceState();
  const parent = path.dirname(target);
  const temporary = path.join(
    parent,
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(parent, { mode: 0o700, recursive: true });
  record("write:start", { bytes: Buffer.byteLength(content), target, temporary });
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    const writeDelay = Number(process.env.KNORVIA_TEST_WRITE_DELAY_MS ?? 0);
    if (writeDelay > 0) await delay(Math.min(writeDelay, 250));
    if (state.failNextWrite) {
      const error = state.failNextWrite;
      state.failNextWrite = undefined;
      throw error;
    }
    const retryDelays = renameRetryDelaysMs ?? DEFAULT_RENAME_RETRIES_MS;
    let lastError;
    for (const waitMs of retryDelays) {
      if (waitMs > 0) await delay(waitMs);
      try {
        await rename(temporary, target);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    record("write:committed", { target });
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    record("write:cleanup", { target, temporary });
  }
}

export async function backupCorruptFile(filePath) {
  const target = assertOwned(filePath);
  const state = getPersistenceState();
  if (state.failNextBackup) {
    const error = state.failNextBackup;
    state.failNextBackup = undefined;
    throw error;
  }
  const backup = `${target}.corrupt-${process.pid}-${Date.now()}`;
  await copyFile(target, backup);
  record("backup:created", { backup, target });
  return backup;
}

export const OWNED_PERSISTENCE_LIMITS = Object.freeze({
  lockMaxWaitMs: 5000,
  lockRetryDelaysMs: DEFAULT_LOCK_RETRIES_MS,
  renameRetryDelaysMs: DEFAULT_RENAME_RETRIES_MS,
});
