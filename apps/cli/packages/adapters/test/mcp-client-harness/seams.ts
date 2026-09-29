// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { LoggerLike, SeamCall, SeamHook, UnknownRecord } from "./types.ts";

export const SEAMS_KEY = Symbol.for("knorvia.mcp.independent.seams");
export const RETAINED_EXPORTS_KEY = Symbol.for("knorvia.mcp.independent.retained-exports");

type GlobalFixture = typeof globalThis & {
  [SEAMS_KEY]?: SeamController;
  [RETAINED_EXPORTS_KEY]?: Record<string, unknown>;
};

export class SeamController {
  readonly calls: SeamCall[] = [];
  readonly hooks = new Map<string, SeamHook>();
  readonly values = new Map<string, unknown>();
  #sequence = 0;

  call(key: string, index = 0): SeamCall {
    const calls = this.callsFor(key);
    const result = calls.at(index);
    if (!result) throw new Error(`Missing seam call ${key}[${index}]`);
    return result;
  }

  callsFor(key: string): SeamCall[] {
    return this.calls.filter((call) => call.key === key);
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  getValue<T>(key: string, fallback: T): T {
    return (this.values.has(key) ? this.values.get(key) : fallback) as T;
  }

  invoke(key: string, receiver: unknown, args: unknown[], fallback?: unknown): unknown {
    this.calls.push({ args, key, receiver, sequence: ++this.#sequence });
    const hook = this.hooks.get(key);
    if (hook) return hook(receiver, ...args);
    return typeof fallback === "function" ? Reflect.apply(fallback, receiver, args) : fallback;
  }

  setHook(key: string, hook: SeamHook): void {
    this.hooks.set(key, hook);
  }

  setValue(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

export function installSeams(controller: SeamController): () => void {
  const globalFixture = globalThis as GlobalFixture;
  const previous = globalFixture[SEAMS_KEY];
  globalFixture[SEAMS_KEY] = controller;
  return () => {
    if (previous) globalFixture[SEAMS_KEY] = previous;
    else delete globalFixture[SEAMS_KEY];
  };
}

export function retainedExports(): Record<string, unknown> {
  const fixture = globalThis as GlobalFixture;
  return (fixture[RETAINED_EXPORTS_KEY] ??= {});
}

export function createLogger(controller: SeamController): LoggerLike {
  const logger: LoggerLike = {
    child(context) {
      return controller.invoke("logger.child", this, [context], logger) as LoggerLike;
    },
    debug(message, context) {
      controller.invoke("logger.debug", this, [message, context]);
    },
    error(message, error, context) {
      controller.invoke("logger.error", this, [message, error, context]);
    },
    info(message, context) {
      controller.invoke("logger.info", this, [message, context]);
    },
    warn(message, context) {
      controller.invoke("logger.warn", this, [message, context]);
    },
  };
  return logger;
}

export function callContext(call: SeamCall): UnknownRecord {
  const context = call.args[1];
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error(`Call ${call.key} has no object context`);
  }
  return context as UnknownRecord;
}
