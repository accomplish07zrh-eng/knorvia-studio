// SPDX-License-Identifier: Apache-2.0
// 跨进程文件锁：以「锁目录 + owner 元数据文件」表达互斥，供本包的私有文件持久化复用。
//
// 设计要点：
//   * 锁实体是 `<filePath>.lock` 目录，内含唯一 `owner-<token>.json`（一行 JSON + 尾随换行）。
//   * 抢锁 = mkdir 锁目录（原子）→ 写自己的 owner 文件 → 复核「目录实例没被换、owner 只有我一个」。
//   * 等待期间按调用方给的退避序列重试；遇到「无主/持有者已死」的遗弃锁则尝试回收。
//   * 超时抛出的错误带 KNORVIA_FILE_LOCK_TIMEOUT 码与最后一次失败原因，便于调用方诊断。
import { KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE } from "../errors.js";

import { mkdir, readFile, readdir, rmdir, rm, stat, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { createLockInstanceObserver, type ObserveLockInstance } from "./lockInstanceObserver.js";

/** owner 元数据里的时间戳最多允许比观测时刻超前这么多；超前即视为不可信。 */
const MAX_METADATA_LEEWAY_MS = 5 * 60000;

// 回收结果只有两种定值形态，调用点只读 `.cleared`、从不改写它，所以两个常量可以共用实例。
const LOCK_STILL_HELD = { cleared: false } as const;
const LOCK_TAKEN_DOWN = { cleared: true } as const;

// 「系统没让开」的两个码：EACCES 是明说没权限，EPERM 是属主之外一律拒绝，两者都值得再等等。
const ACCESS_REFUSALS = new Set(["EACCES", "EPERM"]);

// owner 条目的命名约定：前缀 + 令牌 + 后缀，锁目录里出现的其它名字一律不算持有者。
const OWNER_PREFIX = "owner-";
const OWNER_SUFFIX = ".json";

interface OwnerRecord {
  /** 被承认的建锁时刻；读不出时为 null，交由调用点回退到文件 mtime / 首观测时刻。 */
  bornAt: number | null;
  /** 被承认的持有进程号；缺失或非法为 null，按「无主」处理。 */
  holder: number | null;
}

/** 一次回收尝试的结果：是否真的删掉了遗弃锁，以及（可选）遇到的清理错误。 */
interface ReclaimOutcome {
  cleared: boolean;
  trouble?: unknown;
}

// 从任意抛出物里取 POSIX 错误码：不是对象、没有 code、code 不是字符串，都当「读不出来」。
const systemCode = (fault: unknown): string | undefined => {
  if (fault === null || typeof fault !== "object" || !("code" in fault)) return undefined;
  const raw = fault.code;
  return typeof raw === "string" ? raw : undefined;
};

/** 只承认有限、非负、且不超前观测时刻太多的时间戳；其余按读不出处理。 */
const trustedClock = (value: unknown, ceiling: number): number | null => {
  if (typeof value !== "number") return null;
  const finite = Number.isFinite(value);
  const inRange = value >= 0 && value <= ceiling;
  return finite && inRange ? value : null;
};

// owner 元数据读不出来时整条按「无主 + 无时间戳」处理，绝不抛错打断抢锁流程；
// 能读出来就分别验进程号与建锁时刻，两个字段各自独立降级。
const decodeOwnerRecord = (rawText: string, ceiling: number): OwnerRecord => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return { bornAt: null, holder: null };
  }

  const declaredPid = parsed.pid;
  const holder =
    typeof declaredPid === "number" && Number.isSafeInteger(declaredPid) && declaredPid > 0
      ? declaredPid
      : null;
  const bornAt = trustedClock(parsed.createdAt, ceiling);
  return { bornAt, holder };
};

// ESRCH = 进程确实不在了；EPERM 之类的其它错误说明它可能还活着（只是我们没权限发信号），
// 这种情况下按存活处理，宁可多等也不要去抢一把还热着的锁。
const processResponds = (processId: number): boolean => {
  try {
    process.kill(processId, 0);
  } catch (fault) {
    return systemCode(fault) !== "ESRCH";
  }
  return true;
};

// owner 文件名形如 `owner-<token>.json`；前缀后缀都对上才算名单里的持有者条目。
const looksLikeOwnerFile = (entry: string): boolean => {
  const named = entry.startsWith(OWNER_PREFIX) && entry.endsWith(OWNER_SUFFIX);
  return named;
};

