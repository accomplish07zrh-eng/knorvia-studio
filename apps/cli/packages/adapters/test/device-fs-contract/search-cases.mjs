// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { world, info, ioError, portable, directoryEntry, path } from "./fixture.mjs";

const root = path("tree");
export function searchWorld() {
  const w = world();
  const rows = [
    ["b.js", "before\nTARGET target\nend\n", 3],
    ["a.txt", "start\r\nTarget target\r\n\r\nnext\rlone\nlast", 3],
    ["deep/z.ts", "one\ntarget\nthree\ntarget\n", 5],
    ["deep/q.txt", "a\nb\nc\n", 1],
    ["binary.txt", "target\0", 7],
    [".hidden.md", "target\n", 2],
    [".git/ignored.txt", "target", 9],
    ["deep/.svn/ignored.txt", "target", 9],
  ];
  for (const [name, text, mtimeMs] of rows) w.put("tree/" + name, text, "file", { mtimeMs });
  for (const name of ["", "deep", ".git", "deep/.svn"])
    w.put(name ? "tree/" + name : "tree", "", "directory");
  const dirs = new Map([
    [
      root,
      [
        directoryEntry("b.js"),
        directoryEntry("a.txt"),
        directoryEntry("deep", "directory"),
        directoryEntry(".git", "directory"),
        directoryEntry("shortcut", "symlink"),
        directoryEntry("binary.txt"),
        directoryEntry(".hidden.md"),
      ],
    ],
    [
      path("tree/deep"),
      [directoryEntry("z.ts"), directoryEntry("q.txt"), directoryEntry(".svn", "directory")],
    ],
  ]);
  w.readdir = async (p, opts) => {
    w.events.push(["readdir", p, opts]);
    if (!dirs.has(p)) throw ioError("ENOENT");
    return dirs.get(p);
  };
  return w;
}
const modes = ["content", "files_with_matches", "count"];
export const searchInputs = [
  ...["*", "*.txt", "**/*.ts", "deep/?*", "{a,b}.txt", "./deep\\*.ts", "[a].txt", " ", "**/*"].map(
    (pattern) => ({ op: "searchFiles", pattern }),
  ),
  ...[0, 1, 2, -1, NaN, Infinity].map((offset) => ({
    op: "searchFiles",
    pattern: "*",
    offset,
    maxResults: 2,
  })),
  ...[0, -1, 1, NaN, Infinity].map((maxResults) => ({
    op: "searchFiles",
    pattern: "*",
    maxResults,
  })),
  ...modes.flatMap((outputMode) => [
    { outputMode },
    { outputMode, ignoreCase: true },
    { outputMode, onlyMatching: true },
    { outputMode, onlyMatching: true, ignoreCase: true, context: 1 },
    { outputMode, multiline: true, pattern: "target[\\s\\S]*?three" },
    {
      outputMode,
      multiline: true,
      onlyMatching: true,
      pattern: "target[\\s\\S]*?three",
      context: 2,
    },
    { outputMode, pattern: "(?=target)", onlyMatching: true },
    { outputMode, pattern: "^", multiline: true, onlyMatching: true },
    { outputMode, glob: "**/*.ts" },
    { outputMode, type: "JS" },
    { outputMode, headLimit: 1, offset: 1 },
    { outputMode, headLimit: 0, offset: 1 },
    { outputMode, beforeContext: 2, afterContext: 1, context: 0 },
    { outputMode, glob: "*.txt *.js" },
    { outputMode, glob: "{*.txt,*.js}" },
  ]),
  ...[NaN, Infinity, -1, 0, 1.7].map((offset) => ({ outputMode: "content", offset, headLimit: 2 })),
  ...[NaN, Infinity, -1, 0, 1.7].map((headLimit) => ({ outputMode: "content", headLimit })),
  { pattern: "[" },
  { pattern: " " },
  { pattern: "absent" },
  { file: "a.txt", onlyMatching: true, context: 1, ignoreCase: true },
  { file: "binary.txt" },
  { kind: "other" },
  { aborted: true },
  { readFails: true },
  { statFails: true },
  { context: 1.5 },
  { context: -1 },
  { context: NaN },
  { multiline: true, onlyMatching: true, pattern: "\\n", context: 1 },
  { op: "searchFiles", pattern: "*", nanMtime: true },
  { nanMtime: true },
  ...[
    "result",
    "count",
    "invalid-json",
    "code2-regex",
    "code2-permission",
    "code2-notfound",
    "code3",
    "runtime-error",
    "worker-error",
    "unknown",
    "exit",
    "timeout",
    "abort",
  ].map((worker) => ({
    engine: "ripgrep",
    worker,
    outputMode: worker === "count" ? "count" : "content",
    onlyMatching: worker === "result",
  })),
  { engine: "ripgrep", worker: "result", glob: "*.ts", type: "txt" },
  {
    engine: "ripgrep",
    worker: "count",
    glob: "*.txt",
    type: "txt",
    outputMode: "files_with_matches",
  },
  {
    engine: "ripgrep",
    worker: "count",
    multiline: true,
    ignoreCase: true,
    context: 0,
    beforeContext: 2,
    afterContext: 3,
    type: "js",
    glob: "*.txt,*.js {*.ts,*.md}",
    file: "a.txt",
  },
];

