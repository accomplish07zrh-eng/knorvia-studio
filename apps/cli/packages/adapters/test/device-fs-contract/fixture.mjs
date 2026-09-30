// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import nodePath from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

export const root = nodePath.sep === "\\" ? "C:\\controlled" : "/controlled";
export const path = (...parts) => nodePath.join(root, ...parts);
export function ioError(code, message = `Controlled ${code}`) {
  return Object.assign(new Error(message), { code });
}
export function info(kind = "file", size = 0, mtimeMs = 1000.75, mode = 0o644) {
  return {
    size,
    mtimeMs,
    mode,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => kind === "symlink",
  };
}
export function directoryEntry(name, kind = "file") {
  return { name, ...info(kind) };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export function world() {
  const files = new Map();
  const metadata = new Map();
  const events = [];
  const scheduled = [];
  const workerEvents = [];
  const w = {
    files,
    metadata,
    events,
    scheduled,
    workerEvents,
    now: 1000,
    random: 0.25,
    home: path("home"),
    defaultId: "11111111-1111-4111-8111-111111111111",
    process: {
      env: {},
      pid: 47,
      platform: process.platform,
      cwd: () => root,
      kill: (pid, signal) => {
        events.push(["kill", pid, signal]);
        throw ioError("ESRCH");
      },
    },
    paths: { ...nodePath, resolve: (...args) => nodePath.resolve(root, ...args) },
    put(name, bytes, kind = "file", extra = {}) {
      const p = path(name);
      const b = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes ?? "");
      files.set(p, b);
      metadata.set(p, { ...info(kind, b.length), ...extra });
      return p;
    },
    fault(request) {
      events.push(["fault", request.operation, request.path]);
    },
    randomBytes(size) {
      return Buffer.alloc(size, 0x7f);
    },
    setTimeout(callback, delay) {
      const handle = {
        callback,
        delay,
        unref() {
          events.push(["timer.unref"]);
        },
      };
      scheduled.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      const index = scheduled.indexOf(handle);
      if (index !== -1) scheduled.splice(index, 1);
    },
    async mkdir(p, options) {
      events.push(["mkdir", p, options]);
      metadata.set(p, info("directory"));
    },
    async stat(p) {
      events.push(["stat", p]);
      const v = metadata.get(p);
      if (!v) throw ioError("ENOENT");
      return v;
    },
    async lstat(p) {
      events.push(["lstat", p]);
      const v = metadata.get(p);
      if (!v) throw ioError("ENOENT");
      return v;
    },
    async readFile(p, encoding) {
      events.push(["readFile", p, encoding]);
      const b = files.get(p);
      if (!b) throw ioError("ENOENT");
      return encoding ? b.toString(encoding) : Buffer.from(b);
    },
    async writeFile(p, data, encoding) {
      events.push(["writeFile", p, encoding]);
      const b = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, encoding);
      files.set(p, b);
      metadata.set(p, info("file", b.length));
    },
    async rename(from, to) {
      events.push(["rename", from, to]);
      if (!files.has(from)) throw ioError("ENOENT");
      files.set(to, files.get(from));
      metadata.set(to, metadata.get(from));
      files.delete(from);
      metadata.delete(from);
    },
    async unlink(p) {
      events.push(["unlink", p]);
      if (!files.has(p)) throw ioError("ENOENT");
      files.delete(p);
      metadata.delete(p);
    },
    async readdir(p, options) {
      events.push(["readdir", p, options]);
      assert.fail(`Unconfigured directory read: ${p}`);
    },
    async open(p, flags) {
      events.push(["open", p, flags]);
      if (flags === "wx" && files.has(p)) throw ioError("EEXIST");
      if (flags === "r" && !files.has(p)) throw ioError("ENOENT");
      if (flags !== "r") {
        files.set(p, Buffer.alloc(0));
        metadata.set(p, info("file"));
      }
      return {
        async read(buffer, offset, length, position) {
          events.push(["read", p, length, position]);
          const b = files.get(p) ?? Buffer.alloc(0);
          const n = b.copy(buffer, offset, position, position + length);
          return { bytesRead: n, buffer };
        },
        async writeFile(data, encoding) {
          events.push(["handle.writeFile", p]);
          const b = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, encoding);
          files.set(p, b);
          metadata.set(p, info("file", b.length));
        },
        async chmod(mode) {
          events.push(["chmod", p, mode]);
          metadata.get(p).mode = mode;
        },
        async sync() {
          events.push(["sync", p]);
        },
        async close() {
          events.push(["close", p]);
        },
      };
    },
    createReadStream(p) {
      events.push(["stream", p]);
      const b = files.get(p);
      if (!b) throw ioError("ENOENT");
      return Readable.from(w.chunks ?? [b]);
    },
    worker(...args) {
      events.push(["worker", ...args]);
      const worker = new EventEmitter();
      worker.terminate = () => {
        workerEvents.push("terminate");
        return Promise.resolve(0);
      };
      w.lastWorker = worker;
      return worker;
    },
  };
  return w;
}

export function portable(value) {
  if (value === undefined) return { $undefined: true };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return {
      type: Buffer.isBuffer(value) ? "Buffer" : "Uint8Array",
      bytes: Buffer.from(value).toString("hex"),
    };
  if (typeof value === "number" && !Number.isFinite(value)) return { $number: String(value) };
  if (value instanceof Error) {
    const out = { name: value.name, message: portable(value.message) };
    for (const key of ["code", "path", "cause"]) if (key in value) out[key] = portable(value[key]);
    return out;
  }
  if (typeof value === "string" && value.includes(root))
    return value.replaceAll(root, "$ROOT").replaceAll(nodePath.sep, "/");
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, portable(v)]));
  return value;
}
