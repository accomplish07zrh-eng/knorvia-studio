import { PassThrough } from "node:stream";
import { flushE2ECoverage } from "./shutdown.js";

const PROTOCOL_SHUTDOWN_TIMEOUT_MS = 1_500;
const COVERAGE_FLUSH_ALLOWANCE_MS = 500;
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

/**
 * CLI 入口的唯一退出 owner；在加载 runtime 之前安装，不依赖 run() 返回。
 *
 * stdin EOF 的语义（缺陷修复）：它是**客户端礼貌离场**，不是故障。
 * 协议服务器通过 `input` 流自己就能看到 EOF 并走正常关闭；入口只需要占住一个硬上限，
 * 保证「谁都没再动」时进程仍会退出。曾经的做法是 EOF 后 100ms 无条件 abort，
 * 而启动（读 db + 22 个 migration）要 1.4–1.5s，于是 abort 会落在初始化中间：
 * 入口里的 throwIfAborted 抛出 → stderr 写 "Protocol input closed" → exit code 1。
 * Host 在异常收尾时关掉 stdin 就会看到这个假错误，因此这里不再用 abort 表达「输入结束」。
 *
 * 仍然 abort 的只有明确的故障与外部请求：输出关闭、IO 错误、信号、以及 complete()。
 */
export function createProtocolProcessLifecycle(
  options: {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
    timeoutMs?: number;
    exitProcess?: (code: number) => void;
  } = {},
) {
  // 两种输入共享 ReadableStream 契约；显式收敛避免 Node 类型的 on() 重载形成不可调用联合。
  const source: NodeJS.ReadableStream = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const input = new PassThrough();
  const controller = new AbortController();
  const exit = options.exitProcess ?? ((code: number) => process.exit(code));
  let deadlineAt: number | undefined;
  let exitCode = 0;
  // stdin 正常结束会先以 0 占住 deadline；之后 run() 若报告失败，终态必须以失败码为准。
  let stoppedWithoutError = false;
  let deadlineTimer: NodeJS.Timeout | undefined;
  let completion: Promise<void> | undefined;

  const shutdownTimeoutMs = () =>
    options.timeoutMs ??
    PROTOCOL_SHUTDOWN_TIMEOUT_MS +
      (process.env.KNORVIA_E2E_COVERAGE === "1" ? COVERAGE_FLUSH_ALLOWANCE_MS : 0);

  /** 占住硬上限。保持 ref：初始化永不 settle 时也必须交付终态。 */
  const armDeadline = () => {
    const timeoutMs = shutdownTimeoutMs();
    deadlineAt = Date.now() + timeoutMs;
    deadlineTimer = setTimeout(() => exit(exitCode), timeoutMs);
  };

  const stop = (error?: Error, code = error ? 1 : 0) => {
    if (deadlineAt !== undefined) return;
    exitCode = code;
    stoppedWithoutError = error === undefined;
    armDeadline();
    // 输入结束不 abort：让协议服务器自己观察到 EOF 并正常关闭。
    if (error) controller.abort(error);
  };
  const onInputEnd = () => stop();
  const onIoError = (error: Error) => stop(error);
  const onOutputClose = () => stop(new Error("Protocol output closed"));
  const signals =
    process.platform === "win32"
      ? (["SIGINT", "SIGTERM"] as const)
      : (["SIGINT", "SIGTERM", "SIGHUP"] as const);
  for (const signal of signals) {
    const listener = () =>
      stop(new Error(`Protocol received ${signal}`), SIGNAL_EXIT_CODES[signal]);
    // on 而不是 once：重复信号不绕过清理，也不重置首次 deadline。
    process.on(signal, listener);
  }
  source.on("end", onInputEnd);
  source.on("close", onInputEnd);
  source.on("error", onIoError);
  output.on("error", onIoError);
  output.on("close", onOutputClose);
  input.on("error", onIoError);
  // 启动阶段就消费原始 stdin 来观察父端 EOF；背压缓冲保留尚未被协议消费的字节。
  source.pipe(input);
  if ((source as NodeJS.ReadableStream & { readableEnded?: boolean }).readableEnded) onInputEnd();

  return {
    input,
    signal: controller.signal,
    get deadlineAt() {
      return deadlineAt;
    },
    requestShutdown: stop,
    complete(code: number): Promise<void> {
      completion ??= (async () => {
        if (deadlineAt === undefined)
          stop(code === 0 ? undefined : new Error("Protocol command failed"), code);
        // 首个关闭信号若只是 stdin 正常结束，命令自身的非零结果仍必须决定退出码。
        else if (stoppedWithoutError && code !== 0) exitCode = code;
        controller.abort(new Error("Protocol command completed"));
        await Promise.all([flush(output), flush(stderr), flushE2ECoverage()]);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        exit(exitCode);
      })();
      return completion;
    },
  };
}

function flush(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    if (!stream.writable) return resolve();
    try {
      stream.write("", () => resolve());
    } catch {
      resolve();
    }
  });
}