/** 单个 owner 是否可回收：持有进程已死，或（无进程号时）无主状态持续超过生效 grace。 */
const ownerRecyclable = async (
  ownerPath: string,
  staleGraceMs: number,
  watchInstance: ObserveLockInstance,
): Promise<boolean> => {
  const seenAt = Date.now();
  const record = decodeOwnerRecord(await readFile(ownerPath, "utf-8"), seenAt);

  let bornAt = record.bornAt;
  if (bornAt === null) {
    const ownerStat = await stat(ownerPath);
    bornAt = trustedClock(ownerStat.mtimeMs, seenAt) ?? watchInstance(ownerPath, ownerStat, seenAt);
  }

  const holderGone = record.holder !== null && !processResponds(record.holder);
  const ownerlessExpired = record.holder === null && seenAt - bornAt >= staleGraceMs;
  return holderGone || ownerlessExpired;
};

// 名单里每一个 owner 都要单独看：只要有一个还回收不掉，整把锁就一动不动。
// 逐个串行判定，避免为了图快并发去读同一批元数据。
const everyOwnerRecyclable = async (
  lockPath: string,
  owners: readonly string[],
  staleGraceMs: number,
  watchInstance: ObserveLockInstance,
): Promise<boolean> => {
  for (const owner of owners) {
    const target = join(lockPath, owner);
    if (!(await ownerRecyclable(target, staleGraceMs, watchInstance))) return false;
  }
  return true;
};

/**
 * 尝试清除一把抢占失败后发现的遗弃锁。目录形态要区分「单 owner」与「多 owner/无 owner」：
 * 前者只需该 owner 可回收；后者要求目录本身过期且每个 owner 都可回收。文件形态在删除前
 * 复读内容，内容变了就放弃（防止与新持有者竞争）。
 */
const reclaimAbandonedLock = async (
  lockPath: string,
  staleGraceMs: number,
  watchInstance: ObserveLockInstance,
): Promise<ReclaimOutcome> => {
  try {
    const lockStat = await stat(lockPath);

    if (lockStat.isDirectory()) {
      const present = await readdir(lockPath);
      const owners = present.filter(looksLikeOwnerFile);

      if (owners.length === 1) {
        const sole = join(lockPath, owners[0]!);
        const collectable = await ownerRecyclable(sole, staleGraceMs, watchInstance);
        if (!collectable) return LOCK_STILL_HELD;
        await rm(sole, { force: true });
        await rmdir(lockPath);
        return LOCK_TAKEN_DOWN;
      }

      const seenAt = Date.now();
      const bornAt =
        trustedClock(lockStat.mtimeMs, seenAt) ?? watchInstance(lockPath, lockStat, seenAt);
      if (seenAt - bornAt < staleGraceMs) return LOCK_STILL_HELD;

      const allRecyclable = await everyOwnerRecyclable(
        lockPath,
        owners,
        staleGraceMs,
        watchInstance,
      );
      if (!allRecyclable) return LOCK_STILL_HELD;
      await Promise.all(present.map((entry) => rm(join(lockPath, entry), { force: true })));
      await rmdir(lockPath);
      return LOCK_TAKEN_DOWN;
    }

    const snapshot = await readFile(lockPath, "utf-8");
    const collectable = await ownerRecyclable(lockPath, staleGraceMs, watchInstance);
    if (!collectable) return LOCK_STILL_HELD;
    const reread = await readFile(lockPath, "utf-8");
    if (reread !== snapshot) return LOCK_STILL_HELD;
    await rm(lockPath, { force: true });
    return LOCK_TAKEN_DOWN;
  } catch (fault) {
    const code = systemCode(fault);
    // 竞争下的「已经没了 / 目录非空」不是错误，只是这次没回收成。
    if (code === "ENOENT" || code === "ENOTEMPTY") return LOCK_STILL_HELD;
    return { cleared: false, trouble: fault };
  }
};

const lockTimeout = (
  guardedPath: string,
  lockPath: string,
  waitedMs: number,
  reason: unknown,
): NodeJS.ErrnoException & { cause: unknown } => {
  const failure = new Error(
    `Timed out after ${waitedMs}ms waiting for the Knorvia Studio file lock: ${lockPath}`,
  ) as NodeJS.ErrnoException & { cause: unknown };
  failure.code = KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
  failure.path = guardedPath;
  failure.syscall = "mkdir";
  failure.cause = reason;
  return failure;
};

