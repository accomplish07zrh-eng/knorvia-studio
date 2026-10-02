import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

test("fake traversal keeps link refusal, LIFO ordering, failure isolation and cancellation", async (t) => {
  const root = join("/", "synthetic", "storage");
  const openOrder: string[] = [];
  const statPaths: string[] = [];
  const closePaths: string[] = [];
  const errors: { path: string; code: string }[] = [];
  const entries: { relativePath: string; bytes: number; mtimeMs: number }[] = [];
  let mode = "normal";
  const dirent = (name: string, kind: "file" | "directory" | "link") => ({
    name,
    isSymbolicLink: () => kind === "link",
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
  });
  t.mock.module("node:fs/promises", {
    namedExports: {
      opendir: async (path: string) => {
        openOrder.push(path);
        if (mode === "missing") throw Object.assign(new Error("absent"), { code: "ENOENT" });
        if (mode === "denied" || path === join(root, "denied"))
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        const content =
          path === root
            ? [
                dirent("a", "directory"),
                dirent("b", "directory"),
                dirent("denied", "directory"),
                dirent("escape", "link"),
                dirent("kept", "file"),
                dirent("gone", "file"),
                dirent("private", "file"),
                dirent("changed", "file"),
              ]
            : [dirent("nested", "file")];
        return {
          async *[Symbol.asyncIterator]() {
            yield* content;
          },
          close: async () => {
            closePaths.push(path);
          },
        };
      },
      lstat: async (path: string) => {
        statPaths.push(path);
        if (path.endsWith("gone")) throw Object.assign(new Error("race"), { code: "ENOENT" });
        if (path.endsWith("private")) throw Object.assign(new Error("denied"), { code: "EPERM" });
        return { isFile: () => !path.endsWith("changed"), size: 7, mtimeMs: 123 };
      },
    },
  });
  const { walkStorageRoot } = await import("../src/storage/adapters/fsWalker.js");
  const result = await walkStorageRoot({
    rootPath: root,
    concurrency: 1,
    yieldEvery: 1,
    onEntry: (entry) => entries.push(entry),
    onError: (error) => errors.push(error),
  });
  assert.deepEqual(result, { directoriesScanned: 3, filesScanned: 3, missingRoot: false });
  assert.deepEqual(openOrder, [root, join(root, "denied"), join(root, "b"), join(root, "a")]);
  assert.deepEqual(
    entries.map((e) => e.relativePath),
    ["kept", "b/nested", "a/nested"],
  );
  assert.equal(
    statPaths.some((path) => path.endsWith("escape")),
    false,
  );
  assert.deepEqual(errors, [
    { path: "private", code: "EPERM" },
    { path: "denied", code: "EACCES" },
  ]);
  assert.equal(closePaths.length, 3);
  const capturedEntries: string[] = [];
  const mutableOptions = {
    rootPath: root,
    concurrency: 1,
    onEntry: (entry: { relativePath: string }) => capturedEntries.push(entry.relativePath),
    signal: new AbortController().signal,
  };
  const capturedScan = walkStorageRoot(mutableOptions);
  mutableOptions.rootPath = join(root, "escaped");
  mutableOptions.onEntry = () => assert.fail("caller replaced captured callback");
  mutableOptions.signal = AbortSignal.abort();
  await capturedScan;
  assert.deepEqual(capturedEntries, ["kept", "b/nested", "a/nested"]);
  mode = "missing";
  assert.deepEqual(
    await walkStorageRoot({ rootPath: root, onEntry: () => assert.fail("missing root emitted") }),
    { directoriesScanned: 0, filesScanned: 0, missingRoot: true },
  );
  mode = "denied";
  const deniedErrors: { path: string; code: string }[] = [];
  assert.deepEqual(
    await walkStorageRoot({
      rootPath: root,
      onEntry: () => assert.fail("denied root emitted"),
      onError: (e) => deniedErrors.push(e),
    }),
    { directoriesScanned: 0, filesScanned: 0, missingRoot: false },
  );
  assert.deepEqual(deniedErrors, [{ path: "", code: "EACCES" }]);
  mode = "normal";
  const cancellation = new AbortController();
  const beforeCloses = closePaths.length;
  await assert.rejects(
    walkStorageRoot({
      rootPath: root,
      concurrency: 1,
      yieldEvery: 1,
      signal: cancellation.signal,
      onEntry: () => cancellation.abort(),
    }),
    { name: "AbortError", message: "storage scan aborted" },
  );
  assert.equal(closePaths.length, beforeCloses + 1);
  const beforeOpens = openOrder.length;
  await assert.rejects(
    walkStorageRoot({
      rootPath: root,
      signal: cancellation.signal,
      onEntry: () => assert.fail("aborted entry"),
    }),
    { name: "AbortError" },
  );
  assert.equal(openOrder.length, beforeOpens);
});
