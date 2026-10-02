// Minimal synthetic data-boundary checks, not the ordinary protocol/UI suite.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

const root = process.argv[2];
assert.ok(root, "Supply the baseline or candidate source root.");
const plain = (value) => JSON.parse(JSON.stringify(value));
async function load(name) {
  const output = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    Date: { now: () => 9000 },
  });
  return module.exports;
}

test("snapshot data boundary admits loaded updates, excludes absent targets and isolates unpublished mutation", async () => {
  const api = await load("protocol-v4/apply");
  const row = { rowId: 7, kind: "assistantText", text: "synthetic" };
  const source = { rows: { window: [row], totalCount: 3, firstRowId: 1 }, revision: 1 };
  assert.equal(
    api.applyConversationDelta(source, { op: "row.upserted", row: { ...row, rowId: 8 } }),
    source,
  );
  assert.equal(
    api.applyConversationDelta(source, {
      op: "row.delta",
      rowId: 99,
      path: "text",
      append: "denied",
    }),
    source,
  );
  const accumulator = api.createMutableConversationSnapshotAccumulator(source);
  assert.notEqual(accumulator.snapshot.rows.window, source.rows.window);
  assert.equal(accumulator.snapshot.rows.window[0], row);
  api.applyConversationDeltasMutable(accumulator, [
    { op: "row.delta", rowId: 7, path: "text", append: "-admitted" },
    { op: "row.removed", fromRowId: 1 },
    { op: "row.appended", row: { rowId: 9, kind: "reasoning", text: "new" } },
  ]);
  assert.equal(source.rows.window[0].text, "synthetic");
  assert.deepEqual(plain(accumulator.snapshot.rows), {
    window: [{ rowId: 9, kind: "reasoning", text: "new" }],
    totalCount: 1,
    firstRowId: 9,
  });
  assert.equal(accumulator.rowIndexById.has(7), false);
  assert.equal(accumulator.rowIndexById.get(9), 0);
  // Preserve the existing pure API predicate outside the stricter wire schema.
  const nonfinite = api.createMutableConversationSnapshotAccumulator(source);
  api.applyConversationDeltaMutable(nonfinite, { op: "row.removed", fromRowId: NaN });
  assert.equal(nonfinite.snapshot.rows.window[0], row);
  assert.equal(nonfinite.snapshot.rows.totalCount, 3);
});

test("coalescing data boundary preserves removal/generation barriers and whole-key state replacement", async () => {
  const api = await load("protocol-v4/coalesce");
  const first = { op: "row.delta", rowId: 7, path: "text", append: "retained" };
  const barrier = { op: "row.removed", fromRowId: 1 };
  const generation = { op: "row.appended", row: { rowId: 7, kind: "assistantText", text: "" } };
  const replacement = { op: "row.upserted", row: { rowId: 7, kind: "assistantText", text: "new" } };
  const result = api.coalesceConversationDeltas([
    first,
    barrier,
    generation,
    { op: "row.delta", rowId: 7, path: "text", append: "superseded" },
    replacement,
    { op: "state.updated", patch: { config: { old: true }, revision: 1 } },
    { op: "state.updated", patch: { config: { replacement: true } } },
  ]);
  assert.equal(result[0], first);
  assert.equal(result[1], barrier);
  assert.equal(result[2], generation);
  assert.equal(result[3], replacement);
  assert.deepEqual(plain(result[4]), {
    op: "state.updated",
    patch: { config: { replacement: true }, revision: 1 },
  });
  assert.equal(result.length, 5);
  let reads = 0;
  const items = [
    { key: "a", value: 1 },
    { key: "b", value: 2 },
    { key: "a", value: 3 },
  ];
  const conflated = api.conflateByKey(items, (item) => {
    reads++;
    return item.key;
  });
  assert.equal(reads, 6);
  assert.equal(conflated[0], items[1]);
  assert.equal(conflated[1], items[2]);
});

