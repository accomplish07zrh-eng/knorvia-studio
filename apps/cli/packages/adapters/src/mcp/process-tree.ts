// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// MCP stdio 进程树终止：Windows 用 taskkill /T /F，类 Unix 先枚举后代再分级发信号。
//
// 终止顺序与预算：
//   一、先确认根进程还活着；已退出就直接返回，不做枚举与发信号。
//   二、Windows：一次 taskkill（带 /T /F）即可；失败且根进程仍活着才抛错。
//   三、类 Unix：枚举后代（pgrep -P 优先，macOS 上回退 ps），去重后从叶子到根发信号。
//   四、宽限两级：SIGINT（250ms）→ SIGTERM（750ms）；每级结束都重新判断是否已全部退出。
//   五、仍未退出才对残留进程与进程组发 SIGKILL，最后再等 250ms 并核对剩余进程。
//   六、只能忽略「发信号」本身的失败；活性判断与枚举失败按各自语义处理（枚举失败即视为无后代）。
//   七、所有时间预算都是常量：不因环境变化延长，避免清理路径不可预期地变慢。
//
// 实现补充：
//   · 枚举结果去重并过滤非正数，避免把 0/-1 之类的占位值当真 pid；
//   · 信号先发给进程组（-pid），再逐个发给已知后代，覆盖脱离进程组的情况；
//   · 每级宽限结束都重新判断活性：只要全部退出就提前返回，不浪费剩余预算；
//   · SIGKILL 之后仍有存活进程才抛错，错误文本包含剩余 pid 便于排查；
//   · taskkill 失败但根进程已消失时不抛错：目标已达成，按成功处理；
//   · 本模块不读环境变量、不写文件、不打日志：只做进程信号与只读枚举。
//
// 平台差异：Windows 不枚举后代（taskkill /T 由系统递归）；macOS 的 ps 用 -axo、Linux 用 -eo，
// 列名相同所以解析逻辑共用；pgrep 可能因缺 procps 不可用，回退 ps 不是错误路径。

import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";

// ── 形状 ────────────────────────────────────────────────────────────

/** 一次 execFile 的结果：输出两段 + 退出状态 + 可能的错误。 */
type CommandResult = { status: number | null; stdout: string; stderr: string; error?: unknown };

/** execFile 的三个位置参数各自的类型；拼起来就是注入点的签名。 */
type ExecFileArgs = [string, readonly string[], ExecFileOptionsWithStringEncoding];

/**
 * 起子进程的注入点：**保持位置参数（file, args, options）**。
 * 测试会断言注入替身收到的调用形状，改成参数对象属于接口变更，不做。
 */
type ExecFileFn = (...params: ExecFileArgs) => Promise<CommandResult>;

/** 终止器的两个「动作」钩子：起子进程、发信号。 */
type TerminatorActionHooks = { execFile?: ExecFileFn; kill?: typeof process.kill };

/** 终止器的两个「观测」钩子：时钟与休眠。 */
type TerminatorClockHooks = { now?: () => number; sleep?: (ms: number) => Promise<void> };

/** 终止器的可注入依赖：动作组 + 观测组 + 平台覆盖。 */
type TerminatorOptions = TerminatorActionHooks &
  TerminatorClockHooks & { platform?: NodeJS.Platform };

// ── 预算常量 ────────────────────────────────────────────────────────
//
// 全部收在一张表里：这些数字共同定义「清理最多花多久」，
// 分开写就看不出总预算，也容易被逐个调大。
const BUDGET = {
  /** 枚举后代（pgrep / ps）的超时。 */
  enumerationMs: 1000,
  /** Windows taskkill 的超时。 */
  taskkillMs: 2000,
  /** 等待进程退出时的轮询间隔。 */
  pollMs: 25,
  /** SIGKILL 之后最后的核对等待。 */
  finalWaitMs: 250,
} as const;

/**
 * 宽限两级：先 SIGINT 再 SIGTERM，各带自己的等待预算。
 *
 * 顺序不可颠倒 —— 先礼后兵；每级结束都会重新判断是否已全部退出。
 */
const GRACE_LADDER = [
  { signal: "SIGINT", waitMs: 250 },
  { signal: "SIGTERM", waitMs: 750 },
] as const satisfies readonly { signal: NodeJS.Signals; waitMs: number }[];

// ── 基础动作 ────────────────────────────────────────────────────────

/** 从错误对象上取退出码：没有 code 字段按 0 处理，非数字按「未知」处理。 */
function exitStatus(cause: unknown): number | null {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return 0;
  const code = cause.code;
  return typeof code === "number" ? code : null;
}

