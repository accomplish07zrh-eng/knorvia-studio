// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  HOOK_TIMEOUT_ABORT_REASON,
  createHookCancelledError,
  createHookTimeoutError,
  linkAbortSignal,
} from "./runner-helpers.js";
import type { CallbackValue, HookOccurrence } from "./runner-plan.js";

type Settlement = { value: CallbackValue } | { error: unknown };

/** 单次 dispatch 的资源租约；Promise 负责一次结算，finally 负责唯一清理。 */
class CallbackLease {
  readonly controller = new AbortController();
  private readonly unlink: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private settled = false;

  constructor(
    private readonly timeoutMs: number,
    parent: AbortSignal | undefined,
  ) {
    this.unlink = linkAbortSignal(parent, this.controller);
  }

  start(occurrence: HookOccurrence): Promise<CallbackValue> {
    let settle!: (outcome: Settlement) => void;
    const reply = new Promise<CallbackValue>((resolve, reject) => {
      settle = (outcome) => {
        if (this.settled) return;
        this.settled = true;
        if ("error" in outcome) reject(outcome.error);
        else resolve(outcome.value);
      };
    });
    try {
      const { signal } = this.controller;
      if (signal.aborted) {
        settle({ error: createHookCancelledError() });
        return reply;
      }
      this.timer = setTimeout(() => {
        this.controller.abort(HOOK_TIMEOUT_ABORT_REASON);
        settle({ error: createHookTimeoutError(this.timeoutMs) });
      }, this.timeoutMs);
      this.timer.unref?.();
      signal.addEventListener("abort", () => settle({ error: this.abortError() }), { once: true });
      const { hook, input, runtimeIndex } = occurrence;
      Promise.resolve(hook.callback(input, { hookIndex: runtimeIndex, signal })).then(
        (value) => settle({ value }),
        (error: unknown) => settle({ error }),
      );
    } catch (error) {
      settle({ error });
    }
    return reply;
  }

  release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unlink();
  }

  private abortError(): Error {
    return this.controller.signal.reason === HOOK_TIMEOUT_ABORT_REASON
      ? createHookTimeoutError(this.timeoutMs)
      : createHookCancelledError();
  }
}

export async function runOwnedCallback(
  occurrence: HookOccurrence,
  signal: AbortSignal | undefined,
  defaultTimeoutMs: number,
): Promise<CallbackValue> {
  const lease = new CallbackLease(occurrence.hook.timeoutMs ?? defaultTimeoutMs, signal);
  try {
    return await lease.start(occurrence);
  } finally {
    lease.release();
  }
}
