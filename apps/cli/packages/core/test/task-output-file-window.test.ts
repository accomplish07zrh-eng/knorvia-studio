// Owned synthetic handles and temporary files only; no real task output is opened.
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
const ownedPath = join(tmpdir(), "knorvia-output-window-owned.txt");
type Stage = "open" | "stat" | "read" | "close";
interface Scenario {
  bytes: Buffer;
  size?: number;
  chunk?: number;
  zeroAfter?: number;
  failAt?: Stage;
  abortAt?: Stage;
  error?: Error;
  controller: AbortController;
  calls: any[];
}
let active: Scenario | undefined;
mock.module("node:fs/promises", {
  namedExports: {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      if (!active || args[0] !== ownedPath) return fs.open(...args);
      const f = active;
      let reads = 0;
      const stage = (name: Stage) => {
        if (f.abortAt === name) f.controller.abort();
        if (f.failAt === name) throw f.error ?? new Error("owned IO failure");
      };
      f.calls.push(["open", ...args]);
      stage("open");
      return {
        stat: async () => {
          f.calls.push(["stat"]);
          stage("stat");
          return { size: f.size ?? f.bytes.length };
        },
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          f.calls.push(["read", offset, length, position]);
          stage("read");
          const n =
            reads++ >= (f.zeroAfter ?? Infinity)
              ? 0
              : Math.max(0, Math.min(length, f.chunk ?? Infinity, f.bytes.length - position));
          f.bytes.copy(buffer, offset, position, position + n);
          return { bytesRead: n, buffer };
        },
        close: async () => {
          f.calls.push(["close"]);
          stage("close");
        },
      };
    },
  },
});
const { projectTask: source } = await import("../src/tool/handlers/task-output-projection.js");
const { projectTask: emitted } = await import("../dist/tool/handlers/task-output-projection.js");
const TAIL_BYTES = 8 * 1024 * 1024;
const HEAD_BYTES = 30000;
function fixture(bytes = Buffer.from("hello"), extra: Partial<Scenario> = {}) {
  const f: Scenario = { bytes, controller: new AbortController(), calls: [], ...extra };
  active = f;
  return f;
}
async function invoke(
  project: typeof source,
  f: Scenario,
  edge: "head" | "tail",
  path: string | undefined = ownedPath,
) {
  return project(
    {
      taskId: "task",
      type: edge === "head" ? "local_bash" : "monitor_mcp",
      status: edge === "head" ? "running" : "completed",
      description: "owned",
      outputFile: path,
    } as any,
    {
      abortSignal: f.controller.signal,
      executionPort: {
        getBackgroundTask: async () => ({
          outputPath: path,
          stdoutTail: "fallback",
          stderrTail: "",
        }),
      },
    } as any,
  );
}
assert.notEqual(source, emitted);
for (const [surface, project] of [
  ["source", source],
  ["emitted", emitted],
] as const)
  for (const edge of ["head", "tail"] as const) {
    test(`${surface} ${edge} partial reads advance offsets and close once`, async () => {
      const f = fixture(Buffer.from("abcdef"), { chunk: 2 });
      assert.equal((await invoke(project, f, edge)).output, "abcdef");
      assert.deepEqual(f.calls, [
        ["open", ownedPath, "r"],
        ["stat"],
        ["read", 0, 6, 0],
        ["read", 2, 4, 2],
        ["read", 4, 2, 4],
        ["close"],
      ]);
    });
    test(`${surface} ${edge} zero read stops without spinning`, async () => {
      const f = fixture(Buffer.from("abcdef"), { chunk: 2, zeroAfter: 1 });
      assert.equal(
        (await invoke(project, f, edge)).output,
        edge === "head" ? "ab" : "[0KB of earlier output omitted]\nab",
      );
      assert.equal(f.calls.filter((c) => c[0] === "read").length, 2);
      assert.deepEqual(f.calls.at(-1), ["close"]);
    });
    test(`${surface} ${edge} empty file remains available and closes`, async () => {
      const f = fixture(Buffer.alloc(0));
      assert.equal((await invoke(project, f, edge)).output, "");
      assert.deepEqual(f.calls, [["open", ownedPath, "r"], ["stat"], ["close"]]);
    });
    test(`${surface} ${edge} missing path precedes cancellation and opens nothing`, async () => {
      const f = fixture();
      f.controller.abort();
      assert.equal((await invoke(project, f, edge, "")).output, edge === "head" ? "fallback" : "");
      assert.deepEqual(f.calls, []);
    });
    test(`${surface} ${edge} already cancelled never opens file`, async () => {
      const f = fixture();
      f.controller.abort();
      await assert.rejects(
        invoke(project, f, edge),
        (e: any) => e.name === "AbortError" && e.message === "Task output wait aborted",
      );
      assert.deepEqual(f.calls, []);
    });
    for (const stage of ["open", "stat", "read", "close"] as const) {
      test(`${surface} ${edge} ordinary ${stage} failure produces unavailable fallback`, async () => {
        const f = fixture(undefined, { failAt: stage });
        assert.equal((await invoke(project, f, edge)).output, edge === "head" ? "fallback" : "");
        assert.equal(f.calls.filter((c) => c[0] === "close").length, stage === "open" ? 0 : 1);
      });
      test(`${surface} ${edge} ${stage} AbortError retains original exception`, async () => {
        const error = new Error("owned abort");
        error.name = "AbortError";
        const f = fixture(undefined, { failAt: stage, error });
        await assert.rejects(invoke(project, f, edge), (e) => e === error);
      });
      test(`${surface} ${edge} cancellation wins over ordinary ${stage} failure`, async () => {
        const f = fixture(undefined, { failAt: stage, abortAt: stage });
        await assert.rejects(
          invoke(project, f, edge),
          (e: any) => e.name === "AbortError" && e.message === "Task output wait aborted",
        );
      });
    }
    test(`${surface} ${edge} cancellation after nonempty read is checked before delivery`, async () => {
      const f = fixture(undefined, { abortAt: "read" });
      await assert.rejects(invoke(project, f, edge), (e: any) => e.name === "AbortError");
      assert.deepEqual(f.calls.at(-1), ["close"]);
    });
    test(`${surface} ${edge} zero-sized early return does not add a post-stat abort check`, async () => {
      const f = fixture(Buffer.alloc(0), { abortAt: "stat" });
      assert.equal((await invoke(project, f, edge)).output, "");
      assert.deepEqual(f.calls.at(-1), ["close"]);
    });
    test(`${surface} ${edge} close-time cancellation without error retains completed result`, async () => {
      const f = fixture(undefined, { abortAt: "close" });
      assert.equal((await invoke(project, f, edge)).output, "hello");
    });
    test(`${surface} ${edge} exact byte window is bounded and keeps UTF-8 replacement policy`, async () => {
      const limit = edge === "head" ? HEAD_BYTES : TAIL_BYTES;
      const bytes = Buffer.alloc(limit + 4, 97);
      Buffer.from("😀").copy(bytes, edge === "head" ? limit - 2 : 2);
      const f = fixture(bytes);
      const start = edge === "head" ? 0 : 4;
      const expected = bytes.subarray(start, start + limit).toString("utf8");
      assert.equal(
        (await invoke(project, f, edge)).output,
        edge === "head" ? expected : "[0KB of earlier output omitted]\n" + expected,
      );
      assert.deepEqual(f.calls[2], ["read", 0, limit, start]);
    });
    test(`${surface} ${edge} real owned UTF-8 file uses the same byte window`, async () => {
      active = undefined;
      const root = await fs.mkdtemp(join(tmpdir(), "knorvia-window-native-"));
      try {
        const path = join(root, "output.txt");
        const limit = edge === "head" ? HEAD_BYTES : TAIL_BYTES;
        const bytes = Buffer.concat([
          Buffer.from("头😀"),
          Buffer.alloc(limit, 98),
          Buffer.from("尾😀"),
        ]);
        await fs.writeFile(path, bytes);
        const f = { bytes, controller: new AbortController(), calls: [] };
        const expected =
          edge === "head"
            ? bytes.subarray(0, limit).toString("utf8")
            : `[${Math.round((bytes.length - limit) / 1024)}KB of earlier output omitted]\n` +
              bytes.subarray(-limit).toString("utf8");
        assert.equal((await invoke(project, f, edge, path)).output, expected);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
