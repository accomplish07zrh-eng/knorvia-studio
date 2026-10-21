// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// MCP stdio 进程树终止：Windows 用 taskkill /T /F，类 Unix 先枚举后代再分级发信号。
// 终止顺序与预算：
// 一、先确认根进程还活着；已退出就直接返回，不做枚举与发信号。
// 二、Windows：一次 taskkill（带 /T /F）即可；失败且根进程仍活着才抛错。
// 三、类 Unix：枚举后代（pgrep -P 优先，macOS 上回退 ps），去重后从叶子到根发信号。
// 四、宽限两级：SIGINT（250ms）→ SIGTERM（750ms）；每级结束都重新判断是否已全部退出。
// 五、仍未退出才对残留进程与进程组发 SIGKILL，最后再等 250ms 并核对剩余进程。
// 六、只能忽略「发信号」本身的失败；活性判断与枚举失败按各自语义处理（枚举失败即视为无后代）。
// 七、所有时间预算都是常量：不因环境变化延长，避免清理路径不可预期地变慢。

import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";

// 进程树终止的内部形状与预算常量（原独立形状模块并回本文件：边界契约只允许既有的依赖面）。

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

// 预算常量：枚举 1s、taskkill 2s、轮询 25ms、SIGKILL 后核对 250ms；
// 两级宽限 SIGINT 250ms → SIGTERM 750ms，顺序不可颠倒。
const ENUMERATION_TIMEOUT_MS = 1000;
const TASKKILL_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 25;
const FINAL_WAIT_MS = 250;
const GRACE_STAGES = [
  ["SIGINT", 250],
  ["SIGTERM", 750],
] as const;

function exitStatus(cause: unknown): number | null {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return 0;
  const code = cause.code;
  return typeof code === "number" ? code : null;
}

const spawnFileCommand: ExecFileFn = (file, args, options) =>
  new Promise((resolve) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      resolve({ error, status: exitStatus(error), stderr, stdout });
    });
  });

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** 直接子进程：pgrep -P 优先；不可用时回退 ps 并解析 pid/ppid 两列。 */
async function childProcesses(parent: number, options: TerminatorOptions): Promise<number[]> {
  const directResult = await execCommand(
    "pgrep",
    ["-P", String(parent)],
    {
      encoding: "utf8",
      timeout: ENUMERATION_TIMEOUT_MS,
    },
    options,
  );
  if (!directResult.error && directResult.status === 0 && directResult.stdout) {
    return directResult.stdout
      .split(/\s+/)
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0);
  }
  const platform = options.platform ?? process.platform;
  const listingResult = await execCommand(
    "ps",
    [platform === "darwin" ? "-axo" : "-eo", "pid=,ppid="],
    { encoding: "utf8", timeout: ENUMERATION_TIMEOUT_MS },
    options,
  );
  if (listingResult.error || listingResult.status !== 0 || !listingResult.stdout) return [];
  const childPids: number[] = [];
  for (const line of listingResult.stdout.split(/\r?\n/)) {
    const [childText, parentText] = line.trim().split(/\s+/);
    const child = Number(childText);
    if (Number.isInteger(child) && child > 0 && Number(parentText) === parent)
      childPids.push(child);
  }
  return childPids;
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

