// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// shell 初始化快照：把登录 shell 的函数/别名/选项导出成一份脚本，落盘后复用，
// 避免每次执行都重新拉起 `-l -c`。
//
// 几条边界：
// 一、**同 key 只生成一次**：cache 里存的是 Promise，并发调用共享同一次生成；
// 二、**失败即无快照**：生成失败不抛错，返回 undefined 让调用方走非快照路径；
// 三、**清理两级**：实例级（cleanup 删自己生成的）与批量级（cleanupStale 按保留期扫目录）；
// 四、**ENOENT 不算错**：删除时文件已消失视为成功，其它 errno 才计 errors。

import { createHash } from "node:crypto";
import {
  execFile as execFileCallback,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionShellDialect } from "@knorvia/contracts";
import type { StartupShellDialect } from "./bash-startup-script.js";

/** execFile 的三元入参与输出形态（下面用别名收敛长签名）。 */
type ExecCall = [file: string, args: string[], options: ExecFileOptionsWithStringEncoding];

/** execFile 的输出：两个字符串缓冲。 */
type ExecOutput = Promise<{ stdout: string; stderr: string }>;

/** 注入式执行器（测试可替换）。 */
type SnapshotExecFile = (...call: ExecCall) => ExecOutput;

/** 受支持的方言子集。 */
type SnapshotDialect = Extract<ExecutionShellDialect, "posix" | "git-bash">;

/** 快照句柄：落盘路径与对应的 shell。 */
type Snapshot = { path: string; shellPath: string };

/** 清理统计：删除数与错误数分开计。 */
type CleanupTally = { deleted: number; errors: number };

/** 快照输入的必填两项：落盘根目录与目标 shell。 */
type SnapshotTarget = { rootDir: string; shellPath: string };

/** 快照输入的环境与方言。 */
type SnapshotContext = { env: NodeJS.ProcessEnv; shellDialect: StartupShellDialect };

/** 生成一次快照所需的全部输入。 */
type SnapshotAsk = SnapshotTarget & SnapshotContext;

/** 批量清理的输入：根目录、保留天数、当前时刻。 */
type CleanupAsk = { now?: Date; retentionDays?: number; rootDir: string };

/** 管理器构造项。 */
type ManagerOptions = { execFile?: SnapshotExecFile };

/** 快照相关的三个默认值：超时、单次输出上限、保留天数。 */
const SNAPSHOT_DEFAULTS = { timeoutMs: 10_000, maxBytes: 1024 * 1024, retentionDays: 30 } as const;

const SNAPSHOT_TIMEOUT_MS = SNAPSHOT_DEFAULTS.timeoutMs;
const SNAPSHOT_MAX_BYTES = SNAPSHOT_DEFAULTS.maxBytes;
const DEFAULT_RETENTION_DAYS = SNAPSHOT_DEFAULTS.retentionDays;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

const defaultExecFile = promisify(execFileCallback) as unknown as SnapshotExecFile;

/**
 * 导出当前 shell 状态的脚本片段。
 *
 * 每行都是「失败也不影响后续」的形式（`|| true`），因为某些 shell 不支持某个内建。
 * 最后一行用 `%q` 导出 PATH，让特殊字符在 `source` 后仍能还原。
 */
/**
 * 导出当前 shell 状态的四段探针。
 *
 * 每段都带 `|| true`：某些 shell 不支持某个内建（例如没有 `alias`），
 * 让它失败会中断整条 `-c` 命令，导致快照全空。
 * 最后一段用 `%q` 导出 PATH，特殊字符在 `source` 后仍能还原。
 */
const SNAPSHOT_PROBES = [
  "typeset -f 2>/dev/null || declare -f 2>/dev/null || true",
  "alias 2>/dev/null || true",
  "set +o 2>/dev/null || true",
  `printf '\\nexport PATH=%q\\n' "$PATH"`,
] as const;

function snapshotScript(): string {
  return SNAPSHOT_PROBES.join("; ");
}

/**
 * 跑登录 shell 的 execFile 选项。
 *
 * 五个固定项里只有 env 随请求变化，其余是模块常量 —— 收成一个函数，
 * 避免「某处漏传 maxBuffer 导致大输出被截断」这类漏项。
 */
function runOptions(env: NodeJS.ProcessEnv): ExecFileOptionsWithStringEncoding {
  const options = {} as ExecFileOptionsWithStringEncoding;
  options.encoding = "utf8";
  options.maxBuffer = SNAPSHOT_MAX_BYTES;
  options.timeout = SNAPSHOT_TIMEOUT_MS;
  options.windowsHide = true;
  // env 单独赋值：只有它随请求变化，其余是模块常量。
  options.env = env;
  return options;
}

/** 快照目录：固定落在 <root>/shell-init 下。 */
function snapshotDir(rootDir: string): string {
  return path.join(rootDir, "shell-init");
}

/**
 * 文件是否仍可用作快照：能访问 + 是普通文件。
 *
 * 先 `access` 再 `stat` 是有意的：`access` 走权限检查，
 * 能在「存在但不可读」时提前失败，而不是等到真正 `source` 时才发现。
 */
async function isUsableSnapshotFile(target: string): Promise<boolean> {
  try {
    await access(target);
    const details = await stat(target);
    return details.isFile();
  } catch {
    return false;
  }
}

