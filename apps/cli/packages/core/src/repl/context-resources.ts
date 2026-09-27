// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
type Callback = (...args: unknown[]) => void;

/** Timers belong to one VM generation and are cancelled together on reset/dispose. */
export class ContextResources {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;
  readonly setTimeout = (callback: Callback, delay?: number, ...args: unknown[]) => {
    if (this.closed) throw new Error("REPL context has been released");
    if (typeof callback !== "function") throw new TypeError("Timer callback must be a function");
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback(...args);
    }, delay);
    this.timers.add(timer);
    return timer;
  };
  readonly setInterval = (callback: Callback, delay?: number, ...args: unknown[]) => {
    if (this.closed) throw new Error("REPL context has been released");
    const timer = setInterval(callback, delay, ...args);
    this.timers.add(timer);
    return timer;
  };
  readonly clear = (timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer);
    this.timers.delete(timer);
  };
  dispose(): void {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
