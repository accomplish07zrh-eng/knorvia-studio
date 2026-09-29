// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type * as Telemetry from "../src/mcp/telemetry.js";
import type * as Resource from "../src/mcp/resource-telemetry.js";
import type { ProcessProbe, ProcessProbeSample } from "../src/device/process-probe.js";
import type { KnorviaMcpResourceSample, KnorviaMcpTelemetryEvent } from "@knorvia/shared";

export const targetUrls = {
  tracker: new URL("../src/mcp/telemetry.ts", import.meta.url),
  resource: new URL("../src/mcp/resource-telemetry.ts", import.meta.url),
  companions: {} as Record<string, URL>,
  esbuild: new URL(import.meta.resolve("esbuild")),
};
export type TrackerOptions = Parameters<typeof Telemetry.createMcpTelemetryTracker>[0];
export type ResourceOptions = Resource.McpResourceTelemetryOptions;
export type Entry = Resource.McpResourceProcess;
export type Trees = ReadonlyMap<number, readonly ProcessProbeSample[]> | undefined;
export type Event = KnorviaMcpTelemetryEvent;
const setWatchdog = globalThis.setTimeout;
const clearWatchdog = globalThis.clearTimeout;
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
        timer = setWatchdog(() => reject(new Error(`test gate expired: ${label}`)), 3000);
      }),
    ]);
  } finally {
    if (timer) clearWatchdog(timer);
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
export const salted = (name: string, salt = "owned-salt") =>
  crypto.createHmac("sha256", salt).update(name).digest("hex").slice(0, 12);
export function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    instanceId: "instance-A",
    mcpId: "custom:a",
    pid: 11,
    startedAt: 0,
    isCurrent: () => true,
    observed: () => {},
    ...overrides,
  };
}

