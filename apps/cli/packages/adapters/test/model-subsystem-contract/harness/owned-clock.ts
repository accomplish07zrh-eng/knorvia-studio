// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

type TimerCallback = (...args: unknown[]) => void;

interface PendingTimer {
  readonly args: unknown[];
  readonly callback: TimerCallback;
  readonly id: number;
  readonly intervalMs?: number;
  at: number;
}

export class OwnedClock {
  readonly Date: DateConstructor;
  readonly performance: { now: () => number };
  private currentMs = 1_700_000_000_000;
  private nextId = 1;
  private readonly timers = new Map<number, PendingTimer>();

  constructor() {
    const getNow = (): number => this.currentMs;
    const ClockDate = class ClockDate extends Date {
      constructor(value?: string | number | Date) {
        super(value === undefined ? getNow() : value instanceof Date ? value.getTime() : value);
      }

      static override now(): number {
        return getNow();
      }
    };
    this.Date = ClockDate as unknown as DateConstructor;
    this.performance = { now: () => this.currentMs };
  }

  now(): number {
    return this.currentMs;
  }

  setNow(value: number): void {
    this.currentMs = value;
  }

  setTimeout(callback: TimerCallback, delay = 0, ...args: unknown[]): number {
    return this.addTimer(callback, delay, undefined, args);
  }

  clearTimeout(id: number | undefined): void {
    if (id !== undefined) this.timers.delete(id);
  }

  setInterval(callback: TimerCallback, delay = 0, ...args: unknown[]): number {
    const intervalMs = Math.max(1, delay);
    return this.addTimer(callback, intervalMs, intervalMs, args);
  }

  clearInterval(id: number | undefined): void {
    this.clearTimeout(id);
  }

  delay<T>(delay: number, value?: T, options?: { signal?: AbortSignal }): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted === true) {
        reject(signal.reason);
        return;
      }
      let timerId: number | undefined;
      const onAbort = (): void => {
        this.clearTimeout(timerId);
        reject(signal?.reason);
      };
      timerId = this.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      }, delay);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  pendingDelays(): number[] {
    return [...this.timers.values()]
      .map((timer) => timer.at - this.currentMs)
      .sort((a, b) => a - b);
  }

  async advanceBy(deltaMs: number): Promise<void> {
    const destination = this.currentMs + deltaMs;
    while (true) {
      const timer = this.nextTimer(destination);
      if (timer === undefined) break;
      this.currentMs = timer.at;
      if (timer.intervalMs === undefined) this.timers.delete(timer.id);
      else timer.at += timer.intervalMs;
      timer.callback(...timer.args);
      await Promise.resolve();
    }
    this.currentMs = destination;
    await Promise.resolve();
  }

  async runAll(limit = 1_000): Promise<void> {
    let count = 0;
    while (this.timers.size > 0) {
      if (count >= limit) throw new Error("Owned clock timer limit exceeded");
      const timer = this.nextTimer(Number.POSITIVE_INFINITY);
      if (timer === undefined) break;
      await this.advanceBy(Math.max(0, timer.at - this.currentMs));
      count += 1;
    }
  }

  reset(): void {
    this.currentMs = 1_700_000_000_000;
    this.nextId = 1;
    this.timers.clear();
  }

  private addTimer(
    callback: TimerCallback,
    delay: number,
    intervalMs: number | undefined,
    args: unknown[],
  ): number {
    const id = this.nextId;
    this.nextId += 1;
    const timer: PendingTimer = {
      args,
      at: this.currentMs + Math.max(0, Number.isFinite(delay) ? delay : 0),
      callback,
      id,
      ...(intervalMs === undefined ? {} : { intervalMs }),
    };
    this.timers.set(id, timer);
    return id;
  }

  private nextTimer(noLaterThan: number): PendingTimer | undefined {
    let selected: PendingTimer | undefined;
    for (const timer of this.timers.values()) {
      if (timer.at <= noLaterThan && (selected === undefined || timer.at < selected.at))
        selected = timer;
    }
    return selected;
  }
}
