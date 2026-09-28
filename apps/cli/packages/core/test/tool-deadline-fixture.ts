// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { TestContext } from "node:test";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";

export function clock(t: TestContext) {
  let now = 0;
  let nextId = 0;
  const pending = new Map<number, { at: number; action: () => void }>();
  const delays: number[] = [];
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setTimeout", (action: () => void, delay: number) => {
    const id = ++nextId;
    delays.push(delay);
    pending.set(id, { at: now + delay, action });
    return id as unknown as ReturnType<typeof setTimeout>;
  });
  t.mock.method(globalThis, "clearTimeout", (id: number) => {
    pending.delete(id);
  });
  return {
    delays,
    pending,
    elapse(ms: number) {
      now += ms;
    },
    tick(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...pending]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        pending.delete(due[0]);
        due[1].action();
      }
      now = target;
    },
  };
}
export const entry = (overrides: Partial<ToolEntry> = {}): ToolEntry =>
  ({
    metadata: { name: "Fixture", timeoutMs: 100 },
    cancellation: { cleanup: "required", supported: true, userVisibleMessage: "fixture cancelled" },
    ...overrides,
  }) as ToolEntry;
export const context = (controller: AbortController) =>
  ({ abortSignal: controller.signal }) as ToolExecutionContext;
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
