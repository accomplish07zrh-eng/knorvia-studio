import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { mock, test } from "node:test";
const matcherUrl = new URL("./fixtures/ignore-fake-port-20261002.js", import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === "ignore"
      ? { url: matcherUrl, shortCircuit: true }
      : next(specifier, context);
  },
});
const root = "/synthetic/workspace";
const target = resolve(root, ".knorviaignore");
const files = new Map<string, string>([
  [resolve(root, ".gitignore"), "node_modules/\nexisting-rule\n"],
]);
const actions: string[] = [];
const denied = Object.assign(new Error("synthetic rename permission denied"), { code: "EACCES" });
let failRename = false;
mock.module("node:fs/promises", {
  namedExports: {
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined)
        throw Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
      return value;
    },
    open: async (path: string, flags: string, mode: number) => {
      actions.push(`open:${flags}:${mode}`);
      return {
        writeFile: async (content: string) => {
          files.set(path, content);
          actions.push("write-temp");
        },
        sync: async () => {
          actions.push("sync");
        },
        close: async () => {
          actions.push("close");
        },
      };
    },
    rename: async (from: string, to: string) => {
      actions.push("rename");
      if (failRename) throw denied;
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    rm: async (path: string) => {
      actions.push("cleanup");
      files.delete(path);
    },
  },
});
const api = await import("../src/file/workspaceFileIgnore.js");
const { receivedContent } = await import("./fixtures/ignore-fake-port-20261002.js");
test("fake ignore persistence atomically creates, preserves custom section and keeps old target on refusal", async () => {
  try {
    const before = await api.readWorkspaceFileSearchIgnore(root);
    assert.equal(before.source, "template");
    assert.equal(files.has(target), false);
    const logger = { info: () => {}, warn: () => {} };
    const rules = await api.loadWorkspaceFileSearchIgnoreRules(root, logger);
    assert.equal(rules.source, "created-from-gitignore");
    assert.deepEqual(actions, ["open:wx:420", "write-temp", "sync", "close", "rename"]);
    assert.equal(files.get(target), before.content);
    assert.equal(receivedContent.at(-1), before.content);
    assert.equal(
      api.isWorkspaceFileSearchPathIgnored(rules, "synthetic-blocked", "directory"),
      true,
    );
    assert.equal(api.isWorkspaceFileSearchPathIgnored(rules, "synthetic-blocked", "file"), false);
    const custom = before.content + "  synthetic-custom  \n";
    await api.writeWorkspaceFileSearchIgnore(root, custom);
    const transformed = await api.transformWorkspaceFileSearchIgnore(root, "reset-defaults");
    assert.ok(transformed.content.endsWith("  synthetic-custom  \n"));
    assert.equal(files.get(target), custom);
    actions.length = 0;
    failRename = true;
    await assert.rejects(
      api.writeWorkspaceFileSearchIgnore(root, "must not replace"),
      (error) => error === denied,
    );
    assert.equal(files.get(target), custom);
    assert.deepEqual(actions, ["open:wx:420", "write-temp", "sync", "close", "rename", "cleanup"]);
    assert.equal(
      [...files.keys()].some((path) => path.endsWith(".tmp")),
      false,
    );
    files.delete(target);
    let warnings = 0;
    const fallback = await api.loadWorkspaceFileSearchIgnoreRules(root, {
      info: () => {},
      warn: () => {
        warnings++;
      },
    });
    assert.equal(fallback.source, "fallback-gitignore");
    assert.equal(warnings, 1);
    assert.equal(files.has(target), false);
    assert.equal(receivedContent.at(-1), before.content);
  } finally {
    hook.deregister();
  }
});
