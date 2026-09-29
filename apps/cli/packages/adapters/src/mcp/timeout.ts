// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export class McpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpTimeoutError";
  }
}

export interface McpDeadline {
  expiresAt: number;
  timeoutMs: number;
}

function ignoreSourceRejection(): void {}

function observeSourceRejection(promise: Promise<unknown>): void {
  // 早退也要观察借用任务的拒绝；回调不捕获等待者状态，也不改变其他消费者。
  void promise.catch(ignoreSourceRejection);
}

function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new Error("Operation aborted");
}

export function createMcpDeadline(timeoutMs: number): McpDeadline {
  const duration = Math.max(0, Math.floor(timeoutMs));
  return { expiresAt: Date.now() + duration, timeoutMs: duration };
}

export function remainingMcpDeadlineMs(deadline: McpDeadline, timeoutMessage: string): number {
  const remaining = deadline.expiresAt - Date.now();
  if (remaining <= 0) throw new McpTimeoutError(timeoutMessage);
  return remaining;
}

export function waitWithinMcpDeadline<T>(
  promise: Promise<T>,
  deadline: McpDeadline,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  let remaining: number;
  try {
    remaining = remainingMcpDeadlineMs(deadline, timeoutMessage);
  } catch (cause) {
    // 到期仍同步抛出并优先于 signal；仅补上已有及未来源拒绝的观察。
    observeSourceRejection(promise);
    throw cause;
  }
  return withTimeout(promise, remaining, timeoutMessage, signal);
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      observeSourceRejection(promise);
      reject(abortError(signal));
      return;
    }

    let pending = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function takeSettlement(): boolean {
      if (!pending) return false;
      pending = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      signal?.removeEventListener("abort", onAbort);
      return true;
    }
    function onAbort(): void {
      if (takeSettlement()) reject(abortError(signal));
    }

    timer = setTimeout(() => {
      if (takeSettlement()) reject(new McpTimeoutError(timeoutMessage));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        if (takeSettlement()) resolve(value);
      },
      (reason: unknown) => {
        if (takeSettlement()) reject(reason);
      },
    );
  });
}