export async function fixture(integrated = false) {
  const calls: { name: string; args: readonly unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
  };
  let time = 1000;
  const now = () => {
    record("now");
    return time;
  };
  let processes: Entry[] = [];
  let trees: Trees = new Map();
  const events: Event[] = [];
  const groups: KnorviaMcpResourceSample[][] = [];
  const groupReceivers: unknown[] = [];
  const probe: ProcessProbe = {
    treeScope: "process_tree",
    reset() {
      record("probe.reset");
    },
    async sampleProcessTrees(pids) {
      record("probe.sample", pids);
      return trees;
    },
    async sampleProcessGroup() {
      throw new Error("unexpected process-group probe");
    },
  };
  const handles: ReturnType<Resource.McpResourceTimer["setInterval"]>[] = [];
  const intervals: (() => void)[] = [];
  const timer: Resource.McpResourceTimer = {
    setInterval(callback, ms) {
      record("interval.set", callback, ms);
      intervals.push(callback);
      const handle = {
        unref() {
          assert.equal(this, handle);
          record("interval.unref", handle);
        },
      };
      handles.push(handle);
      return handle;
    },
    clearInterval(handle) {
      record("interval.clear", handle);
    },
  };
  const resourceOptions: ResourceOptions = {
    arch: "x64",
    platform: "win32",
    now,
    getProcesses() {
      record("getProcesses");
      return processes;
    },
    onResourceSamples(samples) {
      groupReceivers.push(this);
      groups.push(samples);
      record("resource.notify", samples);
    },
    processProbe: probe,
    logicalCpuCount: 4,
    totalMemoryGb: 8,
    timer,
  };
  let serial = 0;
  const trackerOptions: TrackerOptions = {
    arch: "x64",
    platform: "win32",
    idSalt: "owned-salt",
    now,
    randomId() {
      record("randomId");
      serial += 1;
      return `owned-instance-${serial}`;
    },
    onEvent(event) {
      assert.equal(this, trackerOptions);
      events.push(event);
      record("event", event);
    },
    onResourceSamples(samples) {
      groupReceivers.push(this);
      groups.push(samples);
      record("resource.notify", samples);
    },
    processProbe: probe,
    logicalCpuCount: 4,
    totalMemoryGb: 8,
    timer,
  };
  let capturedResource: ResourceOptions | undefined;
  const stubSampler = {
    async sampleNow() {
      record("stub.sample");
    },
    start() {
      record("stub.start");
    },
    stop() {
      record("stub.stop");
    },
  };
  const os = {
    cpus() {
      record("os.cpus");
      return [{}, {}, {}, {}];
    },
    totalmem() {
      record("os.totalmem");
      return 8 * 1024 ** 3;
    },
  };
  const native = {
    ...crypto,
    randomUUID: (...args: Parameters<typeof crypto.randomUUID>) => {
      record("native.uuid");
      return crypto.randomUUID(...args);
    },
  };
  const processView = Object.freeze({ arch: "arm64", platform: "linux" });
  class ClockDate extends Date {
    static override now() {
      record("native.now");
      return time;
    }
  }
  const createProbe = (...args: unknown[]) => {
    record("probe.create", ...args);
    return probe;
  };
  const ownedSetInterval = (...args: Parameters<Resource.McpResourceTimer["setInterval"]>) =>
    timer.setInterval(...args);
  const ownedClearInterval = (...args: Parameters<Resource.McpResourceTimer["clearInterval"]>) =>
    timer.clearInterval(...args);
  const unsupportedTimer = () => {
    throw new Error("unexpected target timeout dependency");
  };
  const globals = Object.freeze({
    process: processView,
    Date: ClockDate,
    Buffer,
    setInterval: ownedSetInterval,
    clearInterval: ownedClearInterval,
    setTimeout: unsupportedTimer,
    clearTimeout: unsupportedTimer,
  });
  const routes: Record<string, unknown> = {
    "node:crypto": native,
    "node:buffer": { Buffer },
    "node:os": os,
    "node:process": processView,
    "node:timers": timer,
    "@knorvia/shared": { KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS: 300000 },
    "../device/process-probe.js": { createProcessProbe: createProbe },
    "./resource-telemetry.js": {
      createMcpResourceTelemetry(options: ResourceOptions) {
        capturedResource = options;
        record("resource.create", options);
        return integrated ? resourceApi.createMcpResourceTelemetry(options) : stubSampler;
      },
    },
  };
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const factories = new Map<string, string>();
  for (const [specifier, url] of [
    ["$tracker", targetUrls.tracker] as const,
    ["$resource", targetUrls.resource] as const,
    ...Object.entries(targetUrls.companions),
  ]) {
    const source = await readFile(url, "utf8");
    const output = await transform(source, {
      loader: "ts",
      format: "cjs",
      target: "node24",
      sourcefile: fileURLToPath(url),
    });
    factories.set(specifier, output.code);
  }
  const modules = new Map<string, { exports: Record<string, unknown> }>();
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
      "Buffer",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "globalThis",
      "global",
      code,
    )(
      requireOwned,
      module,
      module.exports,
      processView,
      ClockDate,
      Buffer,
      ownedSetInterval,
      ownedClearInterval,
      unsupportedTimer,
      unsupportedTimer,
      globals,
      globals,
    );
    return module.exports;
  };
  const resourceApi = requireOwned("$resource") as typeof Resource;
  const trackerApi = requireOwned("$tracker") as typeof Telemetry;
  return {
    trackerApi,
    resourceApi,
    trackerOptions,
    resourceOptions,
    stubSampler,
    probe,
    timer,
    os,
    events,
    groups,
    groupReceivers,
    calls,
    record,
    handles,
    intervals,
    makeTracker: () => trackerApi.createMcpTelemetryTracker(trackerOptions),
    makeResource: () => resourceApi.createMcpResourceTelemetry(resourceOptions),
    get resourceInput() {
      assert.ok(capturedResource);
      return capturedResource;
    },
    get time() {
      return time;
    },
    set time(value: number) {
      time = value;
    },
    get processes() {
      return processes;
    },
    set processes(value: Entry[]) {
      processes = value;
    },
    get trees() {
      return trees;
    },
    set trees(value: Trees) {
      trees = value;
    },
    count: (name: string) => calls.filter((call) => call.name === name).length,
    names: () => calls.map((call) => call.name),
  };
}
