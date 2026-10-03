import { Worker } from "node:worker_threads";
import type { RipgrepBufferedResult } from "ripgrep";
import { abortError } from "./node-file-policy.js";

type RipgrepWorker = Pick<Worker, "once" | "terminate">;
interface RipgrepWorkerData {
  args: string[];
  preopens: Record<string, string>;
}
type RipgrepWorkerFactory = (workerData: RipgrepWorkerData) => RipgrepWorker;
const DEFAULT_TIMEOUT = 30_000;
let factoryOverride: RipgrepWorkerFactory | undefined;
let timeoutOverride: number | undefined;

// Worker 仍是搜索执行单元；主线程拥有 stop/timeout，不能让 WASI 阻塞会话取消。
const WORKER_PROGRAM = `
const channel = require("node:worker_threads");
const report = (message) => channel.parentPort.postMessage(message);
import("ripgrep")
  .then(({ripgrep}) => ripgrep(channel.workerData.args, {
    buffer: true, env: {}, nodeWasi: false,
    preopens: channel.workerData.preopens, returnOnExit: true
  }))
  .then(result => report({type: "result", result}), problem => {
    const error = problem instanceof Error
      ? {code: "code" in problem ? problem.code : undefined, message: problem.message, name: problem.name, stack: problem.stack}
      : {message: String(problem), name: "Error"};
    report({type: "error", error});
  });
`;
export class RipgrepRuntimeFailure extends Error {
  constructor(cause: unknown) {
    super("Bundled ripgrep WASM failed to run", { cause });
    this.name = "RipgrepRuntimeFailure";
  }
}
class RipgrepTimeoutFailure extends Error {
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
  const previous = factoryOverride;
  factoryOverride = factory;
  return () => {
    factoryOverride = previous;
  };
}
export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  const previous = timeoutOverride;
  timeoutOverride = timeoutMs;
  return () => {
    timeoutOverride = previous;
  };
}
interface WorkerMessage {
  type?: string;
  result?: RipgrepBufferedResult;
  error?: { message?: string; name?: string; stack?: string; code?: unknown };
}
function messageError(message: WorkerMessage): Error {
  const serialized = message.error,
    error = new Error(serialized?.message ?? "ripgrep worker failed");
  error.name = serialized?.name ?? "Error";
  if (serialized?.stack) error.stack = serialized.stack;
  if (serialized && "code" in serialized) Object.assign(error, { code: serialized.code });
  return error;
}
function execute(
  data: RipgrepWorkerData,
  timeout: number,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult> {
  if (signal?.aborted)
    return Promise.reject(abortError("ripgrep search was cancelled before it started"));
  const worker =
    factoryOverride?.(data) ?? new Worker(WORKER_PROGRAM, { eval: true, workerData: data });
  return new Promise((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function settle(value: RipgrepBufferedResult | undefined, problem?: unknown): void {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (value !== undefined) resolve(value);
      else reject(problem);
    }
    function terminate(): void {
      const pending = worker.terminate();
      if (typeof pending === "object" && pending !== null && "catch" in pending)
        void pending.catch(() => undefined);
    }
    function cancel(): void {
      terminate();
      settle(undefined, abortError("ripgrep search was cancelled"));
    }
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      terminate();
      settle(undefined, new RipgrepTimeoutFailure(timeout));
    }, timeout);
    worker.once("message", (message: unknown) => {
      if (done) return;
      const parsed = message as WorkerMessage;
      if (parsed.type === "result" && parsed.result) settle(parsed.result);
      else
        settle(
          undefined,
          parsed.type === "error"
            ? messageError(parsed)
            : new Error("ripgrep worker returned an unknown message"),
        );
    });
    worker.once("error", (error) => settle(undefined, error));
    worker.once("exit", (code) =>
      settle(undefined, new Error(`ripgrep worker exited before returning a result: ${code}`)),
    );
  });
}
export async function runSearch(
  args: string[],
  preopens: Record<string, string>,
  signal?: AbortSignal,
): Promise<RipgrepBufferedResult> {
  try {
    return await execute(
      { args: args.map(String), preopens },
      timeoutOverride ?? DEFAULT_TIMEOUT,
      signal,
    );
  } catch (error) {
    if (
      error instanceof RipgrepTimeoutFailure ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new RipgrepRuntimeFailure(error);
  }
}
