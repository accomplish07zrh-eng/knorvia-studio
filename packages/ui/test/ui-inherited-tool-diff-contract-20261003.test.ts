// SPDX-License-Identifier: Apache-2.0
// Source-exposed patch contracts; use the installed parser rather than a substitute diff renderer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePatchFiles } from "@pierre/diffs";
import {
  buildUnifiedDiff,
  extractBeforeAfter,
  extractStructuredDiff,
} from "../src/lib/toolDiffPreview.js";

function roundtrip(before: string, after: string) {
  const patch = buildUnifiedDiff(before, after, "synthetic.txt");
  assert(patch);
  const body = patch.split("\n").slice(4);
  assert.equal(
    body
      .filter((line) => line[0] !== "+")
      .map((line) => line.slice(1))
      .join("\n"),
    before,
  );
  assert.equal(
    body
      .filter((line) => line[0] !== "-")
      .map((line) => line.slice(1))
      .join("\n"),
    after,
  );
  return patch;
}

test("structured diff adaptation preserves direct precedence, coercion and first valid content entry", () => {
  const direct = {
    type: "diff",
    path: " ",
    oldText: 42,
    newText: "new",
    content: [{ type: "diff", newText: "later" }],
  };
  assert.deepEqual(extractStructuredDiff(direct), {
    path: undefined,
    oldText: "42",
    newText: "new",
  });
  assert.deepEqual(
    extractStructuredDiff({
      content: [
        null,
        { type: "diff", newText: 5 },
        { type: "diff", path: " a.ts ", oldText: null, newText: "" },
        { type: "diff", newText: "later" },
      ],
    }),
    { path: " a.ts ", oldText: "", newText: "" },
  );
  for (const value of [null, [], "patch", { content: {} }, { type: "text", newText: "x" }])
    assert.equal(extractStructuredDiff(value), null);
  assert.deepEqual(extractBeforeAfter({ before: " ", old_string: "old", after: "new" }), {
    before: "old",
    after: "new",
  });
  assert.equal(extractBeforeAfter({ before: "", after: "new" }), null);
});

test("patch headers, newline handling and equal-score addition order are stable", () => {
  assert.equal(
    roundtrip("same\nold", "same\nnew"),
    "diff --git a/synthetic.txt b/synthetic.txt\n--- a/synthetic.txt\n+++ b/synthetic.txt\n@@ -1,2 +1,2 @@\n same\n+new\n-old",
  );
  roundtrip("", "first\n");
  roundtrip("first\n", "");
  roundtrip("same", "same");
  roundtrip("", "");
  roundtrip("a\nb\nc\nb", "b\na\nc\nx\nb");
});

test("created/deleted files and SQL comment bodies remain one real parser file", () => {
  const create = buildUnifiedDiff("", "hello", "new.txt")!;
  const remove = buildUnifiedDiff("hello", "", "old.txt")!;
  assert(create.includes("--- /dev/null"));
  assert(remove.includes("+++ /dev/null"));
  const sql = buildUnifiedDiff("select 1;\n-- old comment", "select 1;", "query.sql")!;
  for (const patch of [create, remove, sql])
    assert.equal(parsePatchFiles(patch).flatMap((p) => p.files).length, 1);
});

test("context limits floor finite values and split distant changes without full common edges", () => {
  const oldLines = Array.from({ length: 100 }, (_, i) => `line-${i}`);
  const nextLines = [...oldLines];
  nextLines[10] = "changed-ten";
  nextLines[80] = "changed-eighty";
  const patch = buildUnifiedDiff(oldLines.join("\n"), nextLines.join("\n"), "context.txt", {
    contextLines: 2.9,
  })!;
  assert.equal((patch.match(/^@@ /gm) ?? []).length, 2);
  assert(!patch.includes(" line-0\n"));
  assert(!patch.includes(" line-99"));
  assert(patch.includes(" line-8\n"));
  assert(patch.includes(" line-82"));
  assert.equal(
    patch,
    buildUnifiedDiff(oldLines.join("\n"), nextLines.join("\n"), "context.txt", { contextLines: 2 }),
  );
  for (const contextLines of [-1, NaN, Infinity])
    assert.equal(
      buildUnifiedDiff("a\nb", "a\nc", "x", { contextLines }),
      buildUnifiedDiff("a\nb", "a\nc", "x"),
    );
});

test("large unique-anchor ranges preserve distant untouched text and exact snapshots", () => {
  const oldLines = Array.from({ length: 700 }, (_, i) => `unique-${i}`);
  const nextLines = [...oldLines];
  nextLines.splice(3, 0, "insert-near-top");
  nextLines.splice(690, 1, "change-near-bottom");
  const patch = roundtrip(oldLines.join("\n"), nextLines.join("\n"));
  assert(patch.includes(" unique-350\n"));
  const limited = buildUnifiedDiff(oldLines.join("\n"), nextLines.join("\n"), "large.txt", {
    contextLines: 3,
  })!;
  assert.equal((limited.match(/^@@ /gm) ?? []).length, 2);
  assert(!limited.includes(" unique-350\n"));
});

test("large repeated ranges without unique anchors retain delete-then-add fallback", () => {
  const before = Array(260).fill("old repeated").join("\n");
  const after = Array(260).fill("new repeated").join("\n");
  const patch = roundtrip(before, after);
  const body = patch.split("\n").slice(4);
  assert.equal(body.length, 520);
  assert(body.slice(0, 260).every((line) => line === "-old repeated"));
  assert(body.slice(260).every((line) => line === "+new repeated"));
});
