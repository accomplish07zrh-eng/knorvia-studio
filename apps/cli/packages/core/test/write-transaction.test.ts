// Synthetic Write transactions only; no real user filesystem access.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSystemError } from "@knorvia/contracts";
import { writeToolEntry as sourceEntry } from "../src/tool/handlers/write.js";
import { writeToolEntry as emittedEntry } from "../dist/tool/handlers/write.js";
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
import type { ReadFileStateMap, ToolExecutionContext } from "../src/tool/types.js";
assert.notEqual(sourceEntry, emittedEntry);
for (const [mode, writeToolEntry] of [
  ["source", sourceEntry],
  ["emitted", emittedEntry],
] as const) {
  function fixture(options: Record<string, any> = {}) {
    const path = join(tmpdir(), options.name ?? "knorvia-transaction.txt");
    const content = options.content ?? "before alpha after";
    const revision = options.revision ?? {
      id: "read",
      mtimeMs: 10.2,
      sizeBytes: Buffer.byteLength(content),
    };
    const after = options.after ?? { id: "written", mtimeMs: 20.8, sizeBytes: 23 };
    const events: string[] = [];
    const calls: Record<string, any[]> = {};
    const metadata: any[] = [];
    const snapshot = {
      path,
      content,
      readAt: new Date(1),
      sourceTool: "Read" as const,
      isPartialView: false,
      revisionId: revision.id,
      mtimeMs: revision.mtimeMs,
      sizeBytes: revision.sizeBytes,
      ...options.snapshot,
    };
    const states: ReadFileStateMap = new Map(
      options.emptyState ? [] : [[createReadFileStateKey(path, 1, undefined), snapshot]],
    );
    const signal = new AbortController().signal;
    const trace = {
      traceId: "trace",
      spanId: "span",
      parentSpanId: "parent",
      sessionId: "session",
      turnId: "turn",
    };
    const problem = new Error("synthetic failure");
    const context = {
      ...trace,
      workingDirectory: tmpdir(),
      workspaceRoot: tmpdir(),
      abortSignal: signal,
      readFileState: options.noStates ? undefined : states,
      recordReadFileStateMetadata: (value: any) => {
        events.push("metadata");
        metadata.push(value);
        if (options.fail === "metadata") throw problem;
      },
      fileSystemPort: {
        stat: async (...args: any[]) => {
          events.push("stat");
          calls.stat = args;
          if (options.fail === "stat") throw problem;
          if (options.missing)
            throw createFileSystemError({ code: "not_found", message: "missing" });
          return { kind: "file", sizeBytes: options.size ?? Buffer.byteLength(content) };
        },
        listDirectory: async (...args: any[]) => {
          events.push("list");
          calls.list = args;
          if (options.fail === "list") throw problem;
          return { entries: options.entries ?? [] };
        },
        readTextFile: async (...args: any[]) => {
          events.push("read");
          calls.read = args;
          if (options.fail === "read") throw problem;
          if (options.missing)
            throw createFileSystemError({ code: "not_found", message: "missing" });
          return {
            path,
            content,
            encoding: "utf8",
            lineEndings: "CRLF",
            sizeBytes: Buffer.byteLength(content),
            bytesRead: Buffer.byteLength(content),
            truncated: false,
            revision,
          };
        },
        writeTextFile: async (...args: any[]) => {
          events.push("write");
          calls.write = args;
          assert.equal([...states.values()][0], options.emptyState ? undefined : snapshot);
          assert.equal(metadata.length, 0);
          if (options.fail === "write") throw problem;
          return { path, revision: after };
        },
      },
    } as unknown as ToolExecutionContext;
    if (options.noPort) context.fileSystemPort = undefined;
    const run = (input: Record<string, any> = {}) =>
      writeToolEntry.handler({ file_path: path, content: "replacement", ...input }, context);
    return {
      run,
      path,
      content,
      revision,
      after,
      snapshot,
      states,
      context,
      signal,
      trace,
      events,
      calls,
      metadata,
      problem,
    };
  }

  for (const point of ["read", "write", "metadata"])
    test(mode + " " + `Write preserves ${point} error identity and commit boundary`, async () => {
      const f = fixture({ fail: point });
      await assert.rejects(f.run(), (error) => error === f.problem);
      const order = ["read", "write", "metadata"];
      assert.deepEqual(f.events, order.slice(0, order.indexOf(point) + 1));
      assert.equal([...f.states.values()][0]!.sourceTool, point === "metadata" ? "Write" : "Read");
    });
  const admissionCases = [
    { label: "no map", options: { noStates: true }, code: "write_file_not_read" },
    { label: "empty map", options: { emptyState: true }, code: "write_file_not_read" },
    {
      label: "partial",
      options: { snapshot: { isPartialView: true } },
      code: "write_file_not_read",
    },
    {
      label: "revision first limited",
      options: { snapshot: { revisionId: "different", limit: 10 } },
      code: "write_file_stale",
    },
    { label: "revision first unchanged full", options: { snapshot: { revisionId: "different" } } },
    {
      label: "revision first changed full",
      options: { snapshot: { revisionId: "different", content: "different" } },
      code: "write_file_stale",
    },
    { label: "advanced unchanged full", options: { snapshot: { mtimeMs: 1 } } },
    {
      label: "advanced unchanged limited",
      options: { snapshot: { mtimeMs: 1, limit: 10 } },
      code: "write_file_stale",
    },
    {
      label: "advanced unchanged offset",
      options: { snapshot: { mtimeMs: 1, offset: 2 } },
      code: "write_file_stale",
    },
    {
      label: "same integer watermark",
      options: { snapshot: { mtimeMs: 10.9, content: "different" } },
    },
    { label: "older disk watermark", options: { snapshot: { mtimeMs: 12, content: "different" } } },
    {
      label: "size changed",
      options: { snapshot: { sizeBytes: 999, content: "different" } },
      code: "write_file_stale",
    },
    {
      label: "no metadata changed full",
      options: {
        snapshot: {
          mtimeMs: undefined,
          revisionId: undefined,
          sizeBytes: undefined,
          content: "different",
        },
      },
      code: "write_file_stale",
    },
    {
      label: "no metadata identical full",
      options: { snapshot: { mtimeMs: undefined, revisionId: undefined, sizeBytes: undefined } },
    },
    {
      label: "no metadata range",
      options: {
        snapshot: {
          mtimeMs: undefined,
          revisionId: undefined,
          sizeBytes: undefined,
          content: "different",
          offset: 3,
        },
      },
    },
  ];
  for (const row of admissionCases)
    test(mode + " " + `Write freshness ${row.label}`, async () => {
      const f = fixture(row.options);
      if (row.code) {
        await assert.rejects(f.run(), (error: any) => {
          assert.equal(error.context.code, row.code);
          assert.equal(error.context.filePath, f.path);
          assert.equal(error.recoverable, true);
          return true;
        });
        assert.deepEqual(f.events, ["read"]);
      } else {
        await f.run();
        assert.ok(f.calls.write);
      }
    });
  test(
    mode + " " + "Write forwards captured port, trace, signal, raw text and exact revision",
    async () => {
      const f = fixture();
      const text = "$&$$\r\n中😀";
      const output: any = await f.run({ file_path: "knorvia-transaction.txt", content: text });
      assert.deepEqual(f.events, ["read", "write", "metadata"]);
      for (const method of ["read", "write"]) {
        assert.equal(f.calls[method]![0].path, f.path);
        assert.deepEqual(f.calls[method]![0].trace, f.trace);
        assert.equal(f.calls[method]![1].signal, f.signal);
      }
      const write = f.calls.write![0];
      assert.equal(write.content, text);
      assert.equal(write.expectedRevision, f.revision);
      assert.equal(write.encoding, "utf8");
      assert.equal(write.lineEndings, "CRLF");
      assert.equal(write.atomic, true);
      assert.equal(write.createParents, true);
      assert.equal(output.type, "update");
      assert.equal(output.originalFile, f.content);
      assert.equal(output.content, text);
      assert.equal(output.filePath, "knorvia-transaction.txt");
      assert.equal(Object.keys(output).includes("perf"), false);
      assert.equal(output.perf.detail.filesystem.totalBytes, Buffer.byteLength(text));
      const state = [...f.states.values()][0]!;
      assert.equal(state.sourceTool, "Write");
      assert.equal(state.offset, undefined);
      assert.equal(state.limit, undefined);
      assert.equal(state.isPartialView, false);
      assert.equal(state.mtimeMs, 20);
      assert.equal(state.revisionId, "written");
      assert.equal(state.sizeBytes, 23);
      assert.equal(f.metadata[0].readAtMs, state.readAt.getTime());
      assert.equal(writeToolEntry.permission!.needsApproval, true);
    },
  );
  for (const options of [{ missing: true, emptyState: true }, { content: "" }])
    test(mode + " " + `Write preserves create output ${JSON.stringify(options)}`, async () => {
      const f = fixture(options);
      const result: any = await f.run();
      assert.equal(result.type, "create");
      assert.equal(result.originalFile, null);
      assert.deepEqual(result.structuredPatch, []);
      assert.equal(f.calls.write![0].expectedRevision, options.missing ? undefined : f.revision);
      assert.equal(f.calls.write![0].lineEndings, options.missing ? undefined : "CRLF");
    });
  test(mode + " " + "Write missing file can create without a runtime snapshot map", async () => {
    const f = fixture({ missing: true, noStates: true });
    await f.run();
    assert.deepEqual(f.events, ["read", "write"]);
  });
  test(mode + " " + "Write existing empty file still requires Read", async () => {
    const f = fixture({ content: "", emptyState: true });
    await assert.rejects(f.run(), /File has not been read/);
    assert.deepEqual(f.events, ["read"]);
  });
  test(
    mode + " " + "Write unchanged content still performs its single conditional write",
    async () => {
      const f = fixture();
      await f.run({ content: f.content });
      assert.deepEqual(f.events, ["read", "write", "metadata"]);
    },
  );
  test(
    mode + " " + "Write absent revision uses UTF8 byte size and emits no incomplete metadata",
    async () => {
      const f = fixture({ after: {} });
      await f.run({ content: "中😀" });
      const state = [...f.states.values()][0]!;
      assert.equal(state.sizeBytes, 7);
      assert.equal(state.revisionId, undefined);
      assert.equal(f.metadata.length, 0);
    },
  );
  test(mode + " " + "Write missing filesystem port rejects before IO", async () => {
    const f = fixture({ noPort: true });
    await assert.rejects(f.run(), /FileSystemPort is not configured for Write tool/);
    assert.deepEqual(f.events, []);
  });
  test(mode + " " + "Write stamps synthetic memory origin through existing policy", async () => {
    const f = fixture({ missing: true, emptyState: true, name: "synthetic-memory.md" });
    f.context.memoryRoot = tmpdir();
    await f.run({ content: "---\ntitle: Example\nmetadata: {}\n---\nbody" });
    assert.match(f.calls.write![0].content, /originSessionId: session/);
    assert.equal([...f.states.values()][0]!.content, f.calls.write![0].content);
  });

  test(
    mode + " " + "Write stamps missing-metadata memory mapping after explicit policy repair",
    async () => {
      const f = fixture({ missing: true, emptyState: true, name: "synthetic-memory.md" });
      f.context.memoryRoot = tmpdir();
      const content = "---\ntitle: Example\n---\nbody";
      await f.run({ content });
      assert.match(f.calls.write![0].content, /originSessionId: session/);
    },
  );
}
