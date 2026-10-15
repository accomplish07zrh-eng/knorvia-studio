// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 信任库文件锁：`wx` 创建即获锁，锁文件里记录 pid/token/启动时间，
// 争用时先尝试回收明显过期的锁，超时后抛错。

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
const PROCESS_BASIS = "process";

/** 锁相关选项：超时、过期阈值、进程探测与元数据写入。 */
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

interface HeldLock {
  handle: FileHandle;
  token: string;
}

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && "code" in cause && cause.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readOwner(lockPath: string): Promise<Owner | null> {
  return readFile(lockPath, "utf8").then(
    (raw) => {
      // 锁文件可能是坏内容：坏 JSON 一律按「无主」处理，交给陈旧回收判定。
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!isRecord(decoded)) return null;
      const { pid, token, startTime, startTimeBasis } = decoded;
      if (typeof pid !== "number" || typeof token !== "string") return null;
      return {
        pid,
        token,
        startTime: typeof startTime === "number" ? startTime : undefined,
        startTimeBasis,
      };
    },
    () => null,
  );
}

/** pid 存活探测：`kill(pid, 0)` 成功即活；EPERM 说明活着但不属于本用户。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return hasCode(cause, "EPERM");
  }
}

/** 探测持有进程的启动时间；探测失败返回 undefined 表示「无法判定，保留锁」。 */
async function observedStartTime(
  holder: Owner,
  settings: TrustLockOptions,
): Promise<number | undefined> {
  try {
    const probe = settings.probeProcessStartTime ?? probeProcessStartTime;
    const observed = await probe(holder.pid);
    return observed === null || !Number.isFinite(observed) ? undefined : observed;
  } catch (cause) {
    // 探测期间的 ENOENT 不能据此回收活 owner；保留锁并继续原争用流程。
    if (hasCode(cause, "ENOENT")) return undefined;
    throw cause;
  }
}

/** 判断过期锁是否可回收：同进程、仍存活且启动时间未变的一律保留。 */
async function holderIsGone(holder: Owner, settings: TrustLockOptions): Promise<boolean> {
  if (holder.pid === process.pid) return false;
  if (!isAlive(holder.pid)) return true;
  // 旧版本的 startTime 可能是系统启动时间；活 PID 必须有明确的新标记才可比较。
  if (holder.startTimeBasis !== PROCESS_BASIS || !Number.isFinite(holder.startTime)) return false;
  const observed = await observedStartTime(holder, settings);
  if (observed === undefined) return false;
  return Math.abs(observed - holder.startTime!) > PROCESS_START_TOLERANCE_MS;
}

async function removeLockFile(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (cause) {
    if (!hasCode(cause, "ENOENT")) throw cause;
  }
}

/** 只有确认「锁够旧 + 持有者确实不在」才删除，避免误抢活锁。 */
async function removeStaleLock(lockPath: string, settings: TrustLockOptions): Promise<void> {
  try {
    const observed = await stat(lockPath);
    if (Date.now() - observed.mtimeMs <= (settings.staleLockMs ?? DEFAULT_STALE_LOCK_MS)) return;
  } catch (cause) {
    if (hasCode(cause, "ENOENT")) return;
    throw cause;
  }
  const holder = await readOwner(lockPath);
  if (holder && !(await holderIsGone(holder, settings))) return;
  await removeLockFile(lockPath);
}

/** 创建者失败清理：先尽力关句柄，再删文件（删除可能撞上替换竞态）。 */
async function cleanCreatedLock(lockPath: string, io: FileHandle): Promise<void> {
  try {
    await io.close();
  } catch {
    /* 尽力关闭，不覆盖 metadata 的首因。 */
  }
  try {
    await unlink(lockPath);
  } catch {
    /* 创建者失败清理可能遇到替换竞态。 */
  }
}

function ownerFileContent(token: string): string {
  const owner = {
    pid: process.pid,
    token,
    startTime: CURRENT_PROCESS_START_TIME,
    startTimeBasis: PROCESS_BASIS,
  };
  return `${JSON.stringify(owner)}\n`;
}

async function acquire(lockPath: string, settings: TrustLockOptions): Promise<HeldLock> {
  const beganAt = Date.now();
  const budget = settings.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  for (;;) {
    let io: FileHandle | undefined;
    try {
      io = await open(lockPath, "wx", LOCK_MODE);
      const token = randomUUID();
      const content = ownerFileContent(token);
      if (settings.writeLockOwnerMetadata) await settings.writeLockOwnerMetadata(io, content);
      else await io.writeFile(content, "utf8");
      return { handle: io, token };
    } catch (cause) {
      if (io) await cleanCreatedLock(lockPath, io);
      // metadata 注入也可能抛出 EEXIST；完成自身清理后按同一争用路径处理。
      if (!hasCode(cause, "EEXIST")) throw cause;
      await removeStaleLock(lockPath, settings);
      if (Date.now() - beganAt >= budget) {
        throw new Error(`Timed out acquiring Workspace Hook Trust store lock: ${lockPath}`);
      }
      await delay(CONTENTION_INTERVAL_MS);
    }
  }
}

async function release(lockPath: string, held: HeldLock): Promise<void> {
  try {
    await held.handle.close();
  } catch {
    /* 释放失败不改变操作结果。 */
  }
  const holder = await readOwner(lockPath);
  if (holder?.token !== held.token) return;
  try {
    await unlink(lockPath);
  } catch {
    /* token 核对与删除并非原子操作。 */
  }
}

export async function withTrustLock<T>(
  lockPath: string,
  settings: TrustLockOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const held = await acquire(lockPath, settings);
  try {
    return await operation();
  } finally {
    await release(lockPath, held);
  }
}
