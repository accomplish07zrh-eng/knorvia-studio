import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { untrackedTextFixture } from "./git-untracked-text-fixture-fast-20261001.js";
import {
  answer,
  result,
  root,
  workspace,
  deferred,
} from "./git-diff-read-fixture-fast-20261001.js";

const f = await untrackedTextFixture();
const absolutePath = resolve(workspace, "--owned 文.txt");
const relativePath = "sub\\--owned 文.txt";
const summaries = {
  binary: "Binary diff is not previewable.",
  truncated: "Git diff output exceeded the preview limit.",
};
const patchResult = (text: string, body: string) => ({
  path: absolutePath,
  availability: "patch",
  patch: `--- /dev/null\n+++ b/sub/--owned 文.txt\n${body}`,
  beforeContent: "",
  afterContent: text,
  summary: null,
});
const textCases = [
  ["empty", "", [], false, ""],
  ["single LF", "\n", [""], true, "@@ -0,0 +1,1 @@\n+\n"],
  ["blank CRLFs", "\r\n\r\n", ["", ""], true, "@@ -0,0 +1,2 @@\n+\n+\n"],
  [
    "unterminated",
    "owned",
    ["owned"],
    false,
    "@@ -0,0 +1,1 @@\n+owned\n\\ No newline at end of file\n",
  ],
  ["CRLF", "a\r\nb\r\n", ["a", "b"], true, "@@ -0,0 +1,2 @@\n+a\n+b\n"],
  [
    "bare CR",
    "a\rb\r",
    ["a\rb\r"],
    false,
    "@@ -0,0 +1,1 @@\n+a\rb\r\n\\ No newline at end of file\n",
  ],
  [
    "mixed",
    "a\r\r\nb\n\nc",
    ["a\r", "b", "", "c"],
    false,
    "@@ -0,0 +1,4 @@\n+a\r\n+b\n+\n+c\n\\ No newline at end of file\n",
  ],
  ["Unicode", "文😀\n", ["文😀"], true, "@@ -0,0 +1,1 @@\n+文😀\n"],
] as const;
for (const [name, text, lines, trailing, body] of textCases)
  test(`untracked text golden: ${name}`, async () => {
    const expected = { lines: [...lines], hasTrailingNewline: trailing };
    assert.deepEqual(f.currentSplit(text), expected);
    assert.deepEqual(f.legacy.splitUntrackedText(text), expected);
    for (const build of [
      f.helpers.buildUntrackedTextDiffResult,
      f.legacy.buildUntrackedTextDiffResult,
    ]) {
      const s = f.fixture({ fs: { readFile: () => Buffer.from(text) } });
      assert.deepEqual(await build(absolutePath, relativePath, 100), patchResult(text, body));
      assert.deepEqual(s.trace, [["readFile", absolutePath, undefined]]);
    }
  });

test("untracked invalid UTF-8 replacement and literal header delimiters", async () => {
  const path = 'sub\\--"owned\tline\n.txt';
  for (const build of [
    f.helpers.buildUntrackedTextDiffResult,
    f.legacy.buildUntrackedTextDiffResult,
  ]) {
    f.fixture({ fs: { readFile: () => Buffer.from([0xc3, 0x28, 0x0a]) } });
    assert.deepEqual(await build(absolutePath, path, 3), {
      ...patchResult("�(\n", "@@ -0,0 +1,1 @@\n+�(\n"),
      patch: '--- /dev/null\n+++ b/sub/--"owned\tline\n.txt\n@@ -0,0 +1,1 @@\n+�(\n',
    });
  }
});

test("untracked high line-count insertion failure keeps null fallback", async () => {
  const content = Buffer.from("\n".repeat(300000));
  for (const build of [
    f.helpers.buildUntrackedTextDiffResult,
    f.legacy.buildUntrackedTextDiffResult,
  ]) {
    f.fixture({ fs: { readFile: () => content } });
    assert.equal(await build(absolutePath, relativePath, 1048576), null);
  }
});

