import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic traversal never follows links or opens beyond retained scan authority", async () => {
  const trace: string[] = [];
  const entry = (name: string, kind: string) => ({
    name,
    isSymbolicLink: () => kind === "link",
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
  });
  const tree: Record<string, ReturnType<typeof entry>[]> = {
    "/synthetic/root": [entry("z.log", "file"), entry("escape", "link"), entry("a", "dir")],
    "/synthetic/root/a": [entry("child.log", "file"), entry("deep", "dir")],
    "/synthetic/root/a/deep": [entry("d3", "dir")],
    "/synthetic/root/a/deep/d3": [entry("d4", "dir")],
    "/synthetic/root/a/deep/d3/d4": [entry("allowed.log", "file"), entry("d5", "dir")],
    "/synthetic/exit": [
      entry("nested", "dir"),
      entry("wrong.log", "file"),
      entry("yes.exit.log", "file"),
    ],
    "/synthetic/budget": Array.from({ length: 2002 }, (_, i) => entry(`ignored-${i}`, "file")),
  };
  mock.module("node:fs/promises", {
    namedExports: {
      realpath: async (path: string) => {
        trace.push(`realpath:${path}`);
        if (path === "/synthetic/absent") throw new Error("synthetic absent");
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
    { directory: "/synthetic/absent", archivePrefix: "absent" },
  ]))
    absent.push(candidate);
  assert.deepEqual(absent, []);
  assert.deepEqual(trace, ["realpath:/synthetic/absent"]);
  trace.length = 0;
  const selected = [];
  for await (const candidate of feedbackArchiveCandidates([
    { directory: "/synthetic/root", archivePrefix: "logs" },
    { directory: "/synthetic/exit", archivePrefix: "exit", exitLogsOnly: true },
  ]))
    selected.push(candidate);
  assert.deepEqual(selected, [
    { path: "/synthetic/root/a/child.log", name: "logs/a/child.log" },
    { path: "/synthetic/root/a/deep/d3/d4/allowed.log", name: "logs/a/deep/d3/d4/allowed.log" },
    { path: "/synthetic/root/z.log", name: "logs/z.log" },
    { path: "/synthetic/exit/yes.exit.log", name: "exit/yes.exit.log" },
  ]);
  assert.equal(
    trace.some(
      (call) => call.includes("/escape") || call.includes("/d5") || call.includes("/nested"),
    ),
    false,
  );
  trace.length = 0;
  const bounded = [];
  for await (const candidate of feedbackArchiveCandidates([
    { directory: "/synthetic/budget", archivePrefix: "budget" },
    { directory: "/synthetic/root", archivePrefix: "later" },
  ]))
    bounded.push(candidate);
  assert.deepEqual(bounded, []);
  assert.deepEqual(trace, [
    "realpath:/synthetic/budget",
    "lstat:/synthetic/budget",
    "readdir:/synthetic/budget",
    "realpath:/synthetic/root",
    "lstat:/synthetic/root",
  ]);
});
