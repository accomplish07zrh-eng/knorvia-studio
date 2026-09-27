// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { addAbortListener } from "node:events";
import { Worker } from "node:worker_threads";
import type { NodeReplRunResult } from "@knorvia/core/repl";
import { WORKER_KIND, type NodeReplExecuteInput } from "./execution-contract.js";

type Outcome = { ok: true; result: NodeReplRunResult } | { ok: false; error: unknown };

/** A single completion owner arbitrates worker events and caller cancellation. */
class WorkerCall {
  readonly #worker: Worker;
  readonly #completion = Promise.withResolvers<NodeReplRunResult>();
  #cancelSubscription?: ReturnType<typeof addAbortListener>;
  #finished = false;

  constructor(moduleUrl: string, input: NodeReplExecuteInput) {
    const { signal, ...data } = input;
    this.#worker = new Worker(new URL(moduleUrl), { workerData: { ...data, kind: WORKER_KIND } });
    this.#worker.once("message", this.#message);
    this.#worker.on("error", this.#error);
    this.#worker.once("exit", (code) => {
      this.#settle({ ok: false, error: new Error(`Execution worker exited (${code})`) });
      this.#worker.off("error", this.#error);
    });
    const cancel = () =>
      this.#settle({
        ok: false,
        error: signal.reason ?? new DOMException("aborted", "AbortError"),
      });
    // 普通 abort 监听可被 stopImmediatePropagation 截断；所有者取消必须不可拦截。
    this.#cancelSubscription = addAbortListener(signal, cancel);
    if (signal.aborted) cancel();
  }

  get result(): Promise<NodeReplRunResult> {
    return this.#completion.promise;
  }

  #message = (result: NodeReplRunResult) =>
    this.#settle(
      result
        ? { ok: true, result }
        : { ok: false, error: new Error("Execution worker returned no result") },
    );
  #error = (error: unknown) => this.#settle({ ok: false, error });

  #settle(outcome: Outcome): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#cancelSubscription?.[Symbol.dispose]();
    this.#worker.off("message", this.#message);
    // Keep the error receiver until exit so termination cannot create an unhandled event.
    void this.#worker.terminate().catch(() => {});
    if (outcome.ok) this.#completion.resolve(outcome.result);
    else this.#completion.reject(outcome.error);
  }
}

export function executeInWorker(
  moduleUrl: string,
  input: NodeReplExecuteInput,
): Promise<NodeReplRunResult> {
  input.signal.throwIfAborted();
  return new WorkerCall(moduleUrl, input).result;
}
