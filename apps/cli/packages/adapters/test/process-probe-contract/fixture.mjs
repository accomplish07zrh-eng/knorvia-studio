// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function flush() {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

export function world(files = {}, entries = []) {
  const trace = [];
  const timers = [];
  const clock = {
    schedule(callback, delay) {
      const handle = {
        callback,
        delay,
        cleared: false,
        unrefCount: 0,
        unref() {
          this.unrefCount++;
        },
      };
      timers.push(handle);
      return handle;
    },
    cancel(handle) {
      if (handle) handle.cleared = true;
    },
    expire() {
      const pending = timers.filter((timer) => !timer.cleared);
      assert.ok(pending.length > 0, "Expected a live target deadline");
      for (const timer of pending) timer.callback();
    },
  };
  return {
    trace,
    timers,
    clock,
    async readdir(path) {
      trace.push(["list", path]);
      assert.equal(path, "/proc");
      return entries;
    },
    async readFile(path, encoding) {
      trace.push(["read", path, encoding]);
      assert.equal(encoding, "utf8");
      if (!Object.hasOwn(files, path)) throw new Error("Controlled missing proc file");
      return files[path];
    },
    nativeExec(file, args, options, callback) {
      trace.push(["exec", file, args, options]);
      assert.ok(file === "ps" || file === "tasklist", "Unexpected external command");
      callback(null, "", "");
    },
  };
}

export const result = (stdout = "", extra = {}) => ({ status: 0, stdout, stderr: "", ...extra });
export const stat = (
  pid,
  parent = 0,
  group = pid,
  user = 2,
  system = 3,
  command = "controlled ) worker",
) => `${pid} (${command}) S ${parent} ${group} 0 0 0 0 0 0 0 0 ${user} ${system} 0 0`;
export function proc(pid, parent = 0, group = pid, rss = 12, cpu = [2, 3]) {
  return {
    [`/proc/${pid}/stat`]: stat(pid, parent, group, ...cpu),
    [`/proc/${pid}/status`]: `Name:\tcontrolled\nVmRSS:\t${rss} kB\n`,
  };
}
export const rows = (map) => (map === undefined ? undefined : [...map]);
export const readers = (w) => ({
  listProcDirectory: () => w.readdir("/proc"),
  readProcFile: (path) => w.readFile(path, "utf8"),
});
