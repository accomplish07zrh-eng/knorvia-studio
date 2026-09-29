// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import type * as Tree from "../src/mcp/process-tree.js";
import type * as Job from "../src/mcp/windows-job-object.js";
import type * as Koffi from "koffi";

export type TreeOptions = NonNullable<Parameters<typeof Tree.terminateMcpStdioProcessTree>[1]>;
export type CommandResult = Awaited<ReturnType<NonNullable<TreeOptions["execFile"]>>>;
export type JobApi = NonNullable<
  NonNullable<Parameters<typeof Job.attachProcessToWindowsJobObject>[1]>["api"]
>;
export type NativeCallback = (error: unknown, stdout: string, stderr: string) => void;
export const commandResult = (values: Partial<CommandResult> = {}): CommandResult => ({
  status: 0,
  stderr: "",
  stdout: "",
  ...values,
});

export function systemFixture() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
  };
  const alive = new Set<number>([42]);
  let time = 1000;
  const behavior = {
    signal(_pid: number, _signal: number | string | undefined) {},
    async sleep(_ms: number) {},
    async command(
      _file: string,
      _args: readonly string[],
      _options: ExecFileOptionsWithStringEncoding,
    ): Promise<CommandResult> {
      return commandResult({ status: 1 });
    },
    nativeExec(
      _file: string,
      _args: string[],
      _options: ExecFileOptionsWithStringEncoding,
      callback: NativeCallback,
    ) {
      callback(null, "", "");
    },
  };
  const ports: Required<TreeOptions> = {
    platform: "linux",
    kill: function (pid, signal) {
      assert.equal(this, undefined);
      record("kill", pid, signal);
      if (signal === 0 && !alive.has(pid)) throw { code: "ESRCH" };
      behavior.signal(pid, signal);
      return true;
    },
    now: function () {
      assert.equal(this, undefined);
      record("now");
      return time;
    },
    sleep: async function (ms) {
      assert.equal(this, undefined);
      record("sleep", ms);
      time += ms;
      await behavior.sleep(ms);
    },
    execFile: async function (file, args, options) {
      assert.equal(this, undefined);
      record("command", file, args, options);
      return behavior.command(file, args, options);
    },
  };
  const clock = {
    now() {
      record("native.now");
      return time;
    },
  };
  class OwnedDate extends Date {
    static override now() {
      return clock.now();
    }
  }
  const processView = { platform: "linux" as NodeJS.Platform, kill: ports.kill };
  const timer = {
    setTimeout(callback: () => void, ms: number) {
      record("timer", ms);
      time += ms;
      callback();
      return { owned: true };
    },
    clearTimeout(_handle: unknown) {
      assert.fail("terminator default sleep must not clear a timer");
    },
  };
  const childProcess = {
    execFile(
      file: string,
      args: string[],
      options: ExecFileOptionsWithStringEncoding,
      callback: NativeCallback,
    ) {
      record("native.exec", file, args, options);
      return behavior.nativeExec(file, args, options, callback);
    },
  };
  const nativeActions = new Map<string, (...args: unknown[]) => unknown>();
  let serial = 0;
  const native = (name: string, args: unknown[]) => {
    record("native.call", name, ...args);
    const action = nativeActions.get(name);
    if (action) return action(...args);
    if (name === "CreateJobObjectW") return { kind: "job", serial: ++serial };
    if (name === "OpenProcess") return { kind: "process", pid: args[2] };
    if (name === "TerminateJobObject" || name === "CloseHandle") return false;
    return true;
  };
  const type = (label: unknown) => Object.assign({ __brand: "IKoffiCType" as const }, { label });
  const library = {
    func(...args: unknown[]) {
      record("native.bind", ...args);
      const name = String(args[1]);
      return (...values: unknown[]) => native(name, values);
    },
  };
  const koffi = {
    load(path: string | null) {
      record("native.load", path);
      return library;
    },
    opaque(...args: unknown[]) {
      record("native.opaque", ...args);
      return type("opaque");
    },
    pointer(...args: unknown[]) {
      record("native.pointer", ...args);
      return type({ pointer: args });
    },
    struct(...args: unknown[]) {
      record("native.struct", ...args);
      return type(args[0]);
    },
    sizeof(value: unknown) {
      record("native.sizeof", value);
      return 144;
    },
  };
  const imports = {
    namespace: { default: koffi } as unknown,
    async load() {
      record("native.import");
      return imports.namespace;
    },
  };
  const handle = { owned: "injected job" };
  const api: JobApi = {
    create() {
      assert.equal(this, api);
      record("job.create");
      return handle;
    },
    assign(job, pid) {
      assert.equal(this, api);
      record("job.assign", job, pid);
      return true;
    },
    terminate(job) {
      assert.equal(this, api);
      record("job.terminate", job);
    },
    close(job) {
      assert.equal(this, api);
      record("job.close", job);
    },
  };
  return {
    calls,
    record,
    alive,
    behavior,
    ports,
    clock,
    OwnedDate,
    processView,
    timer,
    childProcess,
    nativeActions,
    koffi,
    library,
    imports,
    handle,
    api,
    typedKoffi: koffi as unknown as typeof Koffi,
    get time() {
      return time;
    },
    set time(value: number) {
      time = value;
    },
    count: (name: string) => calls.filter((call) => call.name === name).length,
    events: (name: string) => calls.filter((call) => call.name === name).map((call) => call.args),
    names: () => calls.map((call) => call.name),
  };
}
