// Runs in a bounded child process so a synchronous regression cannot hang the test runner.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { editToolEntry } = await import(process.argv[2]);
const expectedCode = Number(process.argv[3]);
for (const content of ["\nnext", "next\n", "\n\nnext"]) {
  const path = join(tmpdir(), "knorvia-empty-match-synthetic.txt");
  const snapshot = {
    path,
    content,
    isPartialView: false,
    readAt: new Date(1),
    sourceTool: "Read",
    sizeBytes: content.length,
    revisionId: "same",
    mtimeMs: 1,
  };
  const states = new Map([["synthetic", snapshot]]);
  const events = [];
  const result = await editToolEntry.handler(
    { file_path: path, old_string: "\t", new_string: "replacement", replace_all: false },
    {
      workingDirectory: tmpdir(),
      workspaceRoot: tmpdir(),
      readFileState: states,
      fileSystemPort: {
        stat: async () => {
          events.push("stat");
          return { kind: "file", sizeBytes: content.length };
        },
        readTextFile: async () => {
          events.push("read");
          return {
            path,
            content,
            sizeBytes: content.length,
            revision: { id: "same", mtimeMs: 1, sizeBytes: content.length },
          };
        },
        writeTextFile: async () => {
          throw new Error("unexpected write");
        },
      },
      recordReadFileStateMetadata: () => {
        throw new Error("unexpected metadata");
      },
    },
  );
  assert.equal(result.errorCode, expectedCode);
  assert.match(result.message, new RegExp(`Found ${content.length + 1} matches`));
  assert.deepEqual(events, ["stat", "read"]);
  assert.equal([...states.values()][0], snapshot);
}
console.log("3 empty-match boundaries rejected without write");
