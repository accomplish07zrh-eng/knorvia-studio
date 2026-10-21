// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 三件进程级的事都在这里：崩溃守卫、停机触发、入口判定。
// 它们共享一个前提 —— 都必须在**进程启动期**注册，且都不能重入。

import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** 进程输出面的最小形状：够了就不再依赖完整的 `NodeJS.Process`。 */
interface ProcessOutput {
  onOutputClosed(error: Error): void;
  process: CrashEventSource;
  writeStderr(text: string): void;
}

/** 崩溃守卫只用到 `on`：不要求完整的 `NodeJS.Process`。 */
type CrashEventSource = Pick<NodeJS.Process, "on">;

/** 停机触发只用到 `once`：四条来源共用同一个注册面。 */
type SignalEventSource = Pick<NodeJS.Process, "once">;

/** stdin 只需要「结束时通知我」这一种订阅。 */
type StdinEventSource = Pick<NodeJS.ReadStream, "once">;

/** 装停机触发器所需的接线面。 */
interface ShutdownWiring {
  readonly process: SignalEventSource;
  readonly shutdown: () => void;
  readonly stdin: StdinEventSource;
}

/**
 * 会让 stderr 写入也失败的错误码：输出通道本身已断（对端关闭、设备失效、
 * 句柄无效）。`ERR_STREAM_DESTROYED` 是 Node 的流状态错误，与前四个 errno 同类。
 *
 * 用一个集合常量而不是逐处比较：这组判据只该有一份。**字符串值不可改**——
 * 它们就是 `error.code` 的运行时取值，改了判据就失效。
 */
const BROKEN_OUTPUT_CODES: ReadonlySet<string> = new Set([
  "EPIPE",
  "EIO",
  "ENXIO",
  "EBADF",
  "ERR_STREAM_DESTROYED",
]);

/** 会触发停机的四个来源：两个信号 + stdin 的两种结束形态。 */
const SHUTDOWN_TRIGGERS = [
  { emitter: "process", event: "SIGINT" },
  { emitter: "process", event: "SIGTERM" },
  { emitter: "stdin", event: "end" },
  { emitter: "stdin", event: "close" },
] as const;

/** 要接管的崩溃类事件。 */
const CRASH_EVENTS = ["uncaughtException", "unhandledRejection"] as const;

/** 每个 process 只装一次：重复安装会让同一次崩溃被处理多遍。 */
const guardedProcesses = new WeakSet<object>();

/**
 * 把任意抛出物转成可上报的 `Error`。
 *
 * `String(reason)` 自己也可能抛：原错误的观察器可被改写（例如 `String` 取值器
 * 抛错），那样连关闭路径也会被打断。这里退到固定文案兜住。
 *
 * @param reason - 捕获到的任意值。
 * @returns 可安全上报的 `Error`。
 */
function toReportable(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  try {
    return new Error(String(reason));
  } catch {
    return new Error("Unknown execution host failure");
  }
}

/**
 * 判断错误码是否属于「输出通道已断」。
 *
 * @param error - 待判定错误。
 * @returns 是否属于已断码集合。
 */
function breaksOutput(error: Error): boolean {
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "string" && BROKEN_OUTPUT_CODES.has(code);
}

/**
 * 判定一次崩溃该「上报」还是「直接关闭」，并把结论落到输出面。
 *
 * 单独成函数是为了让守卫保持一条直线：先判定、再执行、最后只在必要时关闭。
 *
 * @param output - 进程输出面。
 * @param error - 已转成 `Error` 的崩溃原因。
 * @returns 需要关闭时返回该错误；可继续运行时返回 undefined。
 */
function classifyFault(output: ProcessOutput, error: Error): Error | undefined {
  if (breaksOutput(error)) return error;
  output.writeStderr(`Knorvia execution host: ${error.stack ?? error.message}\n`);
  return undefined;
}

