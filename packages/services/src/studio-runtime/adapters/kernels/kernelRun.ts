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
  private withdrawn = new Set<string>();
  private tools = new Map<string, Extract<StudioKernelEvent, { type: "tool" }>>();
  interrupt: () => void | Promise<void> = () => {};
  constructor(
    readonly turn: StudioKernelTurn,
    readonly sink: StudioKernelSink,
  ) {
    this.sessionId = turn.nativeSessionId;
  }
  get finished(): boolean {
    return this.ended;
  }
  emit(event: StudioKernelEvent): void {
    if (this.ended) return;
    if (event.type === "tool") {
      // 各协议的稀疏更新在单次适配器中合并；undefined 不抹除已有输入或输出。
      event = {
        ...this.tools.get(event.id),
        ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)),
      } as typeof event;
      this.tools.set(event.id, event);
    }
    this.events = this.events.then(() => this.sink.emit(event));
    this.events.catch((error) => this.process?.fail(error));
  }
  /** 内核产出的媒体；空列表不发事件。 */
  media(items: import("../../kernelTypes.js").StudioKernelMedia[]): void {
    if (items.length) this.emit({ type: "media", items });
  }
  tool(
    update: { id: string } & Partial<Omit<Extract<StudioKernelEvent, { type: "tool" }>, "type">>,
  ): void {
    const previous = this.tools.get(update.id);
    this.emit({
      type: "tool",
      name: previous?.name ?? "tool",
      state: previous?.state ?? "unknown",
      ...update,
    });
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
    if (
      this.ended ||
      this.cancelled.signal.aborted ||
      this.withdrawn.has(interaction.id) ||
      this.questions.has(interaction.id)
    )
      throw new Error("交互已失效或重复");
    // 先注册撤回对象再等待落库；否则同批次撤回会早于 controller，留下幽灵审批。
    const controller = new AbortController();
    this.questions.set(interaction.id, controller);
    const abort = () => controller.abort();
    this.cancelled.signal.addEventListener("abort", abort, { once: true });
    const interrupted = deferred<never>();
    const reject = () => interrupted.reject(new Error("交互已失效"));
    controller.signal.addEventListener("abort", reject, { once: true });
    interrupted.promise.catch(() => {});
    try {
      await this.flush();
      controller.signal.throwIfAborted();
      const answer = await this.process.wait(
        // 原生撤销问题也要通知持久化 owner，不能只结束协议等待而留下可回答的旧问题。
        Promise.race([this.sink.ask(interaction, controller.signal), interrupted.promise]),
      );
      controller.signal.throwIfAborted();
      return answer;
    } finally {
      this.withdrawn.add(interaction.id);
      this.questions.delete(interaction.id);
      controller.signal.removeEventListener("abort", reject);
      this.cancelled.signal.removeEventListener("abort", abort);
    }
  }
  invalidate(id: string): void {
    this.withdrawn.add(id);
    this.questions.get(id)?.abort();
  }
  finish(status: StudioKernelTurnResult["status"], error?: string, resultKnown = true): void {
    if (this.ended) return;
    // 整轮成功不证明每个提议工具执行成功；缺少结果的工具显示未知，取消/断线保持真实终态。
    for (const tool of this.tools.values()) {
      if (tool.state === "running")
        this.emit({
          ...tool,
          state: status === "succeeded" || status === "failed" ? "unknown" : status,
          statusDetail:
            error || (status === "succeeded" ? "未收到工具结果 / No tool result" : status),
        });
    }
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
    run.finish(known ? "failed" : "interrupted", errorText(error), known);
    // EOF 可能紧跟最后的增量；必须等待本地已接纳的输出落库再返回。
    await run.flush().catch(() => {});
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
