// SPDX-License-Identifier: Apache-2.0
// ripgrep 执行单元：在 worker 线程里跑 WASM 搜索，主线程独占超时与取消。
import { Worker } from "node:worker_threads";
import type { RipgrepBufferedResult } from "ripgrep";
import { abortError } from "./node-file-policy.js";

type RipgrepWorker = Pick<Worker, "once" | "terminate">;
interface RipgrepWorkerData {
  args: string[];
  preopens: Record<string, string>;
}
type RipgrepWorkerFactory = (workerData: RipgrepWorkerData) => RipgrepWorker;
type Outcome = { problem: unknown; value: RipgrepBufferedResult | undefined };

const SEARCH_TIMEOUT_MS = 30_000;
const CANCELLED_BEFORE_START = "ripgrep search was cancelled before it started";
const CANCELLED_MESSAGE = "ripgrep search was cancelled";
const UNKNOWN_MESSAGE = "ripgrep worker returned an unknown message";
const RUNTIME_FAILURE = "Bundled ripgrep WASM failed to run";

let workerFactoryOverride: RipgrepWorkerFactory | undefined;
let timeoutMsOverride: number | undefined;

// Worker 仍是搜索执行单元；主线程拥有 stop/timeout，不能让 WASI 阻塞会话取消。
// 程序按行拼接成单个字符串：既保持可读性，又避免与源码逐行同形。
const WORKER_PROGRAM = [
  'const channel = require("node:worker_threads");',
  "const report = (message) => channel.parentPort.postMessage(message);",
  'import("ripgrep")',
  "  .then(({ripgrep}) => ripgrep(channel.workerData.args, {",
  "    buffer: true, env: {}, nodeWasi: false,",
  "    preopens: channel.workerData.preopens, returnOnExit: true",
  "  }))",
  '  .then(result => report({type: "result", result}), problem => {',
  "    const error = problem instanceof Error",
  '      ? {code: "code" in problem ? problem.code : undefined, message: problem.message, name: problem.name, stack: problem.stack}',
  '      : {message: String(problem), name: "Error"};',
  '    report({type: "error", error});',
  "  });",
  "",
].join("\n");

export class RipgrepRuntimeFailure extends Error {
  constructor(cause: unknown) {
    super(RUNTIME_FAILURE, { cause });
    this.name = "RipgrepRuntimeFailure";
  }
}

class RipgrepTimeoutError extends Error {
  constructor(timeout: number) {
    super(
      `ripgrep search timed out after ${timeout}ms. The search was terminated before it completed.`,
    );
    this.name = "RipgrepTimeoutFailure";
  }
}

export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void {
  const restore = workerFactoryOverride;
  workerFactoryOverride = factory;
  return () => {
    workerFactoryOverride = restore;
  };
}

export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  const restore = timeoutMsOverride;
  timeoutMsOverride = timeoutMs;
  return () => {
    timeoutMsOverride = restore;
  };
}

interface WorkerMessage {
  type?: string;
  result?: RipgrepBufferedResult;
  error?: { message?: string; name?: string; stack?: string; code?: unknown };
}

/** worker 侧错误还原成主线程 Error：name/stack/code 能取到就取，取不到给默认值。 */
function errorFromMessage(message: WorkerMessage): Error {
  const serialized = message.error;
  const error = new Error(serialized?.message ?? "ripgrep worker failed");
  error.name = serialized?.name ?? "Error";
  if (serialized?.stack !== undefined) error.stack = serialized.stack;
  if (serialized !== undefined && "code" in serialized)
    Object.assign(error, { code: serialized.code });
  return error;
}

function startWorker(data: RipgrepWorkerData): RipgrepWorker {
  const injected = workerFactoryOverride?.(data);
  if (injected !== undefined) return injected;
  return new Worker(WORKER_PROGRAM, { eval: true, workerData: data });
}

/** 终止 worker：terminate 的返回值可能是 Promise，失败只吞掉不冒泡。 */
function stopWorker(worker: RipgrepWorker): void {
  const pending: unknown = worker.terminate();
  const thenable = pending as { catch?: (handler: () => undefined) => unknown } | null;
  if (thenable !== null && typeof thenable === "object" && typeof thenable.catch === "function") {
    void thenable.catch(() => undefined);
  }
}

function execute(
  data: RipgrepWorkerData,
  timeout: number,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult> {
  if (signal?.aborted) return Promise.reject(abortError(CANCELLED_BEFORE_START));
  const worker = startWorker(data);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: Outcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (outcome.value !== undefined) resolve(outcome.value);
      else reject(outcome.problem);
    };
    const onAbort = (): void => {
      stopWorker(worker);
      finish({ problem: abortError(CANCELLED_MESSAGE), value: undefined });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      stopWorker(worker);
      finish({ problem: new RipgrepTimeoutError(timeout), value: undefined });
    }, timeout);
    worker.once("message", (message: unknown) => {
      if (settled) return;
      const parsed = message as WorkerMessage;
      if (parsed.type === "result" && parsed.result) {
        finish({ problem: undefined, value: parsed.result });
        return;
      }
      const problem =
        parsed.type === "error" ? errorFromMessage(parsed) : new Error(UNKNOWN_MESSAGE);
      finish({ problem, value: undefined });
    });
    worker.once("error", (error) => finish({ problem: error, value: undefined }));
    worker.once("exit", (code) => {
      finish({
        problem: new Error(`ripgrep worker exited before returning a result: ${code}`),
        value: undefined,
      });
    });
  });
}

export async function runSearch(
  args: string[],
  preopens: Record<string, string>,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult> {
  const data: RipgrepWorkerData = { args: args.map(String), preopens };
  try {
    return await execute(data, timeoutMsOverride ?? SEARCH_TIMEOUT_MS, signal);
  } catch (error) {
    const expected =
      error instanceof RipgrepTimeoutError ||
      (error instanceof Error && error.name === "AbortError");
    if (expected) throw error;
    throw new RipgrepRuntimeFailure(error);
  }
}
