// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  CURRENT_PROCESS_START_TIME,
  probeProcessStartTime,
} from "./workspace-hook-trust-process.js";
import type { FileWorkspaceHookTrustStoreOptions } from "./workspace-hook-trust-types.js";

const LOCK_MODE = 0o600;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_STALE_LOCK_MS = 30000;
const CONTENTION_INTERVAL_MS = 10;
const PROCESS_START_TOLERANCE_MS = 2000;

export type TrustLockOptions = Pick<
  FileWorkspaceHookTrustStoreOptions,
  "lockTimeoutMs" | "staleLockMs" | "probeProcessStartTime" | "writeLockOwnerMetadata"
>;

interface Owner {
  pid: number;
  token: string;
  startTime?: number;
  startTimeBasis: unknown;
}

interface Lease {
  handle: FileHandle;
  token: string;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function readOwner(path: string): Promise<Owner | null> {
  try {
    const decoded: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!decoded || typeof decoded !== "object") return null;
    const fields = decoded as Record<string, unknown>;
    if (typeof fields.pid !== "number" || typeof fields.token !== "string") return null;
    return {
      pid: fields.pid,
      token: fields.token,
      startTime: typeof fields.startTime === "number" ? fields.startTime : undefined,
      startTimeBasis: fields.startTimeBasis,
    };
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasCode(error, "EPERM");
  }
}

async function removeStaleLock(path: string, options: TrustLockOptions): Promise<void> {
  try {
    const observed = await stat(path);
    if (Date.now() - observed.mtimeMs <= (options.staleLockMs ?? DEFAULT_STALE_LOCK_MS)) return;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  const owner = await readOwner(path);
  if (owner) {
    if (owner.pid === process.pid) return;
    if (isAlive(owner.pid)) {
      // 旧版本的 startTime 可能是系统启动时间；活 PID 必须有明确的新标记才可比较。
      if (owner.startTimeBasis !== "process" || !Number.isFinite(owner.startTime)) return;
      let actual: number | null;
      try {
        actual = await (options.probeProcessStartTime ?? probeProcessStartTime)(owner.pid);
      } catch (error) {
        // 探测期间的 ENOENT 不能据此回收活 owner；保留锁并继续原争用流程。
        if (hasCode(error, "ENOENT")) return;
        throw error;
      }
      if (actual === null || !Number.isFinite(actual)) return;
      if (Math.abs(actual - owner.startTime!) <= PROCESS_START_TOLERANCE_MS) return;
    }
  }
  try {
    await unlink(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

async function cleanCreatedLock(path: string, handle: FileHandle): Promise<void> {
  try {
    await handle.close();
  } catch {
    /* 尽力关闭，不覆盖 metadata 的首因。 */
  }
  try {
    await unlink(path);
  } catch {
    /* 创建者失败清理可能遇到替换竞态。 */
  }
}

async function acquire(path: string, options: TrustLockOptions): Promise<Lease> {
  const started = Date.now();
  const timeout = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  while (true) {
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, "wx", LOCK_MODE);
      const token = randomUUID();
      const content = `${JSON.stringify({
        pid: process.pid,
        token,
        startTime: CURRENT_PROCESS_START_TIME,
        startTimeBasis: "process",
      })}\n`;
      if (options.writeLockOwnerMetadata) await options.writeLockOwnerMetadata(handle, content);
      else await handle.writeFile(content, "utf8");
      return { handle, token };
    } catch (error) {
      if (handle) await cleanCreatedLock(path, handle);
      // metadata 注入也可能抛出 EEXIST；完成自身清理后按同一争用路径处理。
      if (!hasCode(error, "EEXIST")) throw error;
      await removeStaleLock(path, options);
      if (Date.now() - started >= timeout) {
        throw new Error(`Timed out acquiring Workspace Hook Trust store lock: ${path}`);
      }
      await delay(CONTENTION_INTERVAL_MS);
    }
  }
}

async function release(path: string, lease: Lease): Promise<void> {
  try {
    await lease.handle.close();
  } catch {
    /* 释放失败不改变操作结果。 */
  }
  const owner = await readOwner(path);
  if (owner?.token !== lease.token) return;
  try {
    await unlink(path);
  } catch {
    /* token 核对与删除并非原子操作。 */
  }
}

export async function withTrustLock<T>(
  path: string,
  options: TrustLockOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const lease = await acquire(path, options);
  try {
    return await operation();
  } finally {
    await release(path, lease);
  }
}