test("partial-input boundary admits recognized strings and rejects unknown fields or background materialization", async () => {
  const api = await load("streaming-tool-input-preview");
  const preview = api.buildKnorviaStreamingToolInputPreview('{"script":"line\\nnext\\u12');
  assert.deepEqual(plain(preview.input), { script: "line\nnext" });
  assert.equal(preview.complete, false);
  assert.deepEqual(
    plain(api.buildKnorviaStreamingToolInputPreview('{"unknown":"synthetic').input),
    {},
  );
  assert.equal(api.buildKnorviaStreamingToolInputPreview("invalid", null).input, null);
  assert.equal(api.buildKnorviaStreamingToolInputPreview("null").complete, true);
  const state = {
    rawInput: "x".repeat(9000),
    deltaCount: 2,
    lastPreviewAt: 1000,
    lastPreviewRawInputLength: 0,
  };
  assert.equal(
    api.shouldMaterializeKnorviaStreamingToolInputPreview(state, {
      mode: "background-summary",
      now: 9000,
    }),
    false,
  );
  assert.equal(
    api.shouldMaterializeKnorviaStreamingToolInputPreview(state, {
      toolName: " Write ",
      now: 1999,
    }),
    false,
  );
  assert.equal(
    api.shouldMaterializeKnorviaStreamingToolInputPreview(state, { toolName: "Write", now: 2000 }),
    true,
  );
  assert.equal(api.shouldMaterializeKnorviaStreamingToolInputPreview(state, { now: 1000 }), true);
});

test("summary data boundary admits edit pairs and excludes non-edit/array sources while retaining empty-field precedence", async () => {
  const api = await load("tool-call-summary");
  const source = {
    title: " Synthetic\n tool ",
    kind: "Edit",
    input: { old_string: "", new_string: "a\nb\n", command: "  echo   fixture " },
  };
  assert.deepEqual(plain(api.getCompactToolCallSummary(source)), {
    primaryText: "Synthetic tool",
    secondaryText: "echo fixture",
    changeStat: { added: 2, removed: 0 },
  });
  assert.equal(api.getCompactToolCallSummary({ ...source, kind: "Read" }).changeStat, undefined);
  assert.equal(
    api.getCompactToolCallSummary({ kind: "Edit", input: [source.input] }).changeStat,
    undefined,
  );
  assert.equal(
    api.getCompactToolCallSummary({
      kind: "Edit",
      input: { old_string: "", new_string: "" },
      output: source.input,
    }).changeStat,
    undefined,
  );
  assert.equal(
    api.getCompactToolCallStatusMessageId("output-available", "stopped"),
    "chat.toolCall.status.stopped",
  );
});

test("permission-preview data boundary bounds paths, excludes directories/invalid changes and respects raw-input precedence", async () => {
  const api = await load("permission-request-preview");
  const raw = {
    rawInput: null,
    input: { command: "synthetic denied fallback" },
    cwd: { path: "/ignored-fixture" },
    paths: ["a", "a", "b", "c", "d", "e", "f", "g"],
    changes: { a: { type: "add" }, b: { type: "delete" } },
  };
  raw.cycle = raw;
  const preview = api.getPermissionRequestPreview({
    title: "",
    description: "unused fallback",
    kind: "Edit",
    raw,
  });
  assert.equal(preview.title, "permission");
  assert.equal(preview.command, null);
  assert.equal(preview.scope, "file");
  assert.deepEqual(plain(preview.filePaths), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(plain(preview.fileChanges), [{ path: "a", type: "add" }]);
  assert.equal(preview.fileChange, preview.fileChanges[0]);
  const command = api.getPermissionRequestPreview({
    description: "Synthetic",
    kind: "Bash",
    raw: { input: { command: " fixture\r\ncommand ", args: [" x ", 2, false, null] } },
  });
  assert.equal(command.command, "fixture\ncommand x 2 false");
  assert.equal(command.scope, "command");
});