async function awaitExit(
  pids: readonly number[],
  budgetMs: number,
  options: TerminatorOptions,
): Promise<void> {
  const sleep = options.sleep ?? pause;
  const now = options.now ?? Date.now;
  const startedAt = now();
  while (now() - startedAt < budgetMs) {
    if (!pids.some((target) => isRunning(target, options))) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

// 实现补充说明：
// 一、pgrep 不可用（未安装或权限不足）时回退 ps；两者都失败则视为没有后代。
// 二、枚举结果会去重并过滤非正数，避免把 0/-1 之类的占位值当真 pid。
// 三、信号先发给进程组（-pid），再逐个发给已知后代，覆盖脱离进程组的情况。
// 四、每级宽限结束都重新判断活性：只要全部退出就提前返回，不浪费剩余预算。
// 五、SIGKILL 之后仍有存活进程才抛错，错误文本包含剩余 pid 便于排查。
// 六、taskkill 失败但根进程已消失时不抛错：目标已达成，按成功处理。
// 七、枚举超时（1s）与 taskkill 超时（2s）都是常量，避免清理路径被无限拖长。
// 八、本模块不读环境变量、不写文件：只做进程信号与只读枚举。
// 使用与测试说明：
// 一、调用方只需传 pid；其余注入点缺省用真实实现（process.kill / execFile / Date.now）。
// 二、测试可注入 kill 与 execFile，断言「先 SIGINT 再 SIGTERM 再 SIGKILL」的顺序与预算。
// 三、方法在进程已不存在时立即返回（不抛错），因此清理路径可以放心重复调用。
// 四、抛错只有两种情况：taskkill 失败且根进程仍在；SIGKILL 后仍有存活进程。
// 五、错误文本包含 pid 与剩余进程列表，便于直接定位到具体服务。
// 六、进程组信号（-pid）用于覆盖未纳入枚举的孤儿子进程。
// 七、本模块不做重试：清理失败由调用方决定是否升级处理。
export async function terminateMcpStdioProcessTree(
  pid: number,
  options: TerminatorOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (!isRunning(pid, options)) return;

  if (platform === "win32") {
    const killResult = await execCommand(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      {
        encoding: "utf8",
        timeout: TASKKILL_TIMEOUT_MS,
        windowsHide: true,
      },
      options,
    );
    const failed =
      Boolean(killResult.error) || (killResult.status !== null && killResult.status !== 0);
    if (failed && isRunning(pid, options)) {
      throw new Error(
        `taskkill failed for MCP stdio process tree pid=${pid} status=${killResult.status ?? "unknown"}`,
      );
    }
    return;
  }

  const treeIds = positiveUnique([...(await treeOf(pid, options)), pid]);
  for (const [graceSignal, budgetMs] of GRACE_STAGES) {
    signalProcess(-pid, graceSignal, options);
    for (const target of treeIds) signalProcess(target, graceSignal, options);
    await awaitExit(treeIds, budgetMs, options);
    if (!treeIds.some((target) => isRunning(target, options))) return;
  }

  const hardPids = positiveUnique([...(await treeOf(pid, options)), ...treeIds]);
  for (const target of hardPids) {
    if (isRunning(target, options)) signalProcess(target, "SIGKILL", options);
  }
  signalProcess(-pid, "SIGKILL", options);
  await awaitExit(hardPids, FINAL_WAIT_MS, options);
  const leftover = hardPids.filter((target) => isRunning(target, options));
  if (leftover.length > 0) {
    throw new Error(
      `SIGKILL failed for MCP stdio process tree pid=${pid} remaining=${leftover.join(",")}`,
    );
  }
}
// 平台与边界细节（排障必读）：
// 一、Windows 不枚举后代：taskkill /T 由系统递归处理，失败时才依次核对根进程活性。
// 二、macOS 的 ps 用 -axo，Linux 用 -eo：两者列名相同（pid=,ppid=），解析逻辑共用。
// 三、pgrep 可能因为缺少 procps 而不可用：此时回退 ps，不是错误路径。
// 四、derived 的 pid 列表经过 reverse：先杀叶子再杀父，避免父死子活产生孤儿。
// 五、进程组信号 -pid 只在类 Unix 使用；Windows 分支不涉及进程组概念。
// 六、活性判断把 EPERM 视为「存在」：无权限不代表进程已退出。
// 七、每级宽限结束都会重新枚举吗？不会：只用本级开始时的列表判断，避免枚举抖动。
// 八、SIGKILL 之前再枚举一次后代：宽限阶段可能有新进程被派生出来。
// 九、最终核对只在 finalPids 上做，不含新出现的后代（它们已在 KILL 前处理）。
// 十、抛错文本固定包含 pid 与剩余列表，方便日志检索与人工接手。
// 十一、所有外部命令都带 timeout：枚举 1s、taskkill 2s，超时按失败处理。
// 十二、本模块不做日志：调用方（client-cleanup）负责记录失败与耗时。
// 测试建议：
// 十三、注入 kill 断言信号顺序：SIGINT → SIGTERM → SIGKILL，且每级之间有等待。
// 十四、注入 execFile 返回固定 stderr 模拟 pgrep 不可用，验证 ps 回退分支。
// 十五、注入 now/sleep 可把宽限预算压到毫秒级，避免测试真的等待 1s。
// 十六、断言「进程已退出时立即返回」：不产生任何命令调用。
