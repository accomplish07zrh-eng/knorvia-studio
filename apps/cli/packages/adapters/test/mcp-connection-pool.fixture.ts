// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  Logger,
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpToolDescriptor,
  McpToolCallResult,
} from "@knorvia/contracts";
import type * as Pool from "../src/mcp/pool.js";
import type { McpTelemetryTracker } from "../src/mcp/telemetry.js";

export const targetUrls = {
  entry: new URL("../src/mcp/pool.ts", import.meta.url),
  companions: {
    "./pool-identity.js": new URL("../src/mcp/pool-identity.ts", import.meta.url),
  } as Record<string, URL>,
  esbuild: new URL(import.meta.resolve("esbuild")),
};
export type AdapterInput = Parameters<Pool.McpConnectionPoolOptions["createAdapter"]>[0];
export interface AdapterControl {
  input: AdapterInput;
  port: McpPort;
  connected: McpServerStatus;
  statuses: Record<string, McpServerStatus>;
  tools: McpToolDescriptor[];
  result: McpToolCallResult;
}
export interface OwnedTimeout {
  callback(): void;
  delay: number;
  cleared: boolean;
  unref(): void;
}
const watch = globalThis.setTimeout;
const unwatch = globalThis.clearTimeout;
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = watch(() => reject(new Error(`test gate expired: ${label}`)), 3000);
      }),
    ]);
  } finally {
    if (timer) unwatch(timer);
  }
}
export const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
export async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection");
}
export const config = (isolation: "session" | "workspace" = "workspace"): McpServerConfig => ({
  type: "stdio",
  command: "owned-command",
  isolation,
});
export const status = (kind: McpServerStatus["status"] = "connected"): McpServerStatus => ({
  status: kind,
  transport: "stdio",
  toolCount: 1,
  updatedAt: "2000-01-01T00:00:00.000Z",
});

