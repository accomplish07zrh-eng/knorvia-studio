// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { flushMicrotasks } from "./deferred.js";

type TimerHandler = (...args: unknown[]) => void;

interface ScheduledTimer {
  args: unknown[];
  due: number;
  handler: TimerHandler;
  id: number;
  interval?: number;
  referenced: boolean;
}

export class FakeTimerHandle {
  constructor(
    private readonly clock: FakeClock,
    readonly id: number,
  ) {}

  ref(): this {
    this.clock.setReferenced(this.id, true);
    return this;
  }

  unref(): this {
    this.clock.setReferenced(this.id, false);
    return this;
  }

  hasRef(): boolean {
    return this.clock.isReferenced(this.id);
  }

  refresh(): this {
    this.clock.refresh(this.id);
    return this;
  }

  [Symbol.dispose](): void {
    this.clock.clear(this.id);
  }
}

export class FakeClock {
  readonly callbackErrors: unknown[] = [];
  readonly epochMs = Date.UTC(2035, 0, 2, 3, 4, 5);
  nowMs = 0;
  private nextId = 1;
  private readonly timers = new Map<number, ScheduledTimer>();

  setTimeout(handler: TimerHandler, delay = 0, ...args: unknown[]): FakeTimerHandle {
    return this.add(handler, delay, undefined, args);
  }

  setInterval(handler: TimerHandler, delay = 0, ...args: unknown[]): FakeTimerHandle {
    return this.add(handler, delay, Math.max(1, delay), args);
  }

  setImmediate(handler: TimerHandler, ...args: unknown[]): FakeTimerHandle {
    return this.add(handler, 0, undefined, args);
  }

  clear(handle: number | FakeTimerHandle | undefined): void {
    const id = typeof handle === "number" ? handle : handle?.id;
    if (id !== undefined) {
      this.timers.delete(id);
    }
  }

  setReferenced(id: number, referenced: boolean): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      timer.referenced = referenced;
    }
  }

  isReferenced(id: number): boolean {
    return this.timers.get(id)?.referenced ?? false;
  }

  refresh(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      timer.due = this.nowMs + (timer.interval ?? Math.max(0, timer.due - this.nowMs));
    }
  }

  async advance(milliseconds: number): Promise<void> {
    const target = this.nowMs + milliseconds;
    while (true) {
      const next = this.nextDue(target);
      if (next === undefined) {
        break;
      }
      this.nowMs = next.due;
      if (next.interval === undefined) {
        this.timers.delete(next.id);
      } else {
        next.due += next.interval;
      }
      try {
        next.handler(...next.args);
      } catch (error) {
        this.callbackErrors.push(error);
      }
      await flushMicrotasks();
    }
    this.nowMs = target;
    await flushMicrotasks();
  }

  async drainCurrent(): Promise<void> {
    await this.advance(0);
  }

  get pendingCount(): number {
    return this.timers.size;
  }

  private add(
    handler: TimerHandler,
    delay: number,
    interval: number | undefined,
    args: unknown[],
  ): FakeTimerHandle {
    const id = this.nextId;
    this.nextId += 1;
    const timer: ScheduledTimer = {
      args,
      due: this.nowMs + Math.max(0, Number.isFinite(delay) ? delay : 0),
      handler,
      id,
      referenced: true,
    };
    if (interval !== undefined) {
      timer.interval = interval;
    }
    this.timers.set(id, timer);
    return new FakeTimerHandle(this, id);
  }

  private nextDue(target: number): ScheduledTimer | undefined {
    let selected: ScheduledTimer | undefined;
    for (const timer of this.timers.values()) {
      if (timer.due <= target && (selected === undefined || timer.due < selected.due)) {
        selected = timer;
      }
    }
    return selected;
  }
}
