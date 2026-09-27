// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { AsyncLocalStorage } from "node:async_hooks";
import { homedir, tmpdir } from "node:os";
import { createContext, type Context } from "node:vm";
import { ContextResources } from "./context-resources.js";
import { VmCellExecutor } from "./cell-executor.js";
import { RunOutput } from "./run-output.js";
import { errorDetails, errorField, moduleAccess, restrictedProcess } from "./runtime-values.js";
import type {
  NodeReplCuaAppIdentity,
  NodeReplImage,
  NodeReplRunResult,
  NodeReplSessionOptions,
  RunOptions,
} from "./session-contract.js";

const RESET_MESSAGE =
  "; kernel reset, all previous bindings were cleared; reinitialize browser/tab bindings before rerunning";

/** Persistent evaluation context; business admission and permissions remain with the caller. */
export class NodeReplSession {
  private context!: Context;
  private resources!: ContextResources;
  private readonly outputContext = new AsyncLocalStorage<RunOutput>();
  private readonly executor = new VmCellExecutor();
  private readonly processFacade?: Readonly<Record<string, unknown>>;
  private active?: { output: RunOutput; abort: AbortController };
  private disposed = false;

  constructor(private readonly options: NodeReplSessionOptions = {}) {
    this.processFacade = options.restrictProcess ? restrictedProcess() : undefined;
    this.rebuildContext();
  }
  private rebuildContext(): void {
    this.resources?.dispose();
    this.resources = new ContextResources();
    const resources = this.resources;
    const current = () => this.outputContext.getStore();
    const modules = moduleAccess(this.processFacade);
    const nodeRepl = {
      cwd: process.cwd(),
      homeDir: homedir(),
      tmpDir: tmpdir(),
      get requestMeta() {
        return current()?.requestMeta ?? {};
      },
      write: (value: unknown) => current()?.write(value),
      emitImage: (value: unknown) => current()?.emitImage(value),
      emitStructuredResult: (value: unknown) => current()?.emitStructuredResult(value),
      setResponseMeta: (value: unknown) => current()?.setMeta(value),
    };
    const console = Object.fromEntries(
      ["log", "info", "warn", "error", "debug"].map((level) => [
        level,
        (...values: unknown[]) => current()?.write(...values),
      ]),
    );
    const injected =
      typeof this.options.injectedGlobals === "function"
        ? this.options.injectedGlobals()
        : this.options.injectedGlobals;
    const globals: Record<PropertyKey, unknown> = {
      Buffer,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      structuredClone,
      queueMicrotask,
      console,
      nodeRepl,
      setTimeout: resources.setTimeout,
      setInterval: resources.setInterval,
      clearTimeout: resources.clear,
      clearInterval: resources.clear,
      process: this.processFacade ?? process,
      ...modules,
      ...injected,
    };
    globals.globalThis = globals;
    this.context = createContext(globals);
  }
  private hostOutput(): RunOutput | undefined {
    // 取消后的 continuation 保留原异步归属，不能落入下一次 run 的活动收集器。
    return this.outputContext.getStore();
  }
  mergeResponseMeta(meta: Record<string, unknown>): void {
    this.hostOutput()?.setMeta(meta, true);
  }
  recordBrowserScreenshot(image: NodeReplImage): void {
    this.hostOutput()?.recordScreenshot(image);
  }
  recordCuaAppIdentity(app: NodeReplCuaAppIdentity): void {
    this.hostOutput()?.recordApp(app);
  }

  async run(code: string, options: RunOptions = {}): Promise<NodeReplRunResult> {
    if (this.disposed)
      return { logs: "", error: { name: "DisposedError", message: "REPL session 已释放" } };
    if (this.active)
      return {
        logs: "",
        error: { name: "BusyError", message: "REPL session is already running a cell" },
      };
    const output = new RunOutput({ ...options.requestMeta });
    const abort = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal;
    this.active = { output, abort };
    return this.outputContext.run(output, async () => {
      try {
        const value = await this.executor.run(code, this.context, signal, options.syncTimeoutMs);
        return output.finish(value);
      } catch (failure) {
        const error = errorDetails(failure);
        const timedOut = errorField(failure, "code") === "ERR_SCRIPT_EXECUTION_TIMEOUT";
        if (
          signal.aborted ||
          timedOut ||
          error.name === "AbortError" ||
          error.name === "TimeoutError"
        ) {
          output.open = false;
          if (!this.disposed) {
            this.rebuildContext();
            error.message += RESET_MESSAGE;
          }
        }
        return output.finish(undefined, error);
      } finally {
        output.open = false;
        this.active = undefined;
      }
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) {
      this.active.output.open = false;
      this.active.abort.abort(new DOMException("REPL session disposed", "AbortError"));
    }
    this.resources.dispose();
  }
}