export async function fixture() {
  const calls: { name: string; args: readonly unknown[] }[] = [];
  const waiters: { name: string; count: number; gate: ReturnType<typeof deferred<void>> }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    for (const waiter of waiters)
      if (waiter.name === name && calls.filter((call) => call.name === name).length >= waiter.count)
        waiter.gate.resolve();
  };
  let time = 1700000000000;
  const clock = {
    read() {
      record("date.now");
      return time;
    },
  };
  class ClockDate extends Date {
    constructor(value?: string | number) {
      super(value ?? time);
      if (value === undefined) record("date.construct");
    }
    static override now() {
      return clock.read();
    }
  }
  const timeouts: OwnedTimeout[] = [];
  const timer = {
    setTimeout(callback: () => void, delay: number) {
      const handle: OwnedTimeout = {
        callback,
        delay,
        cleared: false,
        unref() {
          assert.equal(this, handle);
          record("timer.unref", handle);
        },
      };
      record("timer.set", handle);
      timeouts.push(handle);
      return handle;
    },
    clearTimeout(handle: OwnedTimeout) {
      record("timer.clear", handle);
      handle.cleared = true;
    },
  };
  const child: Logger = {
    debug(message, context) {
      assert.equal(this, child);
      record("debug", message, context);
    },
    info(message, context) {
      assert.equal(this, child);
      record("info", message, context);
    },
    warn(message, context) {
      assert.equal(this, child);
      record("warn", message, context);
    },
    error(message, error, context) {
      assert.equal(this, child);
      record("error", message, error, context);
    },
    child() {
      return child;
    },
  };
  const logger: Logger = {
    ...child,
    child(context) {
      assert.equal(this, logger);
      record("logger.child", context);
      return child;
    },
  };
  const telemetry: McpTelemetryTracker = {
    registerConnection(input) {
      assert.equal(this, telemetry);
      record("telemetry.register", input);
    },
    unregisterConnection(input) {
      assert.equal(this, telemetry);
      record("telemetry.unregister", input);
    },
    acquireOwner(input) {
      assert.equal(this, telemetry);
      record("telemetry.acquire", input);
    },
    releaseOwner(input) {
      assert.equal(this, telemetry);
      record("telemetry.release", input);
    },
    recordSessionStartup(input) {
      assert.equal(this, telemetry);
      record("telemetry.startup", input);
    },
    recordProcessStarted() {
      assert.fail("pool does not own process starts");
    },
    recordProcessCrashed() {
      assert.fail("pool does not own process crashes");
    },
    recordProcessClosed() {
      assert.fail("pool does not own process closes");
    },
    listProcesses() {
      assert.fail("pool does not probe processes");
    },
    async sampleNow() {
      assert.fail("pool does not sample telemetry");
    },
    start() {
      assert.fail("pool does not start telemetry");
    },
    stop() {
      assert.fail("pool does not stop telemetry");
    },
  };
  const adapters: AdapterControl[] = [];
  const createAdapter = (input: AdapterInput) => {
    const index = adapters.length;
    let control!: AdapterControl;
    const port: McpPort = {
      async connectServer(...args) {
        assert.equal(this, port);
        record("adapter.connect", index, ...args);
        return control.connected;
      },
      async connectConfiguredServers() {
        assert.fail("pool must drive individual connects");
      },
      async disconnectServer() {
        assert.fail("lease disconnect must not disconnect the shared adapter");
      },
      async status() {
        assert.equal(this, port);
        record("adapter.status", index);
        return control.statuses;
      },
      async listTools() {
        assert.equal(this, port);
        record("adapter.tools", index);
        return control.tools;
      },
      async pingServer(...args) {
        assert.equal(this, port);
        record("adapter.ping", index, ...args);
        return true;
      },
      async callTool(...args) {
        assert.equal(this, port);
        record("adapter.call", index, ...args);
        return control.result;
      },
      async close() {
        assert.equal(this, port);
        record("adapter.close", index);
      },
    };
    const connected = status();
    control = {
      input,
      port,
      connected,
      statuses: { [input.serverName]: connected },
      tools: [],
      result: { content: [{ type: "text", text: "owned" }] },
    };
    adapters.push(control);
    return control;
  };
  const options: Pool.McpConnectionPoolOptions = {
    logger,
    telemetry,
    createAdapter(input) {
      assert.equal(this, options);
      record("factory", input);
      return createAdapter(input).port;
    },
  };
  const ownedSet = (...args: Parameters<typeof timer.setTimeout>) => timer.setTimeout(...args);
  const ownedClear = (...args: Parameters<typeof timer.clearTimeout>) =>
    timer.clearTimeout(...args);
  const unsupported = () => {
    throw new Error("unexpected product interval dependency");
  };
  const processView = Object.freeze({});
  const globals = Object.freeze({
    process: processView,
    Date: ClockDate,
    setTimeout: ownedSet,
    clearTimeout: ownedClear,
    setInterval: unsupported,
    clearInterval: unsupported,
  });
  const native = {
    ...crypto,
    randomUUID: (...args: Parameters<typeof crypto.randomUUID>) => {
      record("uuid");
      return crypto.randomUUID(...args);
    },
  };
  const routes: Record<string, unknown> = {
    "node:crypto": native,
    "node:timers": {
      setTimeout: ownedSet,
      clearTimeout: ownedClear,
      setInterval: unsupported,
      clearInterval: unsupported,
    },
  };
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const factories = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  for (const [specifier, url] of [
    ["$entry", targetUrls.entry] as const,
    ...Object.entries(targetUrls.companions),
  ]) {
    const source = await readFile(url, "utf8");
    factories.set(
      specifier,
      (
        await transform(source, {
          loader: "ts",
          format: "cjs",
          target: "node24",
          sourcefile: fileURLToPath(url),
        })
      ).code,
    );
  }
  const requireOwned = (specifier: string): unknown => {
    if (Object.hasOwn(routes, specifier)) return routes[specifier];
    const cached = modules.get(specifier);
    if (cached) return cached.exports;
    const code = factories.get(specifier);
    assert.ok(code, `unapproved dependency ${specifier}`);
    const module = { exports: {} as Record<string, unknown> };
    modules.set(specifier, module);
    new Function(
      "require",
      "module",
      "exports",
      "process",
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "globalThis",
      "global",
      code,
    )(
      requireOwned,
      module,
      module.exports,
      processView,
      ClockDate,
      ownedSet,
      ownedClear,
      unsupported,
      unsupported,
      globals,
      globals,
    );
    return module.exports;
  };
  const api = requireOwned("$entry") as typeof Pool;
  return {
    api,
    options,
    logger,
    child,
    telemetry,
    adapters,
    createAdapter,
    calls,
    record,
    timer,
    timeouts,
    clock,
    makePool: () => api.createMcpConnectionPool(options),
    get time() {
      return time;
    },
    set time(value: number) {
      time = value;
    },
    adapter(index = 0) {
      const item = adapters[index];
      assert.ok(item, `adapter ${index} exists`);
      return item;
    },
    count: (name: string) => calls.filter((call) => call.name === name).length,
    names: () => calls.map((call) => call.name),
    called(name: string, count = 1) {
      const gate = deferred<void>();
      if (calls.filter((call) => call.name === name).length >= count) gate.resolve();
      else waiters.push({ name, count, gate });
      return bounded(gate.promise, `${name} #${count}`);
    },
  };
}
