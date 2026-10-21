// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 信任库文件锁：`wx` 创建即获锁，锁文件里记录 pid/token/启动时间，
// 争用时先尝试回收明显过期的锁，超时后抛错。
//
// 所有对外可见的阈值集中在一张表里：调用方按名字理解「这是个什么量级」，
// 而不必逐个对照常量声明；锁文件本身只承载 pid/token/启动时间三项事实。

import { randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  CURRENT_PROCESS_START_TIME,
  probeProcessStartTime,
} from "./workspace-hook-trust-process.js";
import type { FileWorkspaceHookTrustStoreOptions } from "./workspace-hook-trust-types.js";

/**
 * 锁的全部时间与权限取值。
 *
 * 分档说明：等待预算决定「争用多久后放弃」，过期阈值决定「多旧的锁可以尝试回收」，
 * 轮询间隔只影响争用时的粒度，进程启动时间容差用来判定「同一个 pid 是不是换了进程」。
 */
const LOCK_SETTINGS = {
  mode: 0o600,
  waitBudgetMs: 5000,
  reclaimAfterMs: 30000,
  pollEveryMs: 10,
  startTimeSlackMs: 2000,
} as const;

/** 锁文件里 `startTimeBasis` 的取值：只有带这个标记的启动时间才可比较。 */
const START_TIME_BASIS = "process";

/** 锁相关选项：超时、过期阈值、进程探测与元数据写入。 */
export type TrustLockOptions = Pick<
  FileWorkspaceHookTrustStoreOptions,
  "lockTimeoutMs" | "staleLockMs" | "probeProcessStartTime" | "writeLockOwnerMetadata"
>;

/** 锁文件里记录的持有者事实。 */
interface LockHolder {
  pid: number;
  token: string;
  startTime?: number;
  startTimeBasis: unknown;
}

/** 一次成功获取的锁：关闭句柄即释放排他，token 用于核对「删的是不是自己那把」。 */
interface HeldLock {
  handle: FileHandle;
  token: string;
}

/**
 * 一次锁操作的全部上下文。
 *
 * `lockPath` 与 `settings` 在每一次内部调用里都成对出现 ——
 * 它们共同界定「这次操作针对哪把锁、按什么阈值判定」，所以收成一个值。
 */
interface LockContext {
  lockPath: string;
  settings: TrustLockOptions;
}

/** 底层错误码判定：只看结构化字段，不依赖错误文本。 */
function isErrorCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && "code" in cause && cause.code === code;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** 读锁文件里的持有者；内容损坏一律按「无主」处理，交给过期回收判定。 */
async function readHolder(context: LockContext): Promise<LockHolder | null> {
  let raw: string;
  try {
    raw = await readFile(context.lockPath, "utf8");
  } catch {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(decoded)) return null;
  const candidate = decoded as Partial<LockHolder>;
  if (typeof candidate.pid !== "number" || typeof candidate.token !== "string") return null;
  return {
    pid: candidate.pid,
    token: candidate.token,
    startTime: typeof candidate.startTime === "number" ? candidate.startTime : undefined,
    startTimeBasis: candidate.startTimeBasis,
  };
}

/** pid 存活探测：`kill(pid, 0)` 成功即活；EPERM 说明活着但不属于本用户。 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return isErrorCode(cause, "EPERM");
  }
}

/** 探测持有进程的启动时间；探测失败返回 undefined 表示「无法判定，保留锁」。 */
async function probeHolderStart(
  context: LockContext,
  holder: LockHolder,
): Promise<number | undefined> {
  const probe = context.settings.probeProcessStartTime ?? probeProcessStartTime;
  try {
    const observed = await probe(holder.pid);
    return observed === null || !Number.isFinite(observed) ? undefined : observed;
  } catch (cause) {
    // 探测期间的 ENOENT 不能据此回收活 owner；保留锁并继续原争用流程。
    if (isErrorCode(cause, "ENOENT")) return undefined;
    throw cause;
  }
}

