// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { JSONRPCMessage } from "@modelcontextprotocol/client";
import type { StdioServerParameters } from "@modelcontextprotocol/client/stdio";
import type * as Stdio from "../src/mcp/stdio-transport.js";
import type * as Tree from "../src/mcp/process-tree.js";
import type * as Job from "../src/mcp/windows-job-object.js";
import { systemFixture } from "./mcp-process-boundary-system.fixture.js";

export const targetUrls = {
  stdio: new URL("../src/mcp/stdio-transport.ts", import.meta.url),
  processTree: new URL("../src/mcp/process-tree.ts", import.meta.url),
  windowsJob: new URL("../src/mcp/windows-job-object.ts", import.meta.url),
  companions: {} as Record<string, URL>,
  esbuild: new URL(import.meta.resolve("esbuild")),
};
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
        timer = setTimeout(() => reject(new Error("owned gate expired: " + label)), 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection");
}
export class OwnedChild {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly listeners: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = [];
  constructor(public pid = 42) {}
  once(event: string, callback: (code: number | null, signal: NodeJS.Signals | null) => void) {
    assert.equal(event, "exit");
    this.listeners.push(callback);
    return this;
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    for (const listener of this.listeners.splice(0)) listener(code, signal);
  }
}
type DisposeMode = "captured" | "absent" | "getter" | "inherited" | "nonfunction";
export async function fixture(mode: DisposeMode = "captured") {
  const system = systemFixture();
  const { record } = system;
  const sdk = {
    construct(_server: StdioServerParameters, _transport: OwnedSdk) {},
    async start(_transport: OwnedSdk) {},
    async send(_transport: OwnedSdk, _message: JSONRPCMessage) {},
    async close(_transport: OwnedSdk) {},
    async dispose(_transport: OwnedSdk) {},
    child: undefined as OwnedChild | undefined,
  };
  class OwnedSdk {
    _process: OwnedChild | undefined;
    constructor(server: StdioServerParameters) {
      record("sdk.construct", server, this);
      sdk.construct(server, this);
    }
    async start() {
      record("sdk.start", this);
      await sdk.start(this);
      this._process = sdk.child;
    }
    async send(message: JSONRPCMessage) {
      record("sdk.send", this, message);
      await sdk.send(this, message);
    }
    async close() {
      record("sdk.close", this);
      await sdk.close(this);
    }
    get pid() {
      record("sdk.pid", this);
      return this._process?.pid ?? null;
    }
    get stderr() {
      return null;
    }
  }
  const originalDispose = async function (this: OwnedSdk) {
    record("sdk.dispose", this);
    await sdk.dispose(this);
  };
  if (mode === "captured")
    Object.defineProperty(OwnedSdk.prototype, "_dispose", {
      value: originalDispose,
      configurable: true,
    });
  if (mode === "getter")
    Object.defineProperty(OwnedSdk.prototype, "_dispose", {
      get() {
        assert.fail("capturing dispose must not invoke a getter");
      },
      configurable: true,
    });
  if (mode === "inherited")
    Object.setPrototypeOf(OwnedSdk.prototype, { _dispose: originalDispose });
  if (mode === "nonfunction")
    Object.defineProperty(OwnedSdk.prototype, "_dispose", { value: {}, configurable: true });
  const links = {
    async terminate(pid: number) {
      record("tree.terminate", pid);
    },
    async attach(this: unknown, pid: number): Promise<Job.WindowsJobObjectController | undefined> {
      record("job.attach", pid, this);
      return undefined;
    },
  };
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const sourceCode = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const transforms: { key: string; koffiImports: number }[] = [];
  for (const [key, url] of [
    ["$stdio", targetUrls.stdio] as const,
    ["$tree", targetUrls.processTree] as const,
    ["$job", targetUrls.windowsJob] as const,
    ...Object.entries(targetUrls.companions),
  ]) {
    const source = await readFile(url, "utf8");
    const compiled = (
      await transform(source, {
        loader: "ts",
        format: "cjs",
        target: "node24",
        legalComments: "none",
        sourcefile: fileURLToPath(url),
      })
    ).code;
    let count = 0;
    const replaced = compiled.replace(/\bimport\(\s*(["'])koffi\1\s*\)/g, () => {
      count++;
      return "__ownedImportKoffi()";
    });
    assert.equal(
      /\bimport\s*\(/.test(replaced),
      false,
      "unapproved dynamic import in bound module " + key,
    );
    transforms.push({ key, koffiImports: count });
    sourceCode.set(key, replaced);
  }
  const routes: Record<string, unknown> = {
    "@modelcontextprotocol/client/stdio": { StdioClientTransport: OwnedSdk },
    "node:process": system.processView,
    "node:child_process": system.childProcess,
    "node:timers": system.timer,
    "./process-tree.js": { terminateMcpStdioProcessTree: (pid: number) => links.terminate(pid) },
    "./windows-job-object.js": {
      attachProcessToWindowsJobObject: function (this: unknown, pid: number) {
        return links.attach.call(this, pid);
      },
    },
  };
  const requireOwned = (key: string): unknown => {
    if (Object.hasOwn(routes, key)) return routes[key];
    const loaded = modules.get(key);
    if (loaded) return loaded.exports;
    const source = sourceCode.get(key);
    assert.ok(source, "unapproved dependency " + key);
    const module = { exports: {} as Record<string, unknown> };
    modules.set(key, module);
    const globals = Object.freeze({
      process: system.processView,
      Date: system.OwnedDate,
      setTimeout: system.timer.setTimeout,
      clearTimeout: system.timer.clearTimeout,
    });
    new Function(
      "require",
      "module",
      "exports",
      "process",
      "Date",
      "setTimeout",
      "clearTimeout",
      "globalThis",
      "global",
      "__ownedImportKoffi",
      source,
    )(
      requireOwned,
      module,
      module.exports,
      system.processView,
      system.OwnedDate,
      system.timer.setTimeout,
      system.timer.clearTimeout,
      globals,
      globals,
      () => system.imports.load(),
    );
    return module.exports;
  };
  const stdio = requireOwned("$stdio") as typeof Stdio;
  const tree = requireOwned("$tree") as typeof Tree;
  const job = requireOwned("$job") as typeof Job;
  return {
    ...system,
    sdk,
    OwnedSdk,
    originalDispose,
    links,
    stdio,
    tree,
    job,
    transforms,
    get time() {
      return system.time;
    },
    set time(value: number) {
      system.time = value;
    },
    transport: (
      server: ConstructorParameters<typeof Stdio.ProcessTreeStdioClientTransport>[0] = {
        command: "owned",
      },
      options?: ConstructorParameters<typeof Stdio.ProcessTreeStdioClientTransport>[1],
    ) => new stdio.ProcessTreeStdioClientTransport(server, options),
    dispose(transport: Stdio.ProcessTreeStdioClientTransport) {
      const descriptor = Object.getOwnPropertyDescriptor(
        stdio.ProcessTreeStdioClientTransport.prototype,
        "_dispose",
      );
      assert.ok(descriptor);
      assert.equal(typeof descriptor.value, "function");
      return Reflect.apply(
        descriptor.value as (...args: unknown[]) => Promise<void>,
        transport,
        [],
      );
    },
  };
}