for (const [name, bytes, limit, availability] of [
  ["NUL wins size", Buffer.from([0, 65]), -1, "binary"],
  ["over limit", Buffer.from("owned"), 4, "truncated"],
  ["UTF-8 bytes", Buffer.from("文"), 2, "truncated"],
  ["equal", Buffer.from("owned"), 5, "patch"],
  ["zero", Buffer.alloc(0), 0, "patch"],
  ["negative", Buffer.alloc(0), -1, "truncated"],
  ["NaN", Buffer.from("owned"), Number.NaN, "patch"],
  ["infinity", Buffer.from("owned"), Infinity, "patch"],
] as const)
  test(`untracked classification: ${name}`, async () => {
    let expected: unknown;
    for (const build of [
      f.legacy.buildUntrackedTextDiffResult,
      f.helpers.buildUntrackedTextDiffResult,
    ]) {
      f.fixture({ fs: { readFile: () => bytes } });
      const value = await build(absolutePath, relativePath, limit);
      assert.equal(value.availability, availability);
      if (availability !== "patch")
        assert.deepEqual(value, {
          path: absolutePath,
          availability,
          patch: null,
          beforeContent: null,
          afterContent: null,
          summary: summaries[availability],
        });
      if (expected) assert.deepEqual(value, expected);
      expected = value;
    }
  });

