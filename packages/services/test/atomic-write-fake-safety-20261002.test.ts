import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";
const actions: string[] = [];
let failRename: unknown;
let failLock: unknown;
const target = fakeFsPath("/synthetic/config.json");
const original = "original synthetic bytes";
const files = new Map<string, string>([[target, original]]);
let renameCalls = 0;
mock.module("node:fs/promises", {
  namedExports: {
    mkdir: async (path: string) => {
      actions.push(`mkdir:${path}`);
    },
    writeFile: async (path: string, content: string) => {
      actions.push(`write:${path}`);
      files.set(path, content);
    },
    rename: async (from: string, to: string) => {
      actions.push(`rename:${to}`);
      renameCalls++;
      if (failRename) {
        const error = failRename;
        failRename = undefined;
        throw error;
      }
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    rm: async (path: string) => {
      actions.push(`rm:${path}`);
      files.delete(path);
    },
    readdir: async () => ["config.json.stale.tmp", "config.json.young.tmp", "different.stale.tmp"],
    stat: async (path: string) => ({ mtimeMs: path.includes("young") ? 999 : 0 }),
  },
});
mock.module("node:timers/promises", {
  namedExports: {
    setTimeout: async (delay: number) => {
      actions.push(`sleep:${delay}`);
    },
  },
});
mock.module("@knorvia/shared/node", {
  namedExports: {
    acquireFileLock: async (path: string) => {
      actions.push(`lock:${path}`);
      if (failLock) throw failLock;
      return async () => {
        actions.push("release");
      };
    },
  },
});
mock.module(new URL("../src/fs/fsFaultInjection.ts", import.meta.url).href, {
  namedExports: {
    isInjectedFsFaultError: (error: unknown) =>
      Boolean((error as { injected?: boolean })?.injected),
    maybeThrowInjectedFsFault: () => {},
  },
});
const { atomicWriteText, atomicWriteJson } = await import("../src/fs/atomicFileUtils.js");
test("fake atomic write preserves targets, retries only admitted errors and cleans/release on failure", async () => {
  mock.method(Date, "now", () => 1000);
  mock.method(Math, "random", () => 0.5);
  try {
    failRename = Object.assign(new Error("synthetic busy"), { code: "EPERM" });
    await atomicWriteJson(
      target,
      { synthetic: true },
      { renameRetryDelaysMs: [5], tempFileStaleMs: 500 },
    );
    assert.equal(files.get(target), JSON.stringify({ synthetic: true }, null, 2));
    assert.equal(renameCalls, 2);
    assert.ok(actions.includes("sleep:5"));
    assert.ok(actions.includes(`rm:${fakeFsPath("/synthetic/config.json.stale.tmp")}`));
    assert.equal(actions.includes(`rm:${fakeFsPath("/synthetic/config.json.young.tmp")}`), false);
    assert.equal(actions.includes(`rm:${fakeFsPath("/synthetic/different.stale.tmp")}`), false);
    assert.equal(actions.at(-1), "release");
    const refusal = Object.assign(new Error("synthetic injected permission refusal"), {
      code: "EPERM",
      injected: true,
    });
    failRename = refusal;
    actions.length = 0;
    renameCalls = 0;
    const saved = files.get(target);
    await assert.rejects(
      atomicWriteText(target, "must not replace", { renameRetryDelaysMs: [5] }),
      (error) => error === refusal,
    );
    assert.equal(files.get(target), saved);
    assert.equal(renameCalls, 1);
    assert.equal(
      actions.some((action) => action.startsWith("sleep:")),
      false,
    );
    assert.equal(actions.at(-1), "release");
    assert.equal(
      [...files.keys()].some((path) => path.endsWith(".tmp")),
      false,
    );
    const lockDenied = new Error("synthetic lock denied");
    failLock = lockDenied;
    actions.length = 0;
    await assert.rejects(atomicWriteText(target, "denied"), (error) => error === lockDenied);
    assert.equal(
      actions.some((action) => action.startsWith("write:") || action === "release"),
      false,
    );
    assert.equal(files.get(target), saved);
  } finally {
    mock.restoreAll();
  }
});
