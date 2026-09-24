import type {
  StudioKernelEvent,
  StudioKernelInteraction,
  StudioKernelSink,
  StudioKernelTurn,
  StudioKernelTurnResult,
} from "../../kernelTypes.js";
import {
  assertKernelPermission,
  errorText,
  type ExternalKernel,
} from "../../domain/kernelPolicy.js";
import type { KernelExecutable } from "./executable.js";
import { deferred, ProtocolProcess, ProtocolResponseError } from "./processTransport.js";

export class KernelRun {
  process!: ProtocolProcess;
  sessionId?: string;
  submitted = false;
  text = "";
  readonly done = deferred<StudioKernelTurnResult>();
  readonly cancelled = new AbortController();
  private ended = false;
  private events = Promise.resolve();
  private textItems = new Map<string, string>();
  private questions = new Map<string, AbortController>();
  interrupt: () => void | Promise<void> = () => {};
  constructor(
    readonly turn: StudioKernelTurn,
    readonly sink: StudioKernelSink,
  ) {
    this.sessionId = turn.nativeSessionId;
  }
  emit(event: StudioKernelEvent): void {
    if (this.ended) return;
    this.events = this.events.then(() => this.sink.emit(event));
    this.events.catch((error) => this.process?.fail(error));
  }
  setSession(id: string): void {
    if (!id || id === this.sessionId) return;
    this.sessionId = id;
    this.emit({ type: "session", sessionId: id });
  }
  delta(id: string, text: string): void {
    if (this.ended || !text) return;
    this.textItems.set(id, (this.textItems.get(id) ?? "") + text);
    this.text += text;
    this.emit({ type: "text", text });
  }
  whole(id: string, text: string): void {
    const previous = this.textItems.get(id) ?? "";
    if (!previous) this.delta(id, text);
    else if (text.startsWith(previous) && text.length > previous.length)
      this.delta(id, text.slice(previous.length));
  }
  async ask(interaction: StudioKernelInteraction) {
    await this.flush();
    if (this.ended || this.cancelled.signal.aborted) throw new Error("交互已失效");
    const controller = new AbortController();
    this.questions.set(interaction.id, controller);
    const abort = () => controller.abort();
    this.cancelled.signal.addEventListener("abort", abort, { once: true });
    const interrupted = deferred<never>();
    const reject = () => interrupted.reject(new Error("交互已失效"));
    controller.signal.addEventListener("abort", reject, { once: true });
    try {
      return await this.process.wait(
        // 原生撤销问题也要通知持久化 owner，不能只结束协议等待而留下可回答的旧问题。
        Promise.race([this.sink.ask(interaction, controller.signal), interrupted.promise]),
      );
    } finally {
      this.questions.delete(interaction.id);
      controller.signal.removeEventListener("abort", reject);
      this.cancelled.signal.removeEventListener("abort", abort);
    }
  }
  invalidate(id: string): void {
    this.questions.get(id)?.abort();
  }
  finish(status: StudioKernelTurnResult["status"], error?: string, resultKnown = true): void {
    if (this.ended) return;
    this.ended = true;
    this.cancelled.abort();
    this.done.resolve({
      status,
      text: this.text,
      nativeSessionId: this.sessionId,
      error,
      resultKnown,
      retryable: status === "failed" && resultKnown,
    });
  }
  async flush(): Promise<void> {
    await this.events;
  }
}

export async function runKernelProtocol(options: {
  kernel: ExternalKernel;
  turn: StudioKernelTurn;
  sink: StudioKernelSink;
  signal: AbortSignal;
  executable: () => Promise<KernelExecutable>;
  args: string[];
  mode: "codex" | "claude" | "acp" | "antigravity";
  message: (run: KernelRun, message: Record<string, unknown>) => void | Promise<void>;
  start: (run: KernelRun) => Promise<void>;
  environment?: NodeJS.ProcessEnv;
}): Promise<StudioKernelTurnResult> {
  const run = new KernelRun(options.turn, options.sink);
  let abortTimer: NodeJS.Timeout | undefined;
  const abort = () => {
    run.cancelled.abort();
    Promise.resolve(run.interrupt()).catch(() => {});
    abortTimer ??= setTimeout(
      () =>
        run.finish(
          run.submitted ? "interrupted" : "cancelled",
          "未收到内核取消确认，执行结果不确定",
          !run.submitted,
        ),
      10_000,
    );
  };
  try {
    assertKernelPermission(options.kernel, options.turn.permission);
    if (options.signal.aborted) return { status: "cancelled", text: "", resultKnown: true };
    const executable = await options.executable();
    if (options.signal.aborted) return { status: "cancelled", text: "", resultKnown: true };
    run.process = new ProtocolProcess(
      executable,
      options.args,
      options.turn.workspacePath,
      options.mode,
      (message) => options.message(run, message),
      options.environment,
    );
    options.signal.addEventListener("abort", abort, { once: true });
    const start = options.start(run);
    start.catch((error) => run.process.fail(error));
    const result = await run.process.wait(run.done.promise);
    await run.flush();
    return result;
  } catch (error) {
    const known = !run.submitted || error instanceof ProtocolResponseError;
    return {
      status: known ? "failed" : "interrupted",
      text: run.text,
      nativeSessionId: run.sessionId,
      error: errorText(error),
      resultKnown: known,
      retryable: !run.submitted,
    };
  } finally {
    clearTimeout(abortTimer);
    options.signal.removeEventListener("abort", abort);
    run.cancelled.abort();
    await run.process?.close();
  }
}