/** 判断一个 errno 是否算「文件已不在」（不算失败）。 */
function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * 尝试一次可能失败的动作：失败统一折成 undefined。
 *
 * 快照整条链路都是「拿不到就退回非快照路径」，所以这里把「吞掉异常」收成一个明确的
 * 语义（而不是每个调用点各写一个空 catch）。
 */
async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch {
    return undefined;
  }
}

/** 统计一次删除的结果：ENOENT 静默，其它错误计入 errors。 */
function tallyRemoval(tally: CleanupTally, error: unknown): void {
  if (!isMissingFile(error)) tally.errors += 1;
}

/**
 * 删一个文件并记账：成功 +1 deleted；ENOENT 视为已达成目标（静默）；
 * 其它错误计入 errors 并继续（单个失败不中断批量清理）。
 */
async function removeTracked(tally: CleanupTally, target: string): Promise<void> {
  try {
    await unlink(target);
    tally.deleted += 1;
  } catch (error) {
    tallyRemoval(tally, error);
  }
}

export class ShellInitSnapshotManager {
  readonly #cache = new Map<string, Promise<Snapshot | undefined>>();
  readonly #generated = new Set<string>();
  readonly #execFile: SnapshotExecFile;

  constructor(options: ManagerOptions = {}) {
    this.#execFile = options.execFile ?? defaultExecFile;
  }

  /** 缓存键：三个维度都要区分，用 NUL 分隔避免拼接歧义。 */
  #cacheKey(ask: SnapshotAsk): string {
    return [ask.rootDir, ask.shellDialect, ask.shellPath].join("\0");
  }

  /** 取或建：并发调用共享同一次生成。 */
  getOrCreate(request: SnapshotAsk): Promise<Snapshot | undefined> {
    if (!supportsShellInitSnapshot(request.shellDialect)) return Promise.resolve(undefined);

    const key = this.#cacheKey(request);
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;

    const pending = this.#create(request);
    this.#cache.set(key, pending);
    return pending;
  }

  /** 删掉本实例生成的全部快照。 */
  async cleanup(): Promise<CleanupTally> {
    const tally: CleanupTally = { deleted: 0, errors: 0 };
    for (const target of this.#generated) await removeTracked(tally, target);
    this.#generated.clear();
    return tally;
  }

  /** 生成快照：失败返回 undefined，不抛错。 */
  async #create(request: SnapshotAsk): Promise<Snapshot | undefined> {
    const target = await this.#produce(request);
    if (target !== undefined) this.#generated.add(target);
    return target === undefined ? undefined : { path: target, shellPath: target };
  }

  /** 跑一次登录 shell 并把输出落盘；返回落盘路径。 */
  async #produce(request: SnapshotAsk): Promise<string | undefined> {
    const stdout = await attempt(() =>
      this.#execFile(request.shellPath, ["-l", "-c", snapshotScript()], runOptions(request.env)),
    ).then((result) => result?.stdout);
    if (stdout === undefined || stdout.trim() === "") return undefined;

    return attempt(async () => {
      const directory = snapshotDir(request.rootDir);
      const target = path.join(directory, `${this.#digest(request)}.sh`);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(target, stdout, { encoding: "utf8", mode: 0o600 });
      return target;
    });
  }

  /** 快照文件名：方言与 shell 路径的摘要（换 shell 即换文件）。 */
  #digest(request: SnapshotAsk): string {
    const hash = createHash("sha256");
    hash.update(request.shellDialect);
    hash.update("\0");
    hash.update(request.shellPath);
    return hash.digest("hex");
  }
}

/**
 * 批量清理：按保留期扫描目录，删除过期快照。
 *
 * 三段各自容错，互不影响：
 *   1. 读目录失败（除 ENOENT）计一次错误，直接返回；
 *   2. 单个 stat 失败只跳过该项；
 *   3. 单个删除失败只计错误，继续处理其余项。
 */
export async function cleanupStaleShellInitSnapshots(options: CleanupAsk): Promise<CleanupTally> {
  const tally: CleanupTally = { deleted: 0, errors: 0 };
  const directory = snapshotDir(options.rootDir);
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = (options.now ?? new Date()).getTime() - retentionDays * MS_PER_DAY;

  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".sh"));
  } catch (error) {
    tallyRemoval(tally, error);
    return tally;
  }

  for (const name of names) {
    const target = path.join(directory, name);
    let modifiedMs: number;
    try {
      modifiedMs = (await stat(target)).mtimeMs;
    } catch {
      continue;
    }
    if (modifiedMs >= cutoff) continue;
    await removeTracked(tally, target);
  }
  return tally;
}

/** 该方言是否支持快照（类型守卫）。 */
export function supportsShellInitSnapshot(
  shellDialect: StartupShellDialect | undefined,
): shellDialect is SnapshotDialect {
  if (shellDialect === "posix") return true;
  return shellDialect === "git-bash";
}

/**
 * 执行前复核：文件仍可访问且是普通文件才算有效。
 *
 * 先 `access` 再 `stat` 是有意的：`access` 会走权限检查，能在「存在但不可读」时提前失败，
 * 而不是等到真正 `source` 时才发现。
 */
export async function revalidateShellInitSnapshotForExecution(
  result: Snapshot | undefined,
): Promise<Snapshot | undefined> {
  if (result === undefined) return undefined;
  const stillUsable = await isUsableSnapshotFile(result.path);
  return stillUsable ? result : undefined;
}
