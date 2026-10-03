// New synthetic compatibility tests; retain the repository's transition licence.
// No file-level MIT grant is made before completion of source review.
import assert from "node:assert/strict";
import { normalize } from "node:path";
import test from "node:test";
import {
  createReadFileStateKey,
  findEditableReadFileState,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../src/tool/read-file-state.js";
import {
  createReadFileStateMetadata,
  createReadFileStateMetadataFromEntry,
  parseReadFileStateMetadata,
} from "../src/tool/read-file-state-metadata.js";
import type { ReadFileStateEntry } from "../src/tool/types.js";

const completedAt = new Date(12345);
function entry(overrides: Partial<ReadFileStateEntry> = {}): ReadFileStateEntry {
  return {
    path: "/fixture/read.txt",
    content: "one\ntwo\n",
    isPartialView: false,
    readAt: new Date(100),
    revisionId: "revision-fixture",
    mtimeMs: 90.5,
    sizeBytes: 8,
    ...overrides,
  };
}
function metadata() {
  return {
    schemaVersion: 1,
    tool: "Read",
    path: "/fixture/read.txt",
    content: "one\ntwo\n",
    isPartialView: false,
    readAtMs: 12345,
    revisionId: "revision-fixture",
    mtimeMs: 90.5,
    sizeBytes: 8,
  };
}

test("keys preserve platform equivalence, Unicode and independent windows", () => {
  // 既有非 win32 分支使用宿主 normalize，并不模拟 POSIX；Windows CI 必须验证宿主分隔符。
  assert.equal(
    createReadFileStateKey("/fixture/../read.txt", undefined, undefined, "linux"),
    `${normalize("/fixture/../read.txt")}\u00001\u0000`,
  );
  assert.equal(
    createReadFileStateKey("/c/read.txt", 1, undefined, "win32"),
    "C:\\read.txt\u00001\u0000",
  );
  assert.equal(createReadFileStateKey("c:/read.txt", 1, 2, "win32"), "C:\\read.txt\u00001\u00002");
  assert.equal(
    createReadFileStateKey("/caf\u0065\u0301", 0, 0, "linux"),
    `${normalize("/café")}\u00000\u00000`,
  );
  assert.notEqual(
    createReadFileStateKey("/a", 0, undefined),
    createReadFileStateKey("/a", undefined, undefined),
  );
  assert.notEqual(createReadFileStateKey("/a", 1, 0), createReadFileStateKey("/a", 1, undefined));
});

test("latest watermarks retain object identity, partial updates and stable equal-time precedence", () => {
  const full = entry();
  const partial = entry({ isPartialView: true, offset: 2, limit: 1, readAt: new Date(200) });
  const tie = entry({ sourceTool: "Write", readAt: new Date(200) });
  const foreign = entry({ path: "/elsewhere", readAt: new Date(9999) });
  const states = new Map([
    ["full", full],
    ["partial", partial],
    ["foreign", foreign],
  ]);
  assert.equal(findLatestReadFileState(states, full.path), partial);
  assert.equal(findEditableReadFileState(states, full.path), partial);
  states.set("tie", tie);
  states.set("older", entry({ readAt: new Date(50) }));
  assert.equal(findLatestReadFileState(states, full.path), tie);
  assert.equal(findLatestReadFileState(undefined, full.path), undefined);
  assert.equal(findLatestReadFileState(states, "/missing"), undefined);
  assert.equal(states.size, 5);
});

test("query uses platform path policy rather than globally folding case", () => {
  const value = entry({ path: "c:/Mixed.txt" });
  const states = new Map([["arbitrary storage key", value]]);
  assert.equal(findLatestReadFileState(states, "/c/Mixed.txt", "win32"), value);
  assert.equal(findLatestReadFileState(states, "C:/mixed.txt", "win32"), undefined);
});

test("mtime normalization keeps the original arithmetic boundary", () => {
  for (const value of [0, 0.9, -0.1, -10.2, Infinity, -Infinity, NaN]) {
    assert.equal(normalizeReadFileStateMtimeMs(value), Math.floor(value));
  }
  assert.equal(normalizeReadFileStateMtimeMs(undefined), undefined);
});

test("entry snapshots preserve freshness and windows but use tool completion time", () => {
  for (const toolName of ["Read", "Write", "Edit"] as const) {
    const value = entry({ offset: 0, limit: 2, isPartialView: true });
    Object.freeze(value);
    assert.deepEqual(
      createReadFileStateMetadataFromEntry({ completedAt, entry: value, toolName }),
      {
        ...metadata(),
        tool: toolName,
        offset: 0,
        limit: 2,
        isPartialView: true,
      },
    );
  }
  assert.equal(createReadFileStateMetadataFromEntry({ completedAt, toolName: "Read" }), undefined);
  for (const missing of [
    { mtimeMs: undefined },
    { sizeBytes: undefined },
    { revisionId: undefined },
    { revisionId: "" },
  ]) {
    assert.equal(
      createReadFileStateMetadataFromEntry({
        completedAt,
        entry: entry(missing),
        toolName: "Read",
      }),
      undefined,
    );
  }
});

test("decoder projects a fresh record and tolerates unknown fields and empty content", () => {
  const inner = Object.freeze({
    ...metadata(),
    content: "",
    extra: "discard",
    offset: 0,
    limit: -0.5,
  });
  const input = Object.freeze({ readFileState: inner });
  const result = parseReadFileStateMetadata(input);
  assert.deepEqual(result, { ...metadata(), content: "", offset: 0, limit: -0.5 });
  assert.notEqual(result, inner);
  for (const tool of ["Read", "Write", "Edit"]) {
    assert.equal(
      parseReadFileStateMetadata({ readFileState: { ...metadata(), tool } })?.tool,
      tool,
    );
  }
});

for (const field of [
  "path",
  "content",
  "revisionId",
  "isPartialView",
  "readAtMs",
  "mtimeMs",
  "sizeBytes",
  "tool",
  "schemaVersion",
]) {
  test(`decoder rejects missing or mistyped required ${field}`, () => {
    const invalid = [undefined, null, [], {}, true, "wrong", Infinity, NaN];
    for (const value of invalid) {
      if (["path", "content", "revisionId"].includes(field) && typeof value === "string") continue;
      if (field === "isPartialView" && typeof value === "boolean") continue;
      assert.equal(
        parseReadFileStateMetadata({ readFileState: { ...metadata(), [field]: value } }),
        undefined,
      );
    }
  });
}

test("decoder rejects empty identity, bad envelopes and non-v1 versions", () => {
  for (const input of [
    undefined,
    null,
    [],
    1,
    "x",
    {},
    { readFileState: [] },
    { readFileState: null },
  ]) {
    assert.equal(parseReadFileStateMetadata(input), undefined);
  }
  for (const change of [{ path: "" }, { revisionId: "" }, { schemaVersion: 2 }]) {
    assert.equal(
      parseReadFileStateMetadata({ readFileState: { ...metadata(), ...change } }),
      undefined,
    );
  }
});

test("invalid optional windows are omitted while finite numbers retain compatibility", () => {
  for (const value of [null, "2", [], {}, Infinity, -Infinity, NaN]) {
    assert.deepEqual(
      parseReadFileStateMetadata({ readFileState: { ...metadata(), offset: value, limit: value } }),
      metadata(),
    );
  }
  assert.deepEqual(
    parseReadFileStateMetadata({
      readFileState: { ...metadata(), readAtMs: -0.5, mtimeMs: -1, sizeBytes: -2 },
    }),
    {
      ...metadata(),
      readAtMs: -0.5,
      mtimeMs: -1,
      sizeBytes: -2,
    },
  );
});

test("Read output snapshot uses exact window lookup and never output text as file state", () => {
  const value = entry({ offset: 2, limit: 1 });
  const readFileState = new Map([[createReadFileStateKey(value.path, 2, 1), value]]);
  const input = {
    completedAt,
    output: { type: "file_unchanged", filePath: value.path },
    readFileState,
    toolInput: { offset: 2, limit: 1 },
    toolName: "Read",
  };
  assert.deepEqual(createReadFileStateMetadata(input), { ...metadata(), offset: 2, limit: 1 });
  assert.equal(createReadFileStateMetadata({ ...input, toolInput: {} }), undefined);
  assert.equal(createReadFileStateMetadata({ ...input, toolName: "Write" }), undefined);
  assert.equal(
    createReadFileStateMetadata({ ...input, output: { ...input.output, unexpected: true } }),
    undefined,
  );
  assert.equal(
    createReadFileStateMetadata({ ...input, output: { type: "text", filePath: value.path } }),
    undefined,
  );
});

test("text and unchanged Read outputs both preserve the cached snapshot", () => {
  const value = entry();
  const readFileState = new Map([[createReadFileStateKey(value.path, 1, undefined), value]]);
  const text = {
    type: "text",
    filePath: value.path,
    content: "model display only",
    numLines: 2,
    startLine: 1,
    totalLines: 2,
  };
  for (const output of [text, { type: "file_unchanged", filePath: value.path }]) {
    for (const toolInput of [undefined, [], {}, { offset: NaN, limit: Infinity }]) {
      assert.deepEqual(
        createReadFileStateMetadata({
          completedAt,
          output,
          readFileState,
          toolInput,
          toolName: "Read",
        }),
        metadata(),
      );
    }
  }
});