export async function observeSearch(loaded, input) {
  const w = searchWorld();
  const p = input.file ? path("tree", input.file) : root;
  if (input.nanMtime)
    w.metadata.set(path("tree/b.js"), { ...w.metadata.get(path("tree/b.js")), mtimeMs: NaN });
  if (input.kind) w.metadata.set(p, info(input.kind));
  if (input.readFails) {
    const read = w.readFile;
    w.readFile = async (...a) => {
      await read(...a);
      throw ioError("EACCES");
    };
  }
  if (input.statFails)
    w.stat = async (name) => {
      w.events.push(["stat", name]);
      throw ioError("ENOENT");
    };
  const controller = new AbortController();
  if (input.aborted) controller.abort();
  const { fs } = loaded.use(w);
  let restore;
  if (input.engine === "ripgrep") {
    restore = fs.setRipgrepWorkerFactoryForTests((data) => {
      const worker = w.worker(data);
      queueMicrotask(() => {
        const t = input.worker;
        const prefix = "a.txt";
        const line = (type, text, matched) =>
          JSON.stringify({
            type,
            data: {
              path: { text: prefix },
              lines: { text },
              line_number: 2,
              submatches: matched ? [{ match: { text: "target" } }] : [],
            },
          });
        const result = {
          code: 0,
          stdout:
            line("match", "Target target\r\n", true) + "\n" + line("context", "\r\n", false) + "\n",
          stderr: "",
        };
        if (t === "count") result.stdout = "a.txt:2\ndeep/z.ts:1\nmalformed\nb.js:0\n";
        if (t === "invalid-json") result.stdout = "broken-json\n";
        if (t?.startsWith("code2-")) {
          result.code = 2;
          result.stdout = "";
          result.stderr =
            t === "code2-regex"
              ? "regex parse error: unclosed group"
              : t === "code2-permission"
                ? "Permission denied (os error 13)"
                : "No such file (os error 2)";
        }
        if (t === "code3") {
          result.code = 3;
          result.stderr = "Controlled exit";
        }
        if (t === "runtime-error") {
          worker.emit("message", {
            type: "error",
            error: { name: "Error", message: "Controlled WASM failure" },
          });
          return;
        }
        if (t === "worker-error") {
          worker.emit("error", new Error("Controlled worker failure"));
          return;
        }
        if (t === "unknown") {
          worker.emit("message", {});
          return;
        }
        if (t === "exit") {
          worker.emit("exit", 9);
          return;
        }
        if (t === "timeout") {
          w.scheduled[0].callback();
          return;
        }
        if (t === "abort") {
          controller.abort();
          return;
        }
        worker.emit("message", { type: "result", result });
      });
      return worker;
    });
  }
  const port = new fs.NodeFileSystemAdapter({ textSearchEngine: input.engine ?? "javascript" });
  const request = { pattern: "target", outputMode: "content", ...input, path: p };
  const op = input.op ?? "searchText";
  try {
    return {
      input: portable(input),
      value: portable(await port[op](request, { signal: controller.signal })),
      events: portable(w.events),
      workerEvents: w.workerEvents,
      timers: w.scheduled.map((t) => t.delay),
    };
  } catch (error) {
    return {
      input: portable(input),
      error: portable(error),
      events: portable(w.events),
      workerEvents: w.workerEvents,
      timers: w.scheduled.map((t) => t.delay),
    };
  } finally {
    restore?.();
  }
}