const isAccessRefusal = (fault: unknown): boolean => {
  const code = systemCode(fault);
  return code !== undefined && ACCESS_REFUSALS.has(code);
};

// 清理动作允许失败：owner 文件与锁目录都可能已经被回收方先一步删掉，删不掉就算了。
const ignoreCleanupFault = async (job: () => Promise<void>): Promise<void> => {
  try {
    await job();
  } catch {
    /* 已经不在了就算了 */
  }
};

const dropOwnLock = async (lockPath: string, ownerPath: string): Promise<void> => {
  await ignoreCleanupFault(() => rm(ownerPath, { force: true }));
  await ignoreCleanupFault(() => rmdir(lockPath));
};

// 抢占 `<filePath>.lock`，成功返回释放函数。同一路径的并发抢锁按 retryDelaysMs 退避重试，
// 直到拿到锁或超过 maxWaitMs（后者抛 KNORVIA_FILE_LOCK_TIMEOUT）。本函数不创建父目录——
// 父目录由调用方（或本包 withFileLock）准备。
export const acquireFileLock = async (
  filePath: string,
  retryDelaysMs: readonly number[],
  ownerlessGraceMs: number,
  maxWaitMs: number,
): Promise<() => Promise<void>> => {
  const lockPath = filePath + ".lock";
  const serial = process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const ownerName = OWNER_PREFIX + serial + OWNER_SUFFIX;
  const ownerPath = join(lockPath, ownerName);
  const recordText =
    JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: serial }) + "\n";

  const beganAt = Date.now();
  // 无主 grace 的实际生效值被钳到不超过总等待时长的一半，且不为负。
  const staleGraceMs = Math.min(
    Math.max(ownerlessGraceMs, 0),
    Math.max(Math.floor(maxWaitMs / 2), 0),
  );
  const watchInstance = createLockInstanceObserver();

  let lastCleanFault: unknown;
  let lastAttemptFault: unknown;

  for (let round = 0; ; round += 1) {
    let madeLock = false;
    try {
      await mkdir(lockPath);
      madeLock = true;
      const bornStat = await stat(lockPath);
      await writeFile(ownerPath, recordText, { encoding: "utf-8", flag: "wx" });
      const nowStat = await stat(lockPath);
      const holders = (await readdir(lockPath)).filter(looksLikeOwnerFile);
      const sameInstance = nowStat.dev === bornStat.dev && nowStat.ino === bornStat.ino;
      const onlyMyEntry = holders.length === 1 && holders[0] === ownerName;
      if (!sameInstance || !onlyMyEntry) {
        // 建锁后实例或 owner 列表被并发改动：按「没抢到」处理，交回等待重试。
        throw Object.assign(
          new Error("Knorvia Studio file lock ownership changed during acquire"),
          {
            code: "EEXIST",
          },
        );
      }
      return async () => {
        await dropOwnLock(lockPath, ownerPath);
      };
    } catch (fault) {
      if (madeLock) await dropOwnLock(lockPath, ownerPath);
      const code = systemCode(fault);
      const vanishedOwnLock = madeLock && code === "ENOENT";
      if (code !== "EEXIST" && !vanishedOwnLock) throw fault;
      lastAttemptFault = fault;
    }

    const elapsed = Date.now() - beganAt;
    const timedOut = elapsed >= maxWaitMs;
    if (timedOut) {
      if (isAccessRefusal(lastCleanFault)) throw lastCleanFault;
      throw lockTimeout(filePath, lockPath, elapsed, lastAttemptFault);
    }

    const reclaim = await reclaimAbandonedLock(lockPath, staleGraceMs, watchInstance);
    if (reclaim.cleared) continue;
    if (reclaim.trouble) lastCleanFault = reclaim.trouble;

    const budgetLeft = Math.max(maxWaitMs - elapsed, 0);
    const canRetry = retryDelaysMs.length > 0 && budgetLeft > 0;
    if (!canRetry) {
      if (isAccessRefusal(lastCleanFault)) throw lastCleanFault;
      throw lockTimeout(filePath, lockPath, elapsed, lastCleanFault ?? lastAttemptFault);
    }

    const pauseFor = retryDelaysMs[Math.min(round, retryDelaysMs.length - 1)] ?? budgetLeft;
    await sleep(Math.min(pauseFor, budgetLeft));
  }
};
