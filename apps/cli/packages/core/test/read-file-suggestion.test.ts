// Synthetic missing-file contracts; transition licence retained.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import test from "node:test";
import { createFileSystemError, CoreErrorType, type CoreError } from "@knorvia/contracts";
import { readToolEntry } from "../src/tool/handlers/read.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

function distance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return matrix[a.length]![b.length]!;
}
type Entry = { name: string; kind: string };
function expected(target: string, input: Entry[]) {
  const names = input
    .filter((e) => e.kind === "file" || e.kind === "symlink")
    .map((e) => e.name)
    .filter((n) => n !== target)
    .sort();
  return (
    names.find((n) => basename(n, extname(n)) === basename(target, extname(target))) ||
    names.find((n) => distance(n, target) <= 3)
  );
}
async function invoke(
  target: string,
  entries: Entry[],
  options: { failList?: boolean; dropPort?: boolean } = {},
) {
  const path = join(tmpdir(), target);
  const original = createFileSystemError({ code: "not_found", message: "synthetic missing" });
  const signal = new AbortController().signal;
  const calls: any[] = [];
  const trace = {
    traceId: "trace",
    spanId: "span",
    parentSpanId: "parent",
    sessionId: "session",
    turnId: "turn",
  };
  const context = {
    ...trace,
    workingDirectory: tmpdir(),
    workspaceRoot: tmpdir(),
    abortSignal: signal,
    fileSystemPort: {
      stat: async () => {
        if (options.dropPort) context.fileSystemPort = undefined as any;
        throw original;
      },
      listDirectory: async (...args: any[]) => {
        calls.push(args);
        if (options.failList) throw new Error("synthetic listing failed");
        return { entries };
      },
    },
  } as unknown as ToolExecutionContext;
  let result: CoreError | undefined;
  await assert.rejects(readToolEntry.handler({ file_path: path }, context), (error) => {
    result = error as CoreError;
    assert.equal(result.type, CoreErrorType.ToolExecutionFailed);
    assert.equal(result.cause, original);
    assert.equal(result.recoverable, true);
    assert.deepEqual(result.context, { code: "read_file_not_found", filePath: path });
    return true;
  });
  if (options.dropPort) assert.deepEqual(calls, []);
  else assert.deepEqual(calls, [[{ path: dirname(path), trace }, { signal }]]);
  return result!.message;
}
const file = (name: string): Entry => ({ name, kind: "file" });
const cases: [string, Entry[]][] = [
  ["report.txt", ["reportx.txt", "report.archive"].map(file)],
  ["a.txt", ["c.txt", "b.txt", "d.txt"].map(file)],
  [
    "target.txt",
    [file("target.txt"), { name: "target.md", kind: "directory" }, file("zzzzzzzzzz")],
  ],
  ["target.txt", [{ name: "target.link", kind: "symlink" }, file("target2.txt")]],
  ["ABCD", ["abcd", "ABC", "ABXYZ", "XYZABCD", "XYZWABCD"].map(file)],
  [".profile", [".profiles", ".profile-old", "profile"].map(file)],
  ["abc", ["abc123", "abc1234"].map(file)],
  ["a😀b", ["a😁b", "a中b", "a😀xyz"].map(file)],
  ["αβγ", ["αβ", "😀", "αβδεζ"].map(file)],
  ["empty", []],
];
for (const [target, entries] of cases) {
  test(`missing Read keeps sorted stem-first suggestion for ${target}`, async () => {
    const suggestion = expected(target, entries);
    const suffix = suggestion ? ` Did you mean ${suggestion}?` : "";
    assert.equal(
      await invoke(target, entries),
      `File does not exist. Note: your current working directory is ${tmpdir()}.${suffix}`,
    );
  });
}
test("listing failures and disappearing current filesystem do not replace the original missing error", async () => {
  for (const options of [{ failList: true }, { dropPort: true }])
    assert.equal(
      await invoke("missing", [file("missin")], options),
      `File does not exist. Note: your current working directory is ${tmpdir()}.`,
    );
});
test("seeded UTF-16 candidate sets match a complete-matrix reference through real Read", async () => {
  let seed = 38193;
  const rand = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const chars = ["a", "b", "C", ".", "中", "😀"];
  const name = () => Array.from({ length: 1 + rand(8) }, () => chars[rand(chars.length)]).join("");
  for (let i = 0; i < 400; i++) {
    // Avoid path-only dot names, which are normalized by the public path parser.
    const target = "t" + name();
    const entries = Array.from({ length: 8 }, () => ({
      name: "t" + name(),
      kind: ["file", "symlink", "directory"][rand(3)]!,
    }));
    const suggestion = expected(target, entries);
    const message = await invoke(target, entries);
    assert.equal(
      message,
      `File does not exist. Note: your current working directory is ${tmpdir()}.${suggestion ? ` Did you mean ${suggestion}?` : ""}`,
      JSON.stringify({ target, entries }),
    );
  }
});

test("retained model-content fallback preserves primitive, JSON and rejected serialization", () => {
  const format = readToolEntry.formatModelContent!;
  assert.equal(format("already text"), "already text");
  assert.equal(format(undefined), "");
  assert.equal(format(null), "null");
  assert.equal(format({ synthetic: true }), '{"synthetic":true}');
  assert.throws(() => format(1n), TypeError);
  const circular: any = {};
  circular.self = circular;
  assert.throws(() => format(circular), TypeError);
});
