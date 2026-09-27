// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { Script, type Context } from "node:vm";
import { compileReplCell } from "./cell-compiler.js";

export interface ReplExecutor {
  run(
    code: string,
    context: Context,
    signal?: AbortSignal,
    syncTimeoutMs?: number,
  ): Promise<unknown>;
}
export class VmCellExecutor implements ReplExecutor {
  async run(
    code: string,
    context: Context,
    signal?: AbortSignal,
    syncTimeoutMs?: number,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    const script = new Script(compileReplCell(code).source);
    let cancel: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      if (!signal) return;
      cancel = () => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
      signal.addEventListener("abort", cancel, { once: true });
    });
    try {
      // 同步循环必须由 V8 中断；Promise 竞速只负责 await 期间的取消。
      // 先把同步抛错也纳入 Promise，避免 cell 先取消再同步超时时留下未处理的取消 rejection。
      const result = new Promise<unknown>((resolveResult) => {
        const timeout =
          syncTimeoutMs === undefined ? undefined : Math.max(1, Math.trunc(syncTimeoutMs));
        const value: unknown = script.runInContext(context, { timeout });
        signal?.throwIfAborted();
        resolveResult(value);
      });
      return await (signal ? Promise.race([result, stopped]) : result);
    } finally {
      if (cancel) signal!.removeEventListener("abort", cancel);
    }
  }
}
