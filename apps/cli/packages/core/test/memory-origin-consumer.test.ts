// Actual Write/Edit with synthetic ports only; no user filesystem access.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";
import { writeToolEntry as sourceWrite } from "../src/tool/handlers/write.js";
import { editToolEntry as sourceEdit } from "../src/tool/handlers/edit.js";
import { writeToolEntry as emittedWrite } from "../dist/tool/handlers/write.js";
import { editToolEntry as emittedEdit } from "../dist/tool/handlers/edit.js";
import type { ToolExecutionContext, ReadFileStateMap } from "../src/tool/types.js";

for (const [mode, write, edit] of [
  ["source", sourceWrite, sourceEdit],
  ["emitted", emittedWrite, emittedEdit],
] as const) {
  for (const [name, entry] of [
    ["Write", write],
    ["Edit", edit],
  ] as const) {
    for (const existingOrigin of [false, true])
      test(`${mode} ${name} memory origin ${existingOrigin ? "retains previous owner" : "fills missing metadata"}`, async () => {
        const root = join(tmpdir(), "knorvia-memory-synthetic"),
          path = join(root, "entry.md");
        const content = existingOrigin
          ? "---\ntitle: Example\nmetadata:\n  originSessionId: first-session\n---\nbefore"
          : "---\ntitle: Example\n---\nbefore";
        const revision = { id: "before", mtimeMs: 1, sizeBytes: Buffer.byteLength(content) };
        const states: ReadFileStateMap = new Map([
          [
            "synthetic",
            {
              path,
              content,
              sourceTool: "Read",
              isPartialView: false,
              readAt: new Date(1),
              mtimeMs: 1,
              revisionId: "before",
              sizeBytes: revision.sizeBytes,
            },
          ],
        ]);
        const writes: any[] = [];
        const signal = new AbortController().signal;
        const context = {
          workingDirectory: root,
          workspaceRoot: root,
          memoryRoot: root,
          sessionId: "second-session",
          readFileState: states,
          abortSignal: signal,
          fileSystemPort: {
            stat: async () => ({ kind: "file", sizeBytes: revision.sizeBytes }),
            readTextFile: async () => ({
              path,
              content,
              encoding: "utf8",
              lineEndings: "LF",
              sizeBytes: revision.sizeBytes,
              revision,
            }),
            writeTextFile: async (...args: any[]) => {
              writes.push(args);
              return {
                path,
                revision: {
                  id: "after",
                  mtimeMs: 2,
                  sizeBytes: Buffer.byteLength(args[0].content),
                },
              };
            },
          },
        } as unknown as ToolExecutionContext;
        const result: any = await entry.handler(
          name === "Write"
            ? { file_path: path, content: content.replace("before", "after") }
            : { file_path: path, old_string: "before", new_string: "after", replace_all: false },
          context,
        );
        assert.equal(writes.length, 1);
        assert.equal(writes[0][0].expectedRevision, revision);
        assert.equal(writes[0][0].atomic, true);
        assert.equal(writes[0][1].signal, signal);
        const written = writes[0][0].content as string;
        const yaml = written.slice(4, written.indexOf("\n---", 4));
        const document = parseDocument(yaml);
        assert.equal(
          document.getIn(["metadata", "originSessionId"]),
          existingOrigin ? "first-session" : "second-session",
        );
        if (!existingOrigin) assert.equal(document.getIn(["metadata", "node_type"]), "memory");
        assert.ok(written.endsWith("\n---\nafter"));
        assert.ok(
          [...states.values()].some(
            (value) => value.sourceTool === name && value.content === written,
          ),
        );
        assert.equal(result.originalFile, content);
      });
  }
}
