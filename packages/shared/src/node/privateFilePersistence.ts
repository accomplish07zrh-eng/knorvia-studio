// SPDX-License-Identifier: Apache-2.0
// 私有文件持久化的三件工具：进程内串行的文件锁包装、原子文本写、损坏文件备份。
//
// 这一层把 atomicFileLock 的跨进程互斥封装成更好用的形状：
//   * withFileLock —— 同一路径在进程内严格排队（FIFO），进入前递归建好父目录；
//   * atomicWritePrivateTextFile —— 先写临时文件再改名覆盖，读者永远看不到半截文件；
//   * backupCorruptFile —— 按内容摘要命名的幂等备份，供解析失败时留证。
import { createHash } from "node:crypto";

import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { basename, dirname, join } from "node:path";

import { setTimeout as sleep } from "node:timers/promises";

import { acquireFileLock } from "./atomicFileLock.js";

const LOCK_BACKOFF_MS = [25, 50, 100, 200, 400] as const;

const LOCK_ABANDON_GRACE_MS = 100;

const LOCK_WAIT_BUDGET_MS = 8000;

const RENAME_BACKOFF_MS = [50, 100, 200, 400, 800] as const;

// 改名在 Windows 上偶发的三个可重试错误码；其余错误一律不吞，原样向上抛。
const RENAME_HICCUPS = new Set(["EPERM", "EBUSY", "EACCES"]);

/** 进程内按路径排队的队尾 promise：保证同一 filePath 的临界区不重叠。 */
const admissionTails = new Map<string, Promise<void>>();

export interface SharedFileLockOptions {
  lockRetryDelaysMs?: /* 逐次退避的间隔表 */ readonly number[];
  lockOwnerlessGraceMs?: /* 无主锁的最短停留期，毫秒 */ number;
  lockMaxWaitMs?: /* 抢一把锁的总预算，毫秒 */ number;
}

// 从任意抛出物里取 POSIX 错误码：不是对象、没有 code、code 不是字符串，都当「读不出来」。
const ioCode = (fault: unknown): string | undefined => {
  if (typeof fault !== "object" || fault === null || !("code" in fault)) return undefined;
  const raw = fault.code;
  return typeof raw === "string" ? raw : undefined;
};

// 判断一次改名失败值不值得再试：只有那三个「系统还没让开」的码才退避重来。
const worthRenamingAgain = (fault: unknown): boolean => {
  const code = ioCode(fault);
  return code !== undefined && RENAME_HICCUPS.has(code);
};

// 在 `<path>` 的文件锁内运行 task 并交回其结果。同一路径的并发调用在进程内按 FIFO 严格串行；
// task 抛错原样向外传，锁在任何一条退出路径上都会释放，队列也一定归还。
export const withFileLock = async <T>(
  path: string,
  task: () => Promise<T>,
  overrides: SharedFileLockOptions = {},
): Promise<T> => {
  const prior = admissionTails.get(path) ?? Promise.resolve();
  let releaseTurn!: () => void;
  const mine = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  admissionTails.set(path, mine);

  await prior;

  let unlock: (() => Promise<void>) | undefined;
  try {
    await mkdir(dirname(path), { recursive: true });
    unlock = await acquireFileLock(
      path,
      overrides.lockRetryDelaysMs ?? LOCK_BACKOFF_MS,
      overrides.lockOwnerlessGraceMs ?? LOCK_ABANDON_GRACE_MS,
      overrides.lockMaxWaitMs ?? LOCK_WAIT_BUDGET_MS,
    );
    return await task();
  } finally {
    try {
      await unlock?.();
    } finally {
      releaseTurn();
      if (admissionTails.get(path) === mine) admissionTails.delete(path);
    }
  }
};

/** 临时文件名带 pid/时间/随机，避免并发写者互相踩踏；POSIX 上新文件权限位 0600。 */
const stageTempName = async (container: string, fileName: string): Promise<string> => {
  const unique = [process.pid, Date.now(), Math.random().toString(16).slice(2)].join(".");
  return join(container, "." + fileName + "." + unique + ".tmp");
};

// 把 payload 逐字节原子写到 target（换行不做转换）：先落临时文件，再改名顶上去；
// 中途任何一步失败都会把临时文件清掉，读者看不到半截内容。
export const atomicWritePrivateTextFile = async (
  target: string,
  payload: string,
  renameBudget: readonly number[] = RENAME_BACKOFF_MS,
): Promise<void> => {
  const parentDir = dirname(target);
  const staging = await stageTempName(parentDir, basename(target));
  await mkdir(parentDir, { recursive: true });

  try {
    await writeFile(staging, payload, { encoding: "utf-8", mode: 0o600 });
    await moveIntoPlaceWithBudget(staging, target, renameBudget);
  } catch (fault) {
    await rm(staging, { force: true }).catch(() => {});
    throw fault;
  }
};

// 改名重试预算来自调用方数组；预算用尽或错误不在可重试集合里，就直接把最后一次错误抛出。
const moveIntoPlaceWithBudget = async (
  staging: string,
  finalPath: string,
  budget: readonly number[],
): Promise<void> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(staging, finalPath);
      break;
    } catch (fault) {
      const pause = budget[attempt];
      if (pause === undefined || !worthRenamingAgain(fault)) throw fault;
      await sleep(pause);
    }
  }
};

// 把 target 的内容按 `<原名>.corrupt-<sha256 前 24 hex>.bak` 备份一份并返回备份路径。
// 备份用独占创建，同名备份已存在时视为成功（幂等）；POSIX 上补设 0600。
export const backupCorruptFile = async (target: string): Promise<string> => {
  const payload = await readFile(target);
  const fingerprint = createHash("sha256").update(payload).digest("hex").slice(0, 24);
  const archived = target + ".corrupt-" + fingerprint + ".bak";

  try {
    await writeFile(archived, payload, { flag: "wx", mode: 0o600 });
  } catch (fault) {
    if (ioCode(fault) !== "EEXIST") throw fault;
  }

  await chmod(archived, 0o600);
  return archived;
};
