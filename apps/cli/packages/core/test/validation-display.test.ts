// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createInitialInputValidationModelContent as render } from "../src/tool/input-validation-model-content.js";
import {
  getInitialInputValidationModelContent,
  validateInitialModelToolInput,
} from "../src/tool/executor/validation.js";
import {
  createCustomIssue,
  createInvalidTypeIssue,
  createInvalidUnionIssue,
  createInvalidValueIssue,
  createTooSmallIssue,
  createUnrecognizedKeysIssue,
  type ToolInputValidationIssue as Issue,
} from "../src/tool/tool-input-validation-issues.js";
import type { ToolEntry } from "../src/tool/types.js";
import type { JsonSchema } from "@knorvia/contracts";
import type { RuntimeInputValidationIssue as RuntimeIssue } from "../src/tool/input-normalization.js";

const entry = (schema: JsonSchema = {}) =>
  ({ metadata: { name: "fixture" }, inputSchema: schema }) as ToolEntry;
const body = (text: string) =>
  text.replace(/^<tool_use_error>InputValidationError: /, "").replace(/<\/tool_use_error>$/, "");
const json = (issues: readonly Issue[], runtime?: readonly RuntimeIssue[], schema?: JsonSchema) =>
  JSON.parse(body(render(entry(schema), issues, runtime)));

test("parameter messages preserve category order, path spelling and wrapper", () => {
  const issues = [
    createInvalidTypeIssue(false, "string", ["list", 2, "name"]),
    createUnrecognizedKeysIssue(["extra", "odd.key"], []),
    createInvalidTypeIssue(undefined, "number", ["count"]),
  ];
  assert.equal(
    render(entry(), issues, undefined),
    "<tool_use_error>InputValidationError: fixture failed due to the following issues:\nThe required parameter `count` is missing\nAn unexpected parameter `extra` was provided\nAn unexpected parameter `odd.key` was provided\nThe parameter `list[2].name` type is expected as `string` but provided as `boolean`</tool_use_error>",
  );
  assert.match(render(entry(), [issues[2]], []), /following issue:\n/);
});