for (const phase of [
  "none",
  "binary",
  "size",
  "includes",
  "byteLength",
  "path",
  "decode1",
  "decode2",
])
  test(`untracked lazy read/error order: ${phase}`, async () => {
    async function observe(legacy: boolean) {
      const events: string[] = [];
      const fail = () => {
        throw new Error("owned preview port failure");
      };
      let calls = 0;
      const bytes = {
        get includes() {
          events.push("includes-get");
          if (phase === "includes") fail();
          return function (this: unknown, value: number) {
            assert.equal(this, bytes);
            assert.equal(value, 0);
            events.push("includes-call");
            return phase === "binary";
          };
        },
        get byteLength() {
          events.push("byteLength");
          if (phase === "byteLength") fail();
          return phase === "size" ? 101 : 4;
        },
        get toString() {
          events.push("toString-get");
          return function (this: unknown, encoding: string) {
            assert.equal(this, bytes);
            assert.equal(encoding, "utf-8");
            const n = ++calls;
            events.push(`decode${n}`);
            if (phase === `decode${n}`) fail();
            return n === 1 ? "patch\r\n" : "raw after\r\n";
          };
        },
      };
      const path = {
        get replace() {
          events.push("path");
          if (phase === "path") fail();
          return String.prototype.replace;
        },
        toString: () => relativePath,
      };
      const s = f.fixture({ fs: { readFile: () => bytes } });
      const build = legacy
        ? f.legacy.buildUntrackedTextDiffResult
        : f.helpers.buildUntrackedTextDiffResult;
      const value = await build(absolutePath, path as never, 100);
      const full = [
        "includes-get",
        "includes-call",
        "byteLength",
        "path",
        "toString-get",
        "decode1",
        "toString-get",
        "decode2",
      ];
      const stop =
        phase === "none"
          ? 8
          : phase === "binary"
            ? 2
            : phase === "size"
              ? 3
              : full.indexOf(phase === "includes" ? "includes-get" : phase) + 1;
      assert.deepEqual(events, full.slice(0, stop));
      if (["includes", "byteLength", "path", "decode1", "decode2"].includes(phase))
        assert.equal(value, null);
      if (phase === "none")
        assert.deepEqual(value, patchResult("raw after\r\n", "@@ -0,0 +1,1 @@\n+patch\n"));
      return { value, events, trace: s.trace };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });

for (const rejected of [false, true])
  test(`untracked one-await deferred settlement rejected=${rejected}`, async () => {
    async function observe(legacy: boolean) {
      const d = deferred<Buffer>();
      const events: string[] = [];
      f.fixture({
        fs: {
          readFile: () => {
            events.push("read");
            return d.promise;
          },
        },
      });
      const build = legacy
        ? f.legacy.buildUntrackedTextDiffResult
        : f.helpers.buildUntrackedTextDiffResult;
      const p = build(absolutePath, relativePath, 100).then((value: unknown) => {
        events.push("result");
        return value;
      });
      events.push("admitted");
      queueMicrotask(() => events.push("queued-before"));
      if (rejected) d.reject(new Error("owned deferred read rejection"));
      else d.resolve(Buffer.from("owned\n"));
      queueMicrotask(() => events.push("queued-after"));
      const value = await p;
      assert.deepEqual(events, ["read", "admitted", "queued-before", "queued-after", "result"]);
      assert.deepEqual(
        value,
        rejected ? null : patchResult("owned\n", "@@ -0,0 +1,1 @@\n+owned\n"),
      );
      return { events, value };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });

for (const transport of ["service", "RPC"] as const)
  for (const kind of ["text", "binary", "large", "failed"] as const)
    test(`actual untracked ${transport}: ${kind}`, async (t) => {
      const bytes =
        kind === "binary"
          ? Buffer.from([0, 65])
          : kind === "large"
            ? Buffer.alloc(1048577, 65)
            : Buffer.from("owned\r\n");
      const s = f.fixture({
        run: (c) =>
          c.args.includes("--no-index")
            ? result({ stdout: "owned fallback", exitCode: 1 })
            : c.args[0] === "diff"
              ? result({ stdout: "" })
              : answer(c),
        fs: {
          readFile: () => {
            if (kind === "failed") throw new Error("owned read failed");
            return bytes;
          },
        },
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const query = Object.freeze({
        workspacePath: workspace,
        path: "--owned 文.txt",
        sourceId: "unstaged" as const,
      });
      const value = await api.getDiff(query);
      if (kind === "text")
        assert.deepEqual(value, patchResult("owned\r\n", "@@ -0,0 +1,1 @@\n+owned\n"));
      else
        assert.equal(
          value.availability,
          kind === "large" ? "truncated" : kind === "failed" ? "patch" : "binary",
        );
      assert.equal(s.trace.filter((v) => Array.isArray(v) && v[0] === "readFile").length, 1);
      const diffs = s.commands.filter((c) => c.args[0] === "diff");
      assert.deepEqual(diffs[0]?.args, [
        "diff",
        "--no-ext-diff",
        "--no-color",
        "--binary",
        "--",
        "sub/--owned 文.txt",
      ]);
      assert.equal(diffs.length, kind === "failed" ? 2 : 1);
      for (const c of diffs) {
        assert.equal(c.cwd, root);
        assert.equal(c.timeoutMs, 20000);
        assert.equal(c.maxOutputBytes, 1048576);
      }
      if (kind === "failed") {
        assert.deepEqual(diffs[1]?.args, [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-color",
          "--binary",
          f.config.getGitNullDevicePath(),
          absolutePath,
        ]);
        assert.equal(value.patch, "owned fallback");
      }
    });

test("actual reentrant previews keep independent reads and late completion after invalidation", async () => {
  const started = deferred<void>(),
    old = deferred<Buffer>();
  let reads = 0,
    nested!: Promise<unknown>;
  let s!: ReturnType<typeof f.fixture>;
  const query = { workspacePath: workspace, path: "--owned 文.txt", sourceId: "unstaged" as const };
  s = f.fixture({
    run: (c) => (c.args[0] === "diff" ? result({ stdout: "" }) : answer(c)),
    fs: {
      readFile: () => {
        if (++reads === 1) {
          nested = s.api.getDiff(query);
          started.resolve();
          return old.promise;
        }
        return Buffer.from("new\n");
      },
    },
  });
  const first = s.api.getDiff(query);
  await started.promise;
  s.repo.invalidate(workspace);
  assert.deepEqual(await nested, patchResult("new\n", "@@ -0,0 +1,1 @@\n+new\n"));
  old.resolve(Buffer.from("old\n"));
  assert.deepEqual(await first, patchResult("old\n", "@@ -0,0 +1,1 @@\n+old\n"));
  assert.equal(reads, 2);
  assert.equal(s.commands.filter((c) => c.args[0] === "diff").length, 2);
});
