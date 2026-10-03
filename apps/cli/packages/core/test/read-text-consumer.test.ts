// Synthetic adapter fixtures; retain the repository's transition licence.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { READ_MAX_OUTPUT_TOKENS, type ReadTextOutput } from "@knorvia/contracts";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import { readToolEntry } from "../src/tool/handlers/read.js";
import type { ReadFileStateMap, ToolExecutionContext } from "../src/tool/types.js";

for (const partial of [false, true]) {
  test(`actual Read consumer persists ${partial ? "partial" : "complete"} watermarks and respects caching`, async () => {
    const path = join(tmpdir(), "knorvia-synthetic-read-budget.txt");
    const content = partial
      ? "x".repeat(READ_MAX_OUTPUT_TOKENS * ESTIMATED_TOKEN_CHAR_DIVISOR + 1)
      : "one\ntwo";
    const states: ReadFileStateMap = new Map();
    const receipts: { content: string; isPartialView: boolean }[] = [];
    let reads = 0;
    const context = {
      workingDirectory: tmpdir(),
      workspaceRoot: tmpdir(),
      readFileState: states,
      fileSystemPort: {
        stat: async () => ({
          sizeBytes: content.length,
          mtimeMs: 90.9,
          revision: { id: "fixture-revision", mtimeMs: 90.9 },
        }),
        readTextFileRange: async () => {
          reads++;
          return {
            path,
            content,
            encoding: "utf8",
            sizeBytes: content.length,
            bytesRead: content.length,
            truncated: false,
            startLine: 1,
            lineCount: partial ? 1 : 2,
            totalLines: partial ? 1 : 2,
          };
        },
      },
      recordReadFileStateMetadata: (value: { content: string; isPartialView: boolean }) =>
        receipts.push(value),
    } as unknown as ToolExecutionContext;
    const output = (await readToolEntry.handler({ file_path: path }, context)) as ReadTextOutput;
    assert.equal(output.truncatedByTokenCap === true, partial);
    assert.equal(states.size, 1);
    assert.equal([...states.values()][0]!.isPartialView, partial);
    assert.equal([...states.values()][0]!.revisionId, "fixture-revision");
    assert.equal(receipts[0]!.content, output.content);
    assert.equal(receipts[0]!.isPartialView, partial);
    assert.match(
      String(readToolEntry.formatModelContent!(output)),
      partial ? /Showing a partial view/ : /1\tone\n2\ttwo/,
    );
    const second = await readToolEntry.handler({ file_path: path }, context);
    if (partial) {
      assert.equal(reads, 2);
      assert.deepEqual(second, output);
    } else {
      assert.equal(reads, 1);
      assert.deepEqual(second, { type: "file_unchanged", filePath: path });
    }
    assert.equal(receipts.length, 2);
  });
}
