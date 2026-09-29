// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
const WORLD_KEY = Symbol.for("knorvia.exec.contract.fixture-world");

interface InjectedWorld {
  clock: {
    epochMs: number;
    nowMs: number;
    clear(handle: unknown): void;
    setImmediate(handler: (...args: unknown[]) => void, ...args: unknown[]): unknown;
    setInterval(handler: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): unknown;
    setTimeout(handler: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): unknown;
  };
  process: {
    arch: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    execPath: string;
    memoryUsage(): NodeJS.MemoryUsage;
    pid: number;
    platform: NodeJS.Platform;
  };
  signal(pid: number, signal?: NodeJS.Signals | number): boolean;
}

function world(): InjectedWorld {
  const value = (globalThis as typeof globalThis & Record<PropertyKey, unknown>)[WORLD_KEY];
  if (value === undefined) {
    throw new Error("Execution target touched a side effect outside an installed fixture world");
  }
  return value as InjectedWorld;
}

const memoryUsage = Object.assign((): NodeJS.MemoryUsage => world().process.memoryUsage(), {
  rss: (): number => world().process.memoryUsage().rss,
});

const processMembers: Record<PropertyKey, unknown> = {
  getuid: (): number => 1_000,
  hrtime: Object.assign(
    (): [number, number] => {
      const milliseconds = world().clock.nowMs;
      return [Math.floor(milliseconds / 1_000), (milliseconds % 1_000) * 1_000_000];
    },
    { bigint: (): bigint => BigInt(world().clock.nowMs) * 1_000_000n },
  ),
  nextTick: (handler: (...args: unknown[]) => void, ...args: unknown[]): void =>
    queueMicrotask(() => handler(...args)),
  release: { name: "node", sourceUrl: "fixture", headersUrl: "fixture", libUrl: "fixture" },
  uptime: (): number => world().clock.nowMs / 1_000,
  versions: { node: "24.14.0" },
};

export const process = new Proxy(processMembers, {
  get(target, property, receiver): unknown {
    if (Reflect.has(target, property)) {
      return Reflect.get(target, property, receiver);
    }
    const state = world().process;
    switch (property) {
      case "arch":
      case "env":
      case "execPath":
      case "pid":
      case "platform":
        return state[property];
      case "cwd":
        return (): string => state.cwd;
      case "kill":
        return (pid: number, signal?: NodeJS.Signals | number): boolean =>
          world().signal(pid, signal);
      case "memoryUsage":
        return memoryUsage;
      default:
        throw new Error(`Unapproved process property: ${String(property)}`);
    }
  },
}) as unknown as NodeJS.Process;

export function setTimeout(
  handler: (...args: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
): NodeJS.Timeout {
  return world().clock.setTimeout(handler, delay, ...args) as NodeJS.Timeout;
}

export function clearTimeout(handle?: NodeJS.Timeout): void {
  world().clock.clear(handle);
}

export function setInterval(
  handler: (...args: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
): NodeJS.Timeout {
  return world().clock.setInterval(handler, delay, ...args) as NodeJS.Timeout;
}

export function clearInterval(handle?: NodeJS.Timeout): void {
  world().clock.clear(handle);
}

export function setImmediate(
  handler: (...args: unknown[]) => void,
  ...args: unknown[]
): NodeJS.Immediate {
  return world().clock.setImmediate(handler, ...args) as NodeJS.Immediate;
}

export function clearImmediate(handle?: NodeJS.Immediate): void {
  world().clock.clear(handle);
}

class FixtureDate extends globalThis.Date {
  constructor(value?: string | number) {
    if (value === undefined) {
      super(world().clock.epochMs + world().clock.nowMs);
    } else {
      super(value);
    }
  }

  static override now(): number {
    return world().clock.epochMs + world().clock.nowMs;
  }
}

export { FixtureDate as Date };

export const performance = {
  now: (): number => world().clock.nowMs,
  timeOrigin: 0,
};
