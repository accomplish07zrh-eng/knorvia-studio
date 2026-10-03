import assert from "node:assert/strict";
import { sep } from "node:path";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

test("synthetic traversal never follows links or opens beyond retained scan authority", async () => {
  const trace: string[] = [];
  const entry = (name: string, kind: string) => ({
    name,
    isSymbolicLink: () => kind === "link",
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
  });
  const tree: Record<string, ReturnType<typeof entry>[]> = {
    [fakeFsPath("/synthetic/root")]: [
      entry("z.log", "file"),
      entry("escape", "link"),
      entry("a", "dir"),
    ],
    [fakeFsPath("/synthetic/root/a")]: [entry("child.log", "file"), entry("deep", "dir")],
    [fakeFsPath("/synthetic/root/a/deep")]: [entry("d3", "dir")],
    [fakeFsPath("/synthetic/root/a/deep/d3")]: [entry("d4", "dir")],
    [fakeFsPath("/synthetic/root/a/deep/d3/d4")]: [
      entry("allowed.log", "file"),
      entry("d5", "dir"),
    ],
    [fakeFsPath("/synthetic/exit")]: [
      entry("nested", "dir"),
      entry("wrong.log", "file"),
      entry("yes.exit.log", "file"),
    ],
    [fakeFsPath("/synthetic/budget")]: Array.from({ length: 2002 }, (_, i) =>
      entry(`ignored-${i}`, "file"),
    ),
  };
  mock.module("node:fs/promises", {
    namedExports: {
      realpath: async (path: string) => {
        trace.push(`realpath:${path}`);
        if (path === fakeFsPath("/synthetic/absent")) throw new Error("synthetic absent");
        return path;
      },
      lstat: async (path: string) => {
        trace.push(`lstat:${path}`);
        return { isDirectory: () => true };
      },
      readdir: async (path: string, options: unknown) => {
        assert.deepEqual(options, { withFileTypes: true });
        trace.push(`readdir:${path}`);
        assert.ok(tree[path], `unexpected traversal authority ${path}`);
        return [...tree[path]];
      },
    },
  });
  const { feedbackArchiveCandidates } =
    await import("../src/feedback/feedbackArchiveCandidates.js");
  const absent = [];
  for await (const candidate of feedbackArchiveCandidates([
    { directory: fakeFsPath("/synthetic/absent"), archivePrefix: "absent" },
  ]))
    absent.push(candidate);
  assert.deepEqual(absent, []);
  assert.deepEqual(trace, [`realpath:${fakeFsPath("/synthetic/absent")}`]);
  trace.length = 0;
  const selected = [];
  for await (const candidate of feedbackArchiveCandidates([
    { directory: fakeFsPath("/synthetic/root"), archivePrefix: "logs" },
    { directory: fakeFsPath("/synthetic/exit"), archivePrefix: "exit", exitLogsOnly: true },
  ]))
    selected.push(candidate);
  assert.deepEqual(selected, [
    { path: fakeFsPath("/synthetic/root/a/child.log"), name: "logs/a/child.log" },
    {
      path: fakeFsPath("/synthetic/root/a/deep/d3/d4/allowed.log"),
      name: "logs/a/deep/d3/d4/allowed.log",
    },
    { path: fakeFsPath("/synthetic/root/z.log"), name: "logs/z.log" },
    { path: fakeFsPath("/synthetic/exit/yes.exit.log"), name: "exit/yes.exit.log" },
  ]);
  assert.equal(
    trace.some(
      (call) =>
        call.includes(`${sep}escape`) || call.includes(`${sep}d5`) || call.includes(`${sep}nested`),
    ),
    false,
  );
  trace.length = 0;
  const bounded = [];
  for await (const candidate of feedbackArchiveCandidates([
    { directory: fakeFsPath("/synthetic/budget"), archivePrefix: "budget" },
    { directory: fakeFsPath("/synthetic/root"), archivePrefix: "later" },
  ]))
    bounded.push(candidate);
  assert.deepEqual(bounded, []);
  assert.deepEqual(trace, [
    `realpath:${fakeFsPath("/synthetic/budget")}`,
    `lstat:${fakeFsPath("/synthetic/budget")}`,
    `readdir:${fakeFsPath("/synthetic/budget")}`,
    `realpath:${fakeFsPath("/synthetic/root")}`,
    `lstat:${fakeFsPath("/synthetic/root")}`,
  ]);
});