/**
 * 装崩溃守卫：把未捕获异常与未处理拒绝变成一次可控的输出关闭。
 *
 * 两支语义：输出通道断了就**关闭**（无法再报告）；否则写 stderr 后继续运行。
 *
 * @param output - 进程输出面。
 */
export function installNodeReplProcessGuards(output: ProcessOutput): void {
  if (guardedProcesses.has(output.process)) return;
  guardedProcesses.add(output.process);

  /** 是否已经因为不可报告的错误而关闭输出。关闭后不再重复关闭。 */
  const lifecycle = { closed: false };
  const onFault = (reason: unknown): void => {
    if (lifecycle.closed) return;
    let fatal: Error | undefined;
    try {
      fatal = classifyFault(output, toReportable(reason));
    } catch (reportFailure) {
      // 上报自身失败（写 stderr 抛错、或观察器抛错）：只剩「关闭」一条路。
      fatal = toReportable(reportFailure);
    }
    if (fatal === undefined) return;
    lifecycle.closed = true;
    output.onOutputClosed(fatal);
  };

  for (const eventName of CRASH_EVENTS) output.process.on(eventName, onFault);
}

/**
 * 装停机触发器。
 *
 * 四个来源共用**同一个**去重标志：任意两个先到都只应触发一次 `shutdown()`，
 * 因为关闭流程会释放子进程、套接字与临时目录，重复执行会互相踩。
 *
 * 用表驱动而不是四行重复的 `once(...)`：新增一个停机来源时只改表，
 * 不必再抄一行注册（抄漏一处就会漏掉该来源的停机）。
 *
 * @param wiring - 进程与 stdin 的事件面，以及真正的关闭动作。
 */
export function installNodeReplShutdownTriggers(wiring: ShutdownWiring): void {
  const lifecycle = { disarmed: false };
  const disarm = (): void => {
    if (lifecycle.disarmed) return;
    lifecycle.disarmed = true;
    wiring.shutdown();
  };
  for (const trigger of SHUTDOWN_TRIGGERS) wiring[trigger.emitter].once(trigger.event, disarm);
}

/**
 * 把 `file:` URL 转成文件路径；其它 scheme 视为「不是文件」，返回 undefined。
 *
 * 用**前置的 scheme 判断**而不是 try/catch 接住 `fileURLToPath` 的抛错：
 * 「是不是 file URL」是一个可判定的事实，不该靠异常来表达。
 *
 * @param moduleUrl - 待判定的 URL 字符串。
 * @returns 文件路径；非 file: scheme 时为 undefined。
 */
function filePathOf(moduleUrl: string): string | undefined {
  return moduleUrl.startsWith("file:") ? fileURLToPath(moduleUrl) : undefined;
}

/**
 * 判断当前模块是否就是被直接执行的那个可执行入口。
 *
 * 两侧都先 `realpath`：打包后可能是软链（pnpm 的 store 布局、macOS 的 alias、
 * Windows 的 junction），直接比字符串会把同一个文件判成两个路径。
 *
 * 任何异常一律返回 `false`：本函数在**启动期**调用，判错方向的代价是
 * 「不进入服务器模式」，不该让进程崩溃。
 *
 * @param moduleUrl - 当前模块的 `import.meta.url`。
 * @param executable - `process.argv[1]`；可能为 undefined。
 * @returns 两者是否指向同一个真实文件。
 */
export async function isDirectMcpEntrypoint(
  moduleUrl: string,
  executable: string | undefined,
): Promise<boolean> {
  if (executable === undefined || executable === "") return false;
  const modulePath = filePathOf(moduleUrl);
  if (modulePath === undefined) return false;
  const settled = await Promise.allSettled([realpath(modulePath), realpath(executable)]);
  const [moduleSide, entrySide] = settled;
  if (moduleSide.status === "rejected" || entrySide.status === "rejected") return false;
  return moduleSide.value === entrySide.value;
}