/** 真实起子进程：把回调形态包成 Promise，不 reject（错误放进结果里）。 */
const spawnFileCommand: ExecFileFn = (file, args, options) =>
  new Promise((resolve) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      resolve({ error, status: exitStatus(error), stderr, stdout });
    });
  });

/** 默认休眠：等指定毫秒。 */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 去重并只保留正 pid。 */
function positiveUnique(pids: readonly number[]): number[] {
  return [...new Set(pids)].filter((pid) => pid > 0);
}

/** 取发信号的实现：注入优先，否则用进程自带的。 */
function killFnOf(options: TerminatorOptions): typeof process.kill {
  return options.kill ?? process.kill;
}

/** 活性判断：kill(pid, 0) 成功即存在；EPERM 表示存在但无权限，同样按存在处理。 */
function isRunning(target: number, options: TerminatorOptions): boolean {
  try {
    killFnOf(options)(target, 0);
    return true;
  } catch (cause) {
    return cause !== null && typeof cause === "object" && "code" in cause && cause.code === "EPERM";
  }
}

/** 发一个信号；只忽略「发送调用本身」的错误，活性判断仍可失败。 */
function signalProcess(target: number, value: NodeJS.Signals, options: TerminatorOptions): void {
  try {
    killFnOf(options)(target, value);
  } catch {
    // 仅忽略发送调用的错误；依赖选择和后续活性判断仍可失败。
  }
}

/** 起一次子命令：位置三元组 + 终止器依赖。 */
function execCommand(...params: [...ExecFileArgs, TerminatorOptions]): Promise<CommandResult> {
  const [file, args, spawnOptions, options] = params;
  const run = options.execFile ?? spawnFileCommand;
  return run(file, args, spawnOptions);
}

/** 把「多行数字输出」解析成正 pid 列表（pgrep 的一列格式）。 */
function parsePidColumn(stdout: string): number[] {
  const tokens = stdout.split(/\s+/u);
  const numbers = tokens.map((token) => Number(token));
  return numbers.filter((value) => Number.isInteger(value) && value > 0);
}

/** 从 `ps -o pid=,ppid=` 的两列输出里挑出指定父进程的直接子进程。 */
function parseChildPids(stdout: string, parent: number): number[] {
  const childPids: number[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const [childText, parentText] = line.trim().split(/\s+/u);
    const child = Number(childText);
    const belongs = Number.isInteger(child) && child > 0 && Number(parentText) === parent;
    if (belongs) childPids.push(child);
  }
  return childPids;
}

// ── 后代枚举 ────────────────────────────────────────────────────────

/** 用 pgrep 直接问「谁是它的子进程」；失败返回 undefined（交给 ps 回退）。 */
async function childrenViaPgrep(
  parent: number,
  options: TerminatorOptions,
): Promise<number[] | undefined> {
  const result = await execCommand(
    "pgrep",
    ["-P", String(parent)],
    { encoding: "utf8", timeout: BUDGET.enumerationMs },
    options,
  );
  const usable = !result.error && result.status === 0 && result.stdout;
  return usable ? parsePidColumn(result.stdout) : undefined;
}

/** 回退路径：列全部进程的 pid/ppid，再按父 pid 过滤。 */
async function childrenViaPs(parent: number, options: TerminatorOptions): Promise<number[]> {
  const platform = options.platform ?? process.platform;
  // macOS 的 ps 用 -axo，Linux 用 -eo；两者列名相同，所以解析逻辑共用。
  const selector = platform === "darwin" ? "-axo" : "-eo";
  const result = await execCommand(
    "ps",
    [selector, "pid=,ppid="],
    { encoding: "utf8", timeout: BUDGET.enumerationMs },
    options,
  );
  const usable = !result.error && result.status === 0 && result.stdout;
  return usable ? parseChildPids(result.stdout, parent) : [];
}

/** 直接子进程：pgrep 优先；不可用时回退 ps。两者都失败即视为没有后代。 */
async function childProcesses(parent: number, options: TerminatorOptions): Promise<number[]> {
  const direct = await childrenViaPgrep(parent, options);
  if (direct !== undefined) return direct;
  return childrenViaPs(parent, options);
}

/** 后代清单：深度优先收集并去重，随后反转成「叶子在前」，先杀子再杀父。 */
async function treeOf(root: number, options: TerminatorOptions): Promise<number[]> {
  const seen = new Set<number>();
  const collected: number[] = [];
  const descend = async (parent: number): Promise<void> => {
    if (seen.has(parent)) return;
    seen.add(parent);
    for (const child of await childProcesses(parent, options)) {
      collected.push(child);
      await descend(child);
    }
  };
  await descend(root);
  return positiveUnique(collected).reverse();
}

// ── 等待与信号 ──────────────────────────────────────────────────────

