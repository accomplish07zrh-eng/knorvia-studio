// Synthetic ports only. No user file or filesystem mutation is involved.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileSystemError, EditErrorCode } from "@knorvia/contracts";
import { editToolEntry as sourceEntry } from "../src/tool/handlers/edit.js";
import { editToolEntry as emittedEntry } from "../dist/tool/handlers/edit.js";
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
import type { ReadFileStateMap, ToolExecutionContext } from "../src/tool/types.js";

assert.notEqual(sourceEntry, emittedEntry);
for (const [mode, editToolEntry] of [
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
      editToolEntry.handler(
        { file_path: path, old_string: "alpha", new_string: "beta", replace_all: false, ...input },
        context,
      );
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

  for (const point of ["stat", "read", "write", "metadata"]) {
    test(
      mode + " " + `Edit transaction preserves ${point} failure identity and commit boundary`,
      async () => {
        const f = fixture({ fail: point });
        await assert.rejects(f.run(), (error) => error === f.problem);
        const order = ["stat", "read", "write", "metadata"];
        assert.deepEqual(f.events, order.slice(0, order.indexOf(point) + 1));
        assert.equal([...f.states.values()][0]!.sourceTool, point === "metadata" ? "Edit" : "Read");
        assert.equal(f.metadata.length, point === "metadata" ? 1 : 0);
      },
    );
  }

  test(
    mode + " " + "Edit transaction commits once and propagates signal, trace and revision identity",
    async () => {
      const f = fixture();
      const output: any = await f.run({ file_path: "knorvia-transaction.txt" });
      assert.deepEqual(f.events, ["stat", "read", "write", "metadata"]);
      for (const name of ["stat", "read", "write"]) {
        assert.equal(f.calls[name]![0].path, f.path);
        assert.deepEqual(f.calls[name]![0].trace, f.trace);
        assert.equal(f.calls[name]![1].signal, f.signal);
      }
      const write = f.calls.write![0];
      assert.equal(write.expectedRevision, f.revision);
      assert.equal(write.atomic, true);
      assert.equal(write.createParents, true);
      assert.equal(write.encoding, "utf8");
      assert.equal(write.lineEndings, "CRLF");
      assert.equal(write.content, "before beta after");
      const state = [...f.states.values()][0]!;
      assert.equal(state.sourceTool, "Edit");
      assert.equal(state.isPartialView, false);
      assert.equal(state.offset, undefined);
      assert.equal(state.limit, undefined);
      assert.equal(state.revisionId, "written");
      assert.equal(state.mtimeMs, 20);
      assert.equal(state.sizeBytes, 23);
      assert.equal(f.metadata[0].readAtMs, state.readAt.getTime());
      assert.equal(output.filePath, "knorvia-transaction.txt");
      assert.equal(Object.keys(output).includes("perf"), false);
      assert.equal(output.perf.detail.patch.matchAttempts, 1);
      assert.equal(output.perf.detail.filesystem.totalBytes, Buffer.byteLength(write.content));
    },
  );

  const freshnessCases = [
    { label: "missing", options: { emptyState: true }, code: EditErrorCode.FILE_NOT_READ },
    {
      label: "partial",
      options: { snapshot: { isPartialView: true } },
      code: EditErrorCode.FILE_NOT_READ,
    },
    {
      label: "advanced changed",
      options: { snapshot: { mtimeMs: 9, content: "different" } },
      code: EditErrorCode.STALE_FILE,
    },
    { label: "advanced unchanged full", options: { snapshot: { mtimeMs: 9 } } },
    {
      label: "advanced unchanged limited",
      options: { snapshot: { mtimeMs: 9, limit: 20 } },
      code: EditErrorCode.STALE_FILE,
    },
    {
      label: "advanced unchanged offset",
      options: { snapshot: { mtimeMs: 9, offset: 2 } },
      code: EditErrorCode.STALE_FILE,
    },
    {
      label: "same integer mtime changed revision",
      options: { snapshot: { mtimeMs: 10.9, revisionId: "other" } },
    },
    { label: "older disk watermark", options: { snapshot: { mtimeMs: 12, content: "different" } } },
    {
      label: "size mismatch",
      options: { snapshot: { sizeBytes: 999, content: "different" } },
      code: EditErrorCode.STALE_FILE,
    },
    {
      label: "revision fallback",
      options: { snapshot: { mtimeMs: undefined, revisionId: "other", content: "different" } },
      code: EditErrorCode.STALE_FILE,
    },
    {
      label: "missing metadata fallback",
      options: { snapshot: { mtimeMs: undefined, revisionId: undefined, sizeBytes: undefined } },
    },
    { label: "no runtime state map", options: { noStates: true } },
  ];
  for (const row of freshnessCases)
    test(mode + " " + `Edit admission ${row.label}`, async () => {
      const f = fixture(row.options);
      const result: any = await f.run();
      if (row.code !== undefined) {
        assert.equal(result.result, false);
        assert.equal(result.errorCode, row.code);
        assert.deepEqual(f.events, ["stat", "read"]);
        assert.equal(f.metadata.length, 0);
      } else assert.ok(f.calls.write);
    });

  for (const [label, options, input, code, events] of [
    ["no change", {}, { new_string: "alpha" }, EditErrorCode.NO_CHANGE, []],
    ["empty path", {}, { file_path: "" }, EditErrorCode.INVALID_PATH, []],
    ["too large", { size: 1024 ** 3 + 1 }, {}, EditErrorCode.FILE_TOO_LARGE, ["stat"]],
    [
      "notebook",
      { name: "synthetic.ipynb", emptyState: true },
      {},
      EditErrorCode.NOTEBOOK_FILE,
      ["stat", "read"],
    ],
    [
      "existing nonempty create",
      {},
      { old_string: "" },
      EditErrorCode.FILE_EXISTS_NO_OLD_STRING,
      ["stat", "read"],
    ],
    [
      "whitespace unread",
      { content: " \n", emptyState: true },
      { old_string: "" },
      EditErrorCode.FILE_NOT_READ,
      ["stat", "read"],
    ],
  ] as const)
    test(mode + " " + `Edit admission ordering ${label}`, async () => {
      const f = fixture(options);
      const result: any = await f.run(input);
      assert.equal(result.errorCode, code);
      assert.deepEqual(f.events, events);
    });

  test(mode + " " + "Edit exact 1 GiB stat limit remains admissible", async () => {
    const f = fixture({ size: 1024 ** 3 });
    await f.run();
    assert.ok(f.calls.write);
  });
  test(mode + " " + "Edit missing port still precedes no-change", async () => {
    const f = fixture({ noPort: true });
    await assert.rejects(f.run({ new_string: "alpha" }), /FileSystemPort is not configured/);
    assert.deepEqual(f.events, []);
  });
  test(mode + " " + "Edit creation retains raw CRLF and skips read and listing", async () => {
    const f = fixture({ missing: true, emptyState: true });
    await f.run({ old_string: "", new_string: "x\r\ny" });
    assert.deepEqual(f.events, ["stat", "write", "metadata"]);
    assert.equal(f.calls.write![0].content, "x\r\ny");
    assert.equal(f.calls.write![0].expectedRevision, undefined);
    assert.equal(f.calls.write![0].lineEndings, "LF");
  });
  test(mode + " " + "Edit existing whitespace notebook follows create branch", async () => {
    const f = fixture({ name: "synthetic.ipynb", content: " \r\n" });
    await f.run({ old_string: "", new_string: "a\r\nb" });
    assert.equal(f.calls.write![0].content, "a\nb");
  });
  for (const replacement of ["$&$$$1", ""])
    test(
      mode +
        " " +
        `Edit replacement is literal and deletion consumes following newline ${JSON.stringify(replacement)}`,
      async () => {
        const f = fixture({ content: "alpha\nnext" });
        await f.run({ new_string: replacement });
        assert.equal(
          f.calls.write![0].content,
          replacement === "" ? "next" : `${replacement}\nnext`,
        );
      },
    );
  test(
    mode + " " + "Edit missing filename suggestion and listing failure retain failure envelope",
    async () => {
      for (const fail of [undefined, "list"]) {
        const f = fixture({
          missing: true,
          fail,
          entries: [{ name: "knorvia-transaction.md", kind: "file" }],
        });
        const output: any = await f.run();
        assert.deepEqual(output, {
          result: false,
          errorCode: EditErrorCode.FILE_NOT_EXIST,
          message: `File does not exist. Note: your current working directory is ${tmpdir()}.${fail ? "" : " Did you mean knorvia-transaction.md?"}`,
        });
        assert.deepEqual(f.events, ["stat", "list"]);
        assert.equal(f.calls.list![1].signal, f.signal);
        assert.deepEqual(f.calls.list![0].trace, f.trace);
      }
    },
  );
  test(mode + " empty fuzzy match terminates with ambiguity without mutating state", async () => {
    const moduleUrl = new URL(
      mode === "source" ? "../src/tool/handlers/edit.ts" : "../dist/tool/handlers/edit.js",
      import.meta.url,
    );
    const probe = fileURLToPath(new URL("./fixtures/edit-empty-match-probe.mjs", import.meta.url));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", probe, moduleUrl.href, String(EditErrorCode.AMBIGUOUS_REPLACE)],
      { timeout: 30_000 },
    );
    assert.match(stdout, /3 empty-match boundaries rejected without write/);
  });
  test(mode + " empty fuzzy match retains empty-file insertion", async () => {
    const f = fixture({ content: "" });
    await f.run({ old_string: "\t", new_string: "replacement" });
    assert.equal(f.calls.write![0].content, "replacement");
  });
}