test("without runtime data the fallback retains duplicates, scalar encoding and exact indentation", () => {
  const issue = createInvalidValueIssue([1n, new Date(0), undefined, NaN, 'line\nquote"'], []);
  const issues = [
    issue,
    issue,
    createInvalidUnionIssue([[createCustomIssue("nested", [])], []], ["choice"]),
  ];
  const expected = JSON.stringify(
    issues,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  assert.equal(body(render(entry(), issues, undefined)), expected);
  assert.equal(body(render(entry(), issues, [])), expected);
});

test("constraint projection uses runtime order while parameter projection uses JSON order", () => {
  const issues = [createTooSmallIssue("string", 3, ["a"]), createTooSmallIssue("string", 4, ["b"])];
  const runtime = [
    { code: "too_small", path: ["b"] },
    { code: "too_small", path: ["a"] },
  ];
  assert.deepEqual(json(issues, runtime), [issues[1], issues[0]]);
  const params = [
    createInvalidTypeIssue(1, "string", ["a"]),
    createInvalidTypeIssue(1, "string", ["b"]),
  ];
  const content = body(
    render(
      entry(),
      params,
      runtime.map((item) => ({ ...item, code: "invalid_type" })),
    ),
  );
  assert.ok(content.indexOf("`a`") < content.indexOf("`b`"));
});

test("one runtime index is claimed once even when missing-value aliases overlap", () => {
  const literal = createInvalidValueIssue(["required"], ["x"]);
  const type = createInvalidTypeIssue(undefined, "string", ["x"]);
  const runtime = [{ code: "invalid_type", received: "undefined", path: ["x"] }];
  assert.deepEqual(json([literal, type], runtime, { properties: { x: { default: "fallback" } } }), [
    literal,
  ]);
  const second = { ...literal, values: ["different"] };
  assert.deepEqual(json([literal, second], [runtime[0], runtime[0]]), [literal]);
});

test("only own defaults suppress unmatched missing issues; unexpected keys remain visible", () => {
  const missing = createInvalidTypeIssue(undefined, "string", ["x"]);
  const runtime = [{ code: "custom", path: [], message: "runtime" }];
  assert.equal(
    json([missing], runtime, { properties: { x: { default: undefined } } })[0].message,
    "runtime",
  );
  const inherited = Object.create({ default: "fallback" });
  assert.match(
    body(render(entry({ properties: { x: inherited } }), [missing], runtime)),
    /required parameter `x`/,
  );
  const extra = createUnrecognizedKeysIssue(["extra"], []);
  assert.match(body(render(entry(), [extra], runtime)), /unexpected parameter `extra`/);
});

test("runtime union expands only when no JSON issue matches that union identity", () => {
  const leaf = { code: "custom", path: ["x"], message: "from runtime" };
  const union = {
    code: "invalid_union",
    path: ["x"],
    unionErrors: [{ issues: [leaf] }, null, { issues: [false] }],
  };
  const jsonUnion = createInvalidUnionIssue([[createCustomIssue("from JSON", [])]], ["x"]);
  assert.deepEqual(json([jsonUnion], [union]), [jsonUnion]);
  assert.deepEqual(json([], [union]), [createCustomIssue("from runtime", ["x"])]);
  assert.deepEqual(
    json(
      [createCustomIssue("fallback", [])],
      [{ code: "invalid_union", unionErrors: [{ issues: [false] }] }],
    ),
    [createCustomIssue("fallback", [])],
  );
});

test("runtime-only URL, regexp, sizes and custom issues preserve canonical wire objects", () => {
  const runtime = [
    { code: "invalid_string", path: ["rows", 0, "url"], validation: "url", message: "Invalid url" },
    { code: "invalid_string", path: ["rows", 0, "name"], validation: "regex", message: "Invalid" },
    {
      code: "too_small",
      path: ["amount"],
      type: "number",
      minimum: 0,
      inclusive: false,
      exact: true,
    },
    { code: "custom", path: [], message: null },
  ];
  const projected = json([], runtime, {
    properties: { rows: { items: { properties: { name: { pattern: "^x$" } } } } },
  });
  assert.deepEqual(projected[0], {
    code: "invalid_format",
    format: "url",
    path: ["rows", 0, "url"],
    message: "Invalid URL",
  });
  assert.deepEqual(projected[1], {
    origin: "string",
    code: "invalid_format",
    format: "regex",
    pattern: "/^x$/",
    path: ["rows", 0, "name"],
    message: "Invalid string: must match pattern /^x$/",
  });
  assert.deepEqual(
    projected[2],
    createTooSmallIssue("number", 0, ["amount"], { inclusive: false, exact: true }),
  );
  assert.equal(projected[3].message, "Invalid input");
});

test("path matching distinguishes numeric segments, infinities and unmatchable NaN", () => {
  const issues = [
    createCustomIssue("json numeric", [1]),
    createCustomIssue("json string", ["1"]),
    createCustomIssue("json nan", [NaN]),
  ];
  const runtime = [
    { code: "custom", path: ["1"], message: "unused" },
    { code: "custom", path: [1], message: "unused" },
    { code: "custom", path: [NaN], message: "runtime nan" },
  ];
  assert.deepEqual(
    json(issues, runtime).map((item: Issue) => item.message),
    ["json string", "json numeric", "runtime nan"],
  );
});

test("array limits follow later descendants without regrouping unrelated issues", () => {
  const runtime = [
    { code: "too_small", type: "array", minimum: 2, path: ["a"] },
    { code: "custom", message: "between", path: ["b"] },
    { code: "too_small", type: "array", minimum: 3, path: ["a", 0] },
    { code: "custom", message: "leaf", path: ["a", 0, "x"] },
  ];
  assert.deepEqual(
    json([], runtime).map((item: Issue) => item.path),
    [["b"], ["a", 0, "x"], ["a", 0], ["a"]],
  );
});

test("deep runtime union expansion avoids recursion and keeps its leaf", () => {
  let issue: RuntimeIssue = { code: "custom", path: ["x"], message: "leaf" };
  for (let index = 0; index < 12000; index++)
    issue = { code: "invalid_union", path: [], unionErrors: [{ issues: [issue] }] };
  assert.deepEqual(json([], [issue]), [createCustomIssue("leaf", ["x"])]);
});

test("deep standard union failures reach the actual first-executor model content intact", () => {
  let schema: JsonSchema = { type: "string" };
  for (let index = 0; index < 1000; index++) schema = { oneOf: [schema] };
  const error = validateInitialModelToolInput(7, entry(schema));
  assert.ok(error);
  const text = getInitialInputValidationModelContent(error);
  assert.ok(text);
  let issue = JSON.parse(body(text))[0];
  for (let index = 0; index < 1000; index++) {
    assert.equal(issue.code, "invalid_union");
    issue = issue.errors[0][0];
  }
  assert.equal(issue.code, "invalid_type");
  assert.equal(issue.message, "Invalid input: expected string, received number");
});

test("active runtime cycles fail explicitly while sibling aliases are legal", () => {
  const issue: Record<string, unknown> = { code: "invalid_union", path: [] };
  issue.unionErrors = [{ issues: [issue] }];
  assert.throws(() => render(entry(), [], [issue]), TypeError);
  const shared = { code: "custom", path: [], message: "shared" };
  const sibling = { code: "invalid_union", unionErrors: [{ issues: [shared, shared] }] };
  assert.deepEqual(json([], [sibling]), [createCustomIssue("shared", [])]);
});

test("cyclic output issue trees remain errors, never empty success", () => {
  const issue = createInvalidUnionIssue([], []);
  issue.errors.push([issue]);
  assert.throws(() => render(entry(), [issue], undefined), TypeError);
});

test("an earlier alias wins over a later exact code and claiming precedes deduplication", () => {
  const first = createInvalidValueIssue(["a"], ["x"]);
  const second = createInvalidValueIssue(["b"], ["x"]);
  assert.deepEqual(
    json(
      [first, second],
      [
        { code: "invalid_type", received: "undefined", path: ["x"] },
        { code: "invalid_enum_value", path: ["x"] },
      ],
    ),
    [first, second],
  );
  const bound = createTooSmallIssue("number", 1, ["x"]);
  assert.deepEqual(
    json(
      [bound, bound],
      [
        { code: "too_small", type: "number", minimum: 1, path: ["x"] },
        { code: "too_small", type: "number", minimum: 2, path: ["x"] },
      ],
    ),
    [bound],
  );
});

test("matching JSON unions suppress runtime traversal, including unreachable cycles", () => {
  const runtime: Record<string, unknown> = { code: "invalid_union", path: [] };
  runtime.unionErrors = [{ issues: [runtime] }];
  const union = createInvalidUnionIssue([[createCustomIssue("visible", [])]], []);
  assert.deepEqual(json([union], [runtime]), [union]);
  const leaf = { code: "too_small", path: ["x"] };
  const shared = { code: "invalid_union", unionErrors: [{ issues: [leaf] }, { issues: [leaf] }] };
  const bounds = [createTooSmallIssue("number", 1, ["x"]), createTooSmallIssue("number", 2, ["x"])];
  assert.deepEqual(json(bounds, [shared]), bounds);
});

test("union JSON preserves insertion order, shared leaves, empty branches and native payloads", () => {
  const leaf = createInvalidValueIssue([new Number(2), 9n, undefined, new Date(0)], []);
  const union: Issue = {
    path: ["x"],
    message: "Invalid input",
    code: "invalid_union",
    errors: [[leaf, leaf], []],
  };
  Object.assign(union, {
    omitted: undefined,
    detail: { text: 'quote"\nline', missing: undefined },
  });
  const issues = [union, union];
  assert.equal(
    body(render(entry(), issues, undefined)),
    JSON.stringify(
      issues,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
});

test("infinite path segments remain distinct and signed zero matches zero", () => {
  const issues = [
    createCustomIssue("positive", [Infinity]),
    createCustomIssue("negative", [-Infinity]),
    createCustomIssue("zero", [-0]),
  ];
  assert.deepEqual(
    json(issues, [
      { code: "custom", path: [-Infinity], message: "unused" },
      { code: "custom", path: [Infinity], message: "unused" },
      { code: "custom", path: [0], message: "unused" },
      { code: "custom", path: ["Infinity"], message: "string" },
    ]).map((issue: Issue) => issue.message),
    ["negative", "positive", "zero", "string"],
  );
});

test("sparse unexpected-key lists skip empty slots in the parameter summary", () => {
  const issue = createUnrecognizedKeysIssue([], []);
  issue.keys.length = 2;
  issue.keys[1] = "x";
  assert.equal(
    body(render(entry(), [issue], undefined)),
    "fixture failed due to the following issue:\nAn unexpected parameter `x` was provided",
  );
});

test("matching reads sparse path slots as undefined without changing either input", () => {
  const issue = createCustomIssue("JSON", []);
  issue.path.length = 1;
  const path: string[] = [];
  path.length = 1;
  assert.equal(json([issue], [{ code: "custom", path, message: "runtime" }])[0].message, "JSON");
  assert.equal(Object.hasOwn(issue.path, 0), false);
  assert.equal(Object.hasOwn(path, 0), false);
});

test("native JSON hooks receive their parent keys and run once at each visit", () => {
  const keys: string[] = [];
  const leaf = Object.assign(createCustomIssue("leaf", []), {
    toJSON(key: string) {
      keys.push(key);
      return { key, toJSON: () => "must not be called twice" };
    },
  });
  const branch = Object.assign([leaf], {
    toJSON(key: string) {
      keys.push(key);
      return [leaf];
    },
  });
  const union = Object.assign(createInvalidUnionIssue([branch], []), {
    extra: {
      toJSON(key: string) {
        keys.push(key);
        return key;
      },
    },
  });
  const issues = [union, leaf];
  const expected = JSON.stringify(issues, null, 2);
  const expectedKeys = [...keys];
  keys.length = 0;
  assert.equal(body(render(entry(), issues, undefined)), expected);
  assert.deepEqual(keys, expectedKeys);
  Object.assign(union.errors, {
    toJSON(key: string) {
      return { key, replacement: true };
    },
  });
  assert.equal(body(render(entry(), [union], undefined)), JSON.stringify([union], null, 2));
});

test("union array elements are read when visited after earlier JSON hooks", () => {
  const fixture = () => {
    const branch: Issue[] = [];
    branch.push(
      Object.assign(createCustomIssue("first", []), {
        toJSON() {
          branch[1] = createCustomIssue("updated", []);
          return { first: true };
        },
      }),
      createCustomIssue("original", []),
    );
    return [createInvalidUnionIssue([branch], [])];
  };
  assert.equal(body(render(entry(), fixture(), undefined)), JSON.stringify(fixture(), null, 2));
  const keyed = () => {
    const union = createInvalidUnionIssue([], []) as Issue & Record<string, unknown>;
    union.before = {
      toJSON() {
        union.toJSON = () => "wrong-wrapper-hook";
        return "before";
      },
    };
    union.toJSON = null;
    return [union];
  };
  assert.equal(body(render(entry(), keyed(), undefined)), JSON.stringify(keyed(), null, 2));
});
