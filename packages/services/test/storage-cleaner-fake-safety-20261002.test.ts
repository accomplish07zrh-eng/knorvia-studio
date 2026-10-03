import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";
const removals: string[] = [];
const pruned: string[] = [];
mock.module("node:fs/promises", {
  namedExports: {
    readdir: async () => ["synthetic.log"],
    lstat: async () => ({ isFile: () => true, size: 4, mtimeMs: 7 }),
    rm: async (path: string) => {
      removals.push(path);
      if (path.endsWith("blocked.log"))
        throw Object.assign(new Error("synthetic denied"), { code: "EACCES" });
    },
    rmdir: async (path: string) => {
      pruned.push(path);
    },
  },
});
mock.module(new URL("../src/storage/domain/storageCatalog.ts", import.meta.url).href, {
  namedExports: { normalizeStorageRelativePath: (path: string) => path.replaceAll("\\", "/") },
});
mock.module(new URL("../src/storage/adapters/fsWalker.ts", import.meta.url).href, {
  namedExports: {
    walkStorageRoot: async (options: {
      onEntry: (entry: { relativePath: string; bytes: number; mtimeMs: number }) => unknown;
    }) => {
      options.onEntry({ relativePath: "synthetic.log", bytes: 9, mtimeMs: 10 });
    },
  },
});
const { createFsStorageCleaner } = await import("../src/storage/adapters/fsCleaner.js");
test("fake cleaner deletes admitted target, rejects outside path and preserves category directory", async () => {
  const cleaner = createFsStorageCleaner();
  const candidates = await cleaner.listCandidates(fakeFsPath("/synthetic/root"), [
    { prefix: "logs", recursive: false },
    { prefix: "logs", recursive: true },
  ]);
  assert.deepEqual(candidates, [{ relativePath: "logs/synthetic.log", bytes: 9, mtimeMs: 10 }]);
  const result = await cleaner.deleteFiles(
    fakeFsPath("/synthetic/root"),
    [
      { relativePath: "logs/nested/ok.log", bytes: 9, mtimeMs: 0 },
      { relativePath: "../outside.log", bytes: 100, mtimeMs: 0 },
      { relativePath: "logs/blocked.log", bytes: 4, mtimeMs: 0 },
    ],
    { keepDirectories: ["logs"] },
  );
  assert.equal(result.deletedCount, 1);
  assert.equal(result.freedBytes, 9);
  assert.deepEqual(result.failures, [
    { path: "../outside.log", code: "EOUTSIDE" },
    { path: "logs/blocked.log", code: "EACCES" },
  ]);
  assert.deepEqual(removals, [
    fakeFsPath("/synthetic/root/logs/nested/ok.log"),
    fakeFsPath("/synthetic/root/logs/blocked.log"),
  ]);
  assert.deepEqual(pruned, [fakeFsPath("/synthetic/root/logs/nested")]);
});
