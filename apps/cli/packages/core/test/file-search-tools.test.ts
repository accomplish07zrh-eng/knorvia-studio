// Synthetic search ports only; never enumerate or search user files.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoreErrorType, createFileSystemError } from "@knorvia/contracts";
import { globToolEntry as sourceGlob } from "../src/tool/handlers/glob.js";
import { globToolEntry as emittedGlob } from "../dist/tool/handlers/glob.js";
import { grepToolEntry as sourceGrep } from "../src/tool/handlers/grep.js";
import { grepToolEntry as emittedGrep } from "../dist/tool/handlers/grep.js";
import type { ToolExecutionContext } from "../src/tool/types.js";
const root = join(tmpdir(), "knorvia-search-synthetic");
const path = (...parts: string[]) => join(root, ...parts);
function fixture(result: any, error?: unknown) {
  const calls: any[] = [];
  const signal = new AbortController().signal;
  const trace = {
    traceId: "trace",
    spanId: "span",
    parentSpanId: "parent",
    sessionId: "session",
    turnId: "turn",
  };
  const invoke =
    (name: string) =>
    async (...args: any[]) => {
      calls.push([name, ...args]);
      if (error !== undefined) throw error;
      return result;
    };
  const context = {
    ...trace,
    workingDirectory: root,
    workspaceRoot: root,
    abortSignal: signal,
    fileSystemPort: { searchFiles: invoke("glob"), searchText: invoke("grep") },
  } as unknown as ToolExecutionContext;
  return { context, calls, signal, trace };
}
const fileResult = {
  durationMs: 12,
  files: [
    path("sub", "b.ts"),
    path("a.ts"),
    path("a.ts"),
    root,
    path("..hidden.ts"),
    path("..", "outside.ts"),
  ],
  truncated: true,
};
const displayed = ["sub/b.ts", "a.ts", "a.ts", root, path("..hidden.ts"), path("..", "outside.ts")];
assert.notEqual(sourceGlob, emittedGlob);
assert.notEqual(sourceGrep, emittedGrep);
for (const [surface, globToolEntry, grepToolEntry] of [
  ["source", sourceGlob, sourceGrep],
  ["emitted", emittedGlob, emittedGrep],
] as const) {
  for (const inputPath of [undefined, "", "sub"])
    test(
      surface +
        " " +
        `Glob forwards one bounded search and ordered paths ${JSON.stringify(inputPath)}`,
      async () => {
        const f = fixture(fileResult);
        const output: any = await globToolEntry.handler(
          { pattern: "**/*.ts", path: inputPath },
          f.context,
        );
        assert.deepEqual(f.calls, [
          [
            "glob",
            {
              path: inputPath ? path("sub") : root,
              pattern: "**/*.ts",
              maxResults: 100,
              trace: f.trace,
            },
            { signal: f.signal },
          ],
        ]);
        assert.deepEqual(output, {
          durationMs: 12,
          numFiles: 6,
          filenames: displayed,
          truncated: true,
        });
        assert.equal(
          globToolEntry.formatModelContent!(output),
          displayed.join("\n") +
            "\n(Results are truncated. Consider using a more specific path or pattern.)",
        );
      },
    );
  test(surface + " " + "Glob empty model result keeps its exact message", () => {
    assert.equal(
      globToolEntry.formatModelContent!({ filenames: [], truncated: true }),
      "No files found",
    );
  });
  for (const [name, entry] of [
    ["Glob", globToolEntry],
    ["Grep", grepToolEntry],
  ] as const) {
    test(
      surface + " " + `${name} missing port is a configuration error after schema admission`,
      async () => {
        const f = fixture(fileResult);
        f.context.fileSystemPort = undefined;
        await assert.rejects(entry.handler({ pattern: "x" }, f.context), (error: any) => {
          assert.equal(error.type, CoreErrorType.ConfigurationError);
          assert.equal(error.context.toolName, name);
          assert.equal(error.recoverable, false);
          return true;
        });
        await assert.rejects(
          entry.handler({ pattern: 42 }, f.context),
          (error: any) => error.type !== CoreErrorType.ConfigurationError,
        );
        assert.deepEqual(f.calls, []);
      },
    );
    test(surface + " " + `${name} ordinary port error propagates unchanged`, async () => {
      const problem = new Error("synthetic search failure"),
        f = fixture(fileResult, problem);
      await assert.rejects(
        entry.handler({ pattern: "x" }, f.context),
        (error) => error === problem,
      );
      assert.equal(f.calls.length, 1);
    });
    test(
      surface + " " + `${name} read-only declaration preserves permission and concurrency`,
      () => {
        assert.equal(entry.metadata.readOnly, true);
        assert.equal(entry.metadata.concurrentSafe, true);
        assert.equal(entry.permission!.needsApproval, false);
        assert.equal(entry.permission!.permission, "read");
      },
    );
  }
  test(surface + " " + "Glob cancellation remains the original filesystem error", async () => {
    const problem = createFileSystemError({ code: "cancelled", message: "synthetic stop" }),
      f = fixture(fileResult, problem);
    await assert.rejects(
      globToolEntry.handler({ pattern: "x" }, f.context),
      (error) => error === problem,
    );
  });
  test(surface + " " + "Grep cancellation wraps once and retains cause/context", async () => {
    const problem = createFileSystemError({ code: "cancelled", message: "synthetic stop" }),
      f = fixture(fileResult, problem);
    await assert.rejects(
      grepToolEntry.handler({ pattern: "x", path: "sub" }, f.context),
      (error: any) => {
        assert.equal(error.type, CoreErrorType.ToolCancelled);
        assert.equal(error.message, "Grep was cancelled");
        assert.equal(error.cause, problem);
        assert.equal(error.recoverable, true);
        assert.deepEqual(error.context, {
          path: path("sub"),
          toolCallId: undefined,
          toolName: "Grep",
        });
        return true;
      },
    );
  });
  for (const options of [
    {},
    { "-C": 3 },
    { context: 2, "-C": 9, "-A": 0, "-B": -1 },
    { context: 0, "-C": 9 },
  ])
    test(
      surface + " " + `Grep forwards exact context precedence ${JSON.stringify(options)}`,
      async () => {
        const f = fixture({
          ...fileResult,
          mode: "files_with_matches",
          entries: [],
          numMatches: 9,
        });
        const input = {
          pattern: "a.*b",
          path: "sub",
          glob: "*.ts",
          output_mode: "count",
          "-n": false,
          "-o": true,
          "-i": true,
          type: "ts",
          head_limit: 0,
          offset: -1,
          multiline: true,
          ...options,
        };
        const output: any = await grepToolEntry.handler(input, f.context);
        const n = (options as any).context ?? (options as any)["-C"];
        assert.deepEqual(f.calls, [
          [
            "grep",
            {
              path: path("sub"),
              pattern: "a.*b",
              glob: "*.ts",
              outputMode: "count",
              beforeContext: (options as any)["-B"] ?? n,
              afterContext: (options as any)["-A"] ?? n,
              context: n,
              showLineNumbers: false,
              onlyMatching: true,
              ignoreCase: true,
              type: "ts",
              headLimit: 0,
              offset: -1,
              multiline: true,
              trace: f.trace,
            },
            { signal: f.signal },
          ],
        ]);
        assert.equal(output.mode, "files_with_matches");
        assert.deepEqual(output.filenames, displayed);
        assert.equal(output.numFiles, 6);
        assert.equal(output.numMatches, 9);
      },
    );
  for (const mode of ["content", "count", "files_with_matches"] as const)
    for (const showNumbers of [undefined, false])
      test(
        surface + " " + `Grep projects returned ${mode} with line-number flag ${showNumbers}`,
        async () => {
          const entries = [
            { path: path("a.ts"), lineNumber: 0, text: "zero", count: 2 },
            { path: path("sub", "b.ts"), count: undefined },
            { path: path("..", "outside.ts"), lineNumber: 3, text: "", count: -1 },
          ];
          const f = fixture({
            ...fileResult,
            mode,
            entries,
            numMatches: 7,
            appliedLimit: 0,
            appliedOffset: 0,
          });
          const output: any = await grepToolEntry.handler(
            { pattern: "x", "-n": showNumbers },
            f.context,
          );
          const common = {
            mode,
            durationMs: 12,
            numFiles: 6,
            filenames: mode === "files_with_matches" ? displayed : [],
            truncated: true,
            appliedLimit: 0,
            appliedOffset: 0,
            numMatches: 7,
          };
          const content =
            mode === "content"
              ? [
                  showNumbers === false ? "a.ts:zero" : "a.ts:0:zero",
                  "sub/b.ts:",
                  `${path("..", "outside.ts")}:${showNumbers === false ? "" : "3:"}`,
                ].join("\n")
              : mode === "count"
                ? `a.ts:2\nsub/b.ts:0\n${path("..", "outside.ts")}:-1`
                : undefined;
          assert.deepEqual(output, {
            ...common,
            ...(content === undefined ? {} : { content }),
            ...(mode === "content" ? { numLines: 3 } : {}),
          });
          const model = grepToolEntry.formatModelContent!(output);
          assert.equal(
            model,
            mode === "content"
              ? `${content}\n\n[Showing results with pagination = limit: 0, offset: 0]`
              : mode === "count"
                ? `${content}\n\nFound 7 total occurrences across 6 files. with pagination = limit: 0, offset: 0`
                : `Found 6 files limit: 0, offset: 0\n${displayed.join("\n")}`,
          );
        },
      );
  test(surface + " " + "Grep model output preserves empty, singular and zero summary forms", () => {
    const format = grepToolEntry.formatModelContent!;
    assert.equal(format({ mode: "content", content: "" }), "No matches found");
    assert.equal(
      format({ mode: "count", numMatches: 1, numFiles: 1 }),
      "No matches found\n\nFound 1 total occurrence across 1 file.",
    );
    assert.equal(format({ filenames: ["a"], numFiles: 0 }), "No files found");
    assert.equal(format({ filenames: ["a"] }), "Found 1 file\na");
  });

  test(
    surface + " " + "Grep retains non-content/count fallback for a future port mode",
    async () => {
      const f = fixture({ ...fileResult, mode: "future_mode", numMatches: 7 });
      const output = await grepToolEntry.handler({ pattern: "x" }, f.context);
      assert.deepEqual(output, {
        mode: "future_mode",
        durationMs: 12,
        numFiles: 6,
        filenames: [],
        truncated: true,
        appliedLimit: undefined,
        appliedOffset: undefined,
        numMatches: 7,
      });
    },
  );
}
