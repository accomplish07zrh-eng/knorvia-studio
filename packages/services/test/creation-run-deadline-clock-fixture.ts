// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";

/** 只控制 CreationService 明确交给它的 run watchdog，不替换任何全局计时器。 */
export function createRunDeadlineClock() {
  let now = 0;
  let cancelled = 0;
  let fired = 0;
  const delays: number[] = [];
  const cancellations: Promise<void>[] = [];
  const pending = new Map<object, { due: number; callback: () => void }>();
  return {
    scheduleRunDeadline(callback: () => void, delayMs: number) {
      const token = {};
      const cancellation = Promise.withResolvers<void>();
      cancellations.push(cancellation.promise);
      delays.push(delayMs);
      pending.set(token, { due: now + delayMs, callback });
      return () => {
        cancelled++;
        pending.delete(token);
        cancellation.resolve();
      };
    },
    advanceBy(ms: number) {
      assert.ok(Number.isFinite(ms) && ms >= 0);
      now += ms;
      for (const [token, entry] of pending) {
        if (entry.due > now) continue;
        pending.delete(token);
        fired++;
        entry.callback();
      }
    },
    snapshot: () => ({ now, cancelled, fired, pending: pending.size, delays: [...delays] }),
    settled: async () => {
      await Promise.all(cancellations);
    },
  };
}