/** 在预算内轮询，直到给定 pid 全部退出；超时即返回（由调用方决定是否升级）。 */
async function awaitExit(
  pids: readonly number[],
  budgetMs: number,
  options: TerminatorOptions,
): Promise<void> {
  const sleep = options.sleep ?? pause;
  const now = options.now ?? Date.now;
  const startedAt = now();
  while (now() - startedAt < budgetMs) {
    const anyAlive = pids.some((target) => isRunning(target, options));
    if (!anyAlive) return;
    await sleep(BUDGET.pollMs);
  }
}

/** 给进程组与每个已知后代各发一个信号。 */
function signalAll(
  rootPid: number,
  targets: readonly number[],
  signal: NodeJS.Signals,
  options: TerminatorOptions,
): void {
  signalProcess(-rootPid, signal, options);
  for (const target of targets) signalProcess(target, signal, options);
}

/** 是否这批 pid 里还有活着的。 */
function anyRunning(targets: readonly number[], options: TerminatorOptions): boolean {
  return targets.some((target) => isRunning(target, options));
}

// ── Windows 分支 ────────────────────────────────────────────────────

/** Windows：一次 taskkill /T /F；失败且根进程仍活着才抛错。 */
async function terminateOnWindows(pid: number, options: TerminatorOptions): Promise<void> {
  const result = await execCommand(
    "taskkill",
    ["/PID", String(pid), "/T", "/F"],
    { encoding: "utf8", timeout: BUDGET.taskkillMs, windowsHide: true },
    options,
  );
  const failed = Boolean(result.error) || (result.status !== null && result.status !== 0);
  if (!failed) return;
  // taskkill 失败但根进程已消失时不抛错：目标已达成，按成功处理。
  if (!isRunning(pid, options)) return;
  const status = result.status ?? "unknown";
  throw new Error(`taskkill failed for MCP stdio process tree pid=${pid} status=${status}`);
}

// ── 类 Unix 分支 ────────────────────────────────────────────────────

/** 两级宽限：每级发完信号都等一轮，全部退出就提前返回。 */
async function runGraceLadder(
  rootPid: number,
  treeIds: readonly number[],
  options: TerminatorOptions,
): Promise<boolean> {
  for (const stage of GRACE_LADDER) {
    signalAll(rootPid, treeIds, stage.signal, options);
    await awaitExit(treeIds, stage.waitMs, options);
    if (!anyRunning(treeIds, options)) return true;
  }
  return false;
}

/** 硬杀：先按当时的后代重算一次列表（宽限期可能派生新进程），再逐个 SIGKILL。 */
async function runHardKill(
  rootPid: number,
  knownIds: readonly number[],
  options: TerminatorOptions,
): Promise<number[]> {
  // SIGKILL 之前再枚举一次后代：宽限阶段可能有新进程被派生出来。
  const hardPids = positiveUnique([...(await treeOf(rootPid, options)), ...knownIds]);
  for (const target of hardPids) {
    if (isRunning(target, options)) signalProcess(target, "SIGKILL", options);
  }
  signalProcess(-rootPid, "SIGKILL", options);
  await awaitExit(hardPids, BUDGET.finalWaitMs, options);
  // 最终核对只在 hardPids 上做，不含新出现的后代（它们已在 KILL 前处理）。
  return hardPids.filter((target) => isRunning(target, options));
}

/** 类 Unix：枚举 → 两级宽限 → 硬杀 → 核对残留。 */
async function terminateOnPosix(pid: number, options: TerminatorOptions): Promise<void> {
  const treeIds = positiveUnique([...(await treeOf(pid, options)), pid]);
  const exitedDuringGrace = await runGraceLadder(pid, treeIds, options);
  if (exitedDuringGrace) return;

  const leftover = await runHardKill(pid, treeIds, options);
  if (leftover.length === 0) return;
  throw new Error(
    `SIGKILL failed for MCP stdio process tree pid=${pid} remaining=${leftover.join(",")}`,
  );
}

// ── 入口 ────────────────────────────────────────────────────────────

/**
 * 终止一棵 MCP stdio 进程树。
 *
 * 调用方只需传 pid；其余注入点缺省用真实实现（process.kill / execFile / Date.now）。
 * 进程已不存在时立即返回（不抛错），因此清理路径可以放心重复调用。
 *
 * 抛错只有两种情况：taskkill 失败且根进程仍在；SIGKILL 后仍有存活进程。
 * 错误文本包含 pid 与剩余进程列表，便于直接定位到具体服务。
 */
export async function terminateMcpStdioProcessTree(
  pid: number,
  options: TerminatorOptions = {},
): Promise<void> {
  if (!isRunning(pid, options)) return;

  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    await terminateOnWindows(pid, options);
    return;
  }
  await terminateOnPosix(pid, options);
}