/** 判断过期锁是否可回收：同进程、仍存活且启动时间未变的一律保留。 */
async function holderHasGone(context: LockContext, holder: LockHolder): Promise<boolean> {
  if (holder.pid === process.pid) return false;
  if (!processAlive(holder.pid)) return true;
  // 旧版本的 startTime 可能是系统启动时间；活 PID 必须有明确的新标记才可比较。
  if (holder.startTimeBasis !== START_TIME_BASIS) return false;
  if (!Number.isFinite(holder.startTime)) return false;
  const observed = await probeHolderStart(context, holder);
  if (observed === undefined) return false;
  return Math.abs(observed - holder.startTime!) > LOCK_SETTINGS.startTimeSlackMs;
}

async function dropLockFile(context: LockContext): Promise<void> {
  try {
    await unlink(context.lockPath);
  } catch (cause) {
    if (!isErrorCode(cause, "ENOENT")) throw cause;
  }
}

/** 只有确认「锁够旧 + 持有者确实不在」才删除，避免误抢活锁。 */
async function reclaimIfStale(context: LockContext): Promise<void> {
  try {
    const observed = await stat(context.lockPath);
    const reclaimAfter = context.settings.staleLockMs ?? LOCK_SETTINGS.reclaimAfterMs;
    if (Date.now() - observed.mtimeMs <= reclaimAfter) return;
  } catch (cause) {
    if (isErrorCode(cause, "ENOENT")) return;
    throw cause;
  }
  const holder = await readHolder(context);
  if (holder && !(await holderHasGone(context, holder))) return;
  await dropLockFile(context);
}

/** 创建者失败清理：先尽力关句柄，再删文件（删除可能撞上替换竞态）。 */
async function discardHalfMadeLock(context: LockContext, io: FileHandle): Promise<void> {
  try {
    await io.close();
  } catch {
    /* 尽力关闭，不覆盖 metadata 的首因。 */
  }
  try {
    await unlink(context.lockPath);
  } catch {
    /* 创建者失败清理可能遇到替换竞态。 */
  }
}

/** 写进锁文件的内容：pid、token、本进程启动时间与它的判定基准。 */
function holderFileContent(token: string): string {
  return `${JSON.stringify({
    pid: process.pid,
    token,
    startTime: CURRENT_PROCESS_START_TIME,
    startTimeBasis: START_TIME_BASIS,
  })}\n`;
}

async function acquire(context: LockContext): Promise<HeldLock> {
  const beganAt = Date.now();
  const budget = context.settings.lockTimeoutMs ?? LOCK_SETTINGS.waitBudgetMs;
  for (;;) {
    let io: FileHandle | undefined;
    try {
      io = await open(context.lockPath, "wx", LOCK_SETTINGS.mode);
      const token = randomUUID();
      const content = holderFileContent(token);
      if (context.settings.writeLockOwnerMetadata) {
        await context.settings.writeLockOwnerMetadata(io, content);
      } else {
        await io.writeFile(content, "utf8");
      }
      return { handle: io, token };
    } catch (cause) {
      if (io) await discardHalfMadeLock(context, io);
      // metadata 注入也可能抛出 EEXIST；完成自身清理后按同一争用路径处理。
      if (!isErrorCode(cause, "EEXIST")) throw cause;
      await reclaimIfStale(context);
      if (Date.now() - beganAt >= budget) {
        throw new Error(`Timed out acquiring Workspace Hook Trust store lock: ${context.lockPath}`);
      }
      await delay(LOCK_SETTINGS.pollEveryMs);
    }
  }
}

async function release(context: LockContext, held: HeldLock): Promise<void> {
  try {
    await held.handle.close();
  } catch {
    /* 释放失败不改变操作结果。 */
  }
  const holder = await readHolder(context);
  // token 不符说明锁已被别人重新获取，此时不能删。
  if (holder?.token !== held.token) return;
  try {
    await unlink(context.lockPath);
  } catch {
    /* token 核对与删除并非原子操作。 */
  }
}

export async function withTrustLock<T>(
  lockPath: string,
  settings: TrustLockOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const context: LockContext = { lockPath, settings };
  const held = await acquire(context);
  try {
    return await operation();
  } finally {
    await release(context, held);
  }
}
