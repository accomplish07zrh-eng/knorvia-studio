// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { TimerTask } from "./types.ts";

type MutableProcess = typeof process & { cwd: () => string };

export class ManualClock {
  #nextId = 1;
  #now: number;
  readonly tasks = new Map<number, TimerTask>();

  constructor(now = Date.parse("2026-01-02T03:04:05.000Z")) {
    this.#now = now;
  }

  advance(milliseconds: number): void {
    const target = this.#now + milliseconds;
    while (true) {
      const next = [...this.tasks.values()]
        .filter((task) => task.dueAt <= target)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
      if (!next) break;
      this.#now = next.dueAt;
      this.tasks.delete(next.id);
      next.callback();
    }
    this.#now = target;
  }

  clear(id: number): void {
    this.tasks.delete(id);
  }

  now(): number {
    return this.#now;
  }

  set(callback: () => void, milliseconds = 0): number {
    const id = this.#nextId++;
    this.tasks.set(id, { callback, dueAt: this.#now + Number(milliseconds), id });
    return id;
  }
}

export function installClock(clock: ManualClock, cwd = "D:/fixture/workspace"): () => void {
  const OriginalDate = Date;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalCwd = process.cwd;
  const originalFetch = globalThis.fetch;

  class FixtureDate extends OriginalDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? clock.now() : value);
    }

    static override now(): number {
      return clock.now();
    }
  }

  Object.defineProperty(globalThis, "Date", { configurable: true, value: FixtureDate });
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (callback: (...args: unknown[]) => void, milliseconds?: number, ...args: unknown[]) =>
      clock.set(() => callback(...args), milliseconds),
  });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: (id: number) => clock.clear(id),
  });
  (process as MutableProcess).cwd = () => cwd;
  globalThis.fetch = (() => {
    throw new Error("Unexpected real fetch");
  }) as typeof fetch;

  return () => {
    Object.defineProperty(globalThis, "Date", { configurable: true, value: OriginalDate });
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
      configurable: true,
      value: originalClearTimeout,
    });
    (process as MutableProcess).cwd = originalCwd;
    globalThis.fetch = originalFetch;
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T | PromiseLike<T>): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export async function flushMicrotasks(rounds = 4): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}
