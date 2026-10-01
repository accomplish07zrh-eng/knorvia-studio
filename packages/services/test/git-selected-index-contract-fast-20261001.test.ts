import assert from "node:assert/strict";
import { test } from "node:test";
import { selectedIndexFixture } from "./git-selected-index-fixture-fast-20261001.js";
const f = await selectedIndexFixture();
const index = (path: string, stage = "0", mode = "100644", objectHash = "owned-object") => ({
  mode,
  objectHash,
  stage,
  path,
});
const valid = [
  { name: "empty records", text: "\0\0", output: [] },
  {
    name: "ordered duplicates and final unterminated record",
    text: "m h 0\ta\0\0m h 0\ta\0m h 0\tb",
    output: [index("a", "0", "m", "h"), index("a", "0", "m", "h"), index("b", "0", "m", "h")],
  },
  {
    name: "ECMAScript Unicode header whitespace",
    text: " \ufeff100644\u00a0owned-object\u202f0 \towned\0",
    output: [index("owned")],
  },
  {
    name: "ignored extra tokens",
    text: "m h 0 ignored extra\towned\0",
    output: [index("owned", "0", "m", "h")],
  },
  {
    name: "literal path tabs CRLF spaces and Unicode",
    text: "m h 0\t --owned\\sub\t路径\r\n \0",
    output: [index(" --owned/sub\t路径\r\n ", "0", "m", "h")],
  },
  {
    name: "arbitrary mode/hash/stage preserved",
    text: "not-mode not-hash 00\towned\0",
    output: [index("owned", "00", "not-mode", "not-hash")],
  },
];
for (const c of valid)
  test(`index records: ${c.name}`, () => {
    for (const parse of [f.parse, f.legacyParse]) assert.deepEqual(parse(c.text), c.output);
  });
for (const text of [
  "m h 0 owned",
  "\towned\0",
  "m\towned\0",
  "m h\towned\0",
  "m h 0\t\0",
  "m h 1\towned\0missing tab\0",
])
  test(`malformed index record ${JSON.stringify(text)}`, () => {
    for (const parse of [f.parse, f.legacyParse])
      assert.throws(() => parse(text), {
        name: "Error",
        message: "Failed to parse staged Git index entry.",
      });
  });
test("non-string stdout keeps existing TypeError priority/message", () => {
  for (const value of [null, undefined, 1]) {
    const errors = [f.parse, f.legacyParse].map((parse) => {
      try {
        parse(value);
        assert.fail("expected wrong stdout type error");
      } catch (e) {
        assert.ok(e instanceof TypeError);
        return [e.name, e.message];
      }
    });
    assert.deepEqual(errors[0], errors[1]);
  }
});
test("selected rename membership is fixed before originals enlarge cleanup", () => {
  const paths = Object.freeze(["selected", "other", "selected"]);
  const entries = Object.freeze(
    [
      { path: "selected", originalPath: "rename-source" },
      { path: "rename-source", originalPath: "must-stay-unselected" },
      { path: "other", originalPath: "rename-source" },
      { path: "selected", originalPath: "other" },
      { path: "other", originalPath: "" },
    ].map(Object.freeze),
  );
  for (const cleanup of [f.cleanup, f.legacyCleanup])
    assert.deepEqual(
      cleanup(paths, () => entries),
      ["selected", "other", "rename-source"],
    );
});
test("selection snapshot and eager path phase precede original getters", () => {
  function observe(cleanup: typeof f.cleanup) {
    const trace: string[] = [];
    const paths = ["owned"];
    Object.defineProperty(paths, Symbol.iterator, {
      value: function* () {
        trace.push("selected");
        yield "owned";
      },
    });
    const entries = [0, 1].map((n) => ({
      get path() {
        trace.push(`path:${n}`);
        return "owned";
      },
      get originalPath() {
        trace.push(`original:${n}`);
        return `rename:${n}`;
      },
    }));
    const output = cleanup(paths, () => {
      trace.push("status");
      return entries;
    });
    assert.deepEqual(output, ["owned", "rename:0", "rename:1"]);
    return trace;
  }
  const expected = ["selected", "status", "path:0", "path:1", "original:0", "original:1"];
  assert.deepEqual(observe(f.cleanup), expected);
  assert.deepEqual(observe(f.legacyCleanup), expected);
});
test("cleanup sparse records and thrown acquisition preserve failure identity", () => {
  const error = new Error("owned status projection failure"),
    entries = [
      { path: "owned", originalPath: "rename" },
      { path: "unused", originalPath: null },
    ];
  delete entries[1];
  for (const cleanup of [f.cleanup, f.legacyCleanup]) {
    assert.deepEqual(
      cleanup(["owned"], () => entries),
      ["owned", "rename"],
    );
    assert.throws(
      () =>
        cleanup(["owned"], () => {
          throw error;
        }),
      (e) => e === error,
    );
  }
});
