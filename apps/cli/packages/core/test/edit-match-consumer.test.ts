// Actual Edit with synthetic filesystem ports; no user file is accessed.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { editToolEntry as sourceEntry } from "../src/tool/handlers/edit.js";
import { editToolEntry as emittedEntry } from "../dist/tool/handlers/edit.js";
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
import type { ReadFileStateMap, ToolExecutionContext } from "../src/tool/types.js";
const rows = [
  {
    label: "exact",
    content: "before alpha after",
    search: "alpha",
    replacement: "beta",
    written: "before beta after",
    strategy: "exact",
  },
  {
    label: "visible",
    content: "a\nb",
    search: "a\\nb",
    replacement: "Y\\nZ",
    written: "Y\nZ",
    strategy: "escape_normalized",
  },
  {
    label: "quote",
    content: "‘old’",
    search: "'old'",
    replacement: "'new'",
    written: "‘new’",
    strategy: "quote_normalized",
  },
  {
    label: "anchor",
    content: "head\nabcdefghij\ntail",
    search: "head\nabcdefghiX\ntail",
    replacement: "changed",
    written: "changed",
    strategy: "block_anchor",
  },
  {
    label: "all",
    content: "a a",
    search: "a",
    replacement: "b",
    written: "b b",
    replaceAll: true,
    strategy: "exact",
  },
  { label: "repeated-exact-rejected", content: "a a", search: "a", replacement: "b" },
  { label: "broad-ambiguous-rejected", content: " a \n  a  ", search: "a\n", replacement: "b" },
  { label: "not-found", content: "abc", search: "xyzxyz", replacement: "b" },
];
for (const [mode, editToolEntry] of [
  ["source", sourceEntry],
  ["emitted", emittedEntry],
] as const) {
  for (const row of rows)
    test(mode + " actual Edit " + row.label, async () => {
      const path = join(tmpdir(), "knorvia-synthetic-edit.txt");
      const revision = { id: "before", mtimeMs: 1, sizeBytes: Buffer.byteLength(row.content) };
      const states: ReadFileStateMap = new Map([
        [
          createReadFileStateKey(path, 1, undefined),
          {
            path,
            content: row.content,
            isPartialView: false,
            readAt: new Date(0),
            sourceTool: "Read",
            mtimeMs: 1,
            sizeBytes: revision.sizeBytes,
            revisionId: "before",
          },
        ],
      ]);
      const writes: any[] = [];
      const context = {
        workingDirectory: tmpdir(),
        workspaceRoot: tmpdir(),
        readFileState: states,
        abortSignal: new AbortController().signal,
        fileSystemPort: {
          stat: async () => ({ kind: "file", sizeBytes: revision.sizeBytes }),
          readTextFile: async () => ({
            path,
            content: row.content,
            encoding: "utf8",
            lineEndings: "lf",
            sizeBytes: revision.sizeBytes,
            bytesRead: revision.sizeBytes,
            truncated: false,
            revision,
          }),
          writeTextFile: async (...args: any[]) => {
            writes.push(args);
            return {
              path,
              revision: { id: "after", mtimeMs: 2, sizeBytes: Buffer.byteLength(args[0].content) },
            };
          },
        },
      } as unknown as ToolExecutionContext;
      assert.equal(editToolEntry.permission!.needsApproval, true);
      const result: any = await editToolEntry.handler(
        {
          file_path: path,
          old_string: row.search,
          new_string: row.replacement,
          replace_all: row.replaceAll ?? false,
        },
        context,
      );
      if (row.written === undefined) {
        assert.equal(result.result, false);
        assert.equal(writes.length, 0);
        assert.equal([...states.values()][0]!.sourceTool, "Read");
      } else {
        assert.equal(writes.length, 1);
        assert.equal(writes[0][0].content, row.written);
        assert.equal(writes[0][0].expectedRevision, revision);
        assert.equal(writes[0][0].atomic, true);
        assert.equal(writes[0][0].createParents, true);
        assert.equal(writes[0][1].signal, context.abortSignal);
        assert.equal(result.matchStrategy, row.strategy);
        assert.equal([...states.values()][0]!.content, row.written);
        assert.equal([...states.values()][0]!.sourceTool, "Edit");
      }
    });
}
