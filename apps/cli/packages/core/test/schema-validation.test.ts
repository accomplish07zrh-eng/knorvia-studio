// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { JsInputJsonSchema, type JsonSchema } from "@knorvia/contracts";
import { validateJsonSchemaValue as check } from "../src/tool/json-schema.js";
import {
  getInitialInputValidationModelContent,
  validateInitialModelToolInput,
  validateInput,
} from "../src/tool/executor/validation.js";
import type { ToolEntry } from "../src/tool/types.js";

test("empty schemas and unsupported keywords keep the existing bounded contract", () => {
  for (const schema of [undefined, {}, { anyOf: [{ type: "string" }] }, { pattern: "^x$" }])
    assert.deepEqual(check(4, schema), { valid: true, errors: [], issues: [] });
  assert.equal(check({ extra: 5 }, { additionalProperties: { type: "string" } }).valid, true);
  assert.equal(check([5], { items: [{ type: "string" }] }).valid, true);
});

test("oneOf takes priority, requires exactly one match and preserves branch-local paths", () => {
  assert.equal(
    check(5, { type: "object", oneOf: [{ type: "number" }, { type: "string" }] }).valid,
    true,
  );
  const ambiguous = check(5, { oneOf: [{ type: "number" }, {}] });
  assert.deepEqual(ambiguous.errors, ["$ must match exactly one oneOf schema, matched 2"]);
  assert.equal(ambiguous.issues[0].code, "invalid_union");
  assert.deepEqual(ambiguous.issues[0].code === "invalid_union" && ambiguous.issues[0].errors, [
    [],
    [],
  ]);
  assert.equal(check(5, { type: "number", oneOf: [{ type: "string" }, false] }).valid, true);
  const nested = check(
    { choice: false },
    { properties: { choice: { oneOf: [{ type: "string" }, { type: "integer" }] } } },
  );
  const issue = nested.issues[0];
  assert.equal(issue.code, "invalid_union");
  if (issue.code !== "invalid_union") throw new Error("Missing union issue");
  assert.deepEqual(issue.path, ["choice"]);
  assert.deepEqual(
    issue.errors.map((branch) => branch[0].path),
    [[], []],
  );
  assert.equal(check(null, { oneOf: [] }).valid, false);
});

test("enum/const identity and type-diagnostic suppression are preserved", () => {
  const object = { key: 1 };
  assert.equal(check(object, { const: object }).valid, true);
  assert.equal(check({ key: 1 }, { const: object }).valid, false);
  assert.equal(check(NaN, { enum: [NaN] }).valid, true);
  assert.equal(check(-0, { const: 0 }).valid, false);
  const result = check(4, { const: "expected", enum: ["a", "b"], type: "string" });
  assert.deepEqual(result.errors, [
    '$ must be "expected"',
    '$ must be one of "a", "b"',
    "$ must be string",
  ]);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["invalid_value", "invalid_value"],
  );
  assert.equal(check(4, { enum: [] }).valid, false);
});

test("finite number, integer, unknown types and union fields retain serialized shape", () => {
  for (const value of [NaN, Infinity, -Infinity])
    assert.equal(check(value, { type: "number" }).valid, false);
  assert.equal(
    check(1.5, { type: "integer" }).issues[0].message,
    "Invalid input: expected int, received number",
  );
  assert.equal(check(new Date(0), { type: "object" }).valid, true);
  assert.equal(check(false, { type: "unrecognized" }).valid, true);
  const issue = check(false, { type: ["string", "null"] }).issues[0];
  assert.equal(
    JSON.stringify(issue),
    '{"code":"invalid_union","errors":[[{"expected":"string","code":"invalid_type","path":[],"message":"Invalid input: expected string, received boolean"}],[{"expected":"null","code":"invalid_type","path":[],"message":"Invalid input: expected null, received boolean"}]],"path":[],"message":"Invalid input"}',
  );
});

test("required errors and provider issues follow their distinct established orders", () => {
  const schema = {
    type: "object",
    required: ["must", "present", "unknown"],
    properties: {
      present: { type: "string", minLength: 3 },
      must: { type: "integer" },
      group: { type: "array", items: { type: "string" }, minItems: 2 },
    },
    additionalProperties: false,
  };
  const result = check({ present: "a", group: [3], extra: true }, schema);
  assert.deepEqual(result.errors, [
    "$.must is required",
    "$.unknown is required",
    "$.present must be at least 3 characters",
    "$.group must contain at least 2 items",
    "$.group[0] must be string",
    "$.extra is not allowed",
  ]);
  assert.deepEqual(
    result.issues.map(({ code, path }) => ({ code, path })),
    [
      { code: "too_small", path: ["present"] },
      { code: "invalid_type", path: ["must"] },
      { code: "invalid_type", path: ["group", 0] },
      { code: "too_small", path: ["group"] },
      { code: "invalid_type", path: ["unknown"] },
      { code: "unrecognized_keys", path: [] },
    ],
  );
});

test("missing fields use their own schema issues before the inferred fallback", () => {
  const result = check(
    {},
    {
      required: ["tag", "choice", "anything"],
      properties: {
        tag: { type: "string", enum: ["a", "b"] },
        choice: { oneOf: [{ type: "integer" }, { type: "null" }] },
        anything: {},
      },
    },
  );
  assert.deepEqual(
    result.issues.map(({ code, path }) => ({ code, path })),
    [
      { code: "invalid_value", path: ["tag"] },
      { code: "invalid_union", path: ["choice"] },
      { code: "invalid_type", path: ["anything"] },
    ],
  );
  assert.equal(result.issues[2].message, "Invalid input: expected unknown, received undefined");
});

test("own extra keys, inherited present properties and sparse array elements keep their boundary", () => {
  const value = Object.assign(Object.create({ inherited: "text" }), { own: 1 });
  assert.equal(
    check(value, { required: ["inherited"], properties: { inherited: { type: "string" } } }).valid,
    true,
  );
  assert.deepEqual(check(value, { additionalProperties: false }).errors, ["$.own is not allowed"]);
  const sparse = Array<unknown>(3);
  sparse[2] = "wrong";
  const result = check(sparse, { items: { type: "number" }, minItems: 4 });
  assert.deepEqual(
    result.issues.map(({ code, path }) => ({ code, path })),
    [
      { code: "invalid_type", path: [2] },
      { code: "too_small", path: [] },
    ],
  );
});

test("frozen inputs and shared schemas are validated per location without mutation", () => {
  const item = Object.freeze({ type: "string", minLength: 2 });
  const schema = Object.freeze({ properties: Object.freeze({ left: item, right: item }) });
  const value = Object.freeze({ left: "a", right: "b" });
  assert.deepEqual(
    check(value, schema).issues.map((issue) => issue.path),
    [["left"], ["right"]],
  );
  assert.equal(schema.properties.left, schema.properties.right);
});

test("string lengths remain UTF-16 counts and inclusive bounds retain their diagnostics", () => {
  assert.equal(check("😀", { minLength: 2, maxLength: 2 }).valid, true);
  assert.equal(check(3, { minimum: 3, maximum: 3 }).valid, true);
  assert.deepEqual(check(3, { minimum: 4, maximum: 2 }).errors, [
    "$ must be >= 4",
    "$ must be <= 2",
  ]);
  assert.deepEqual(
    check("a", { minLength: 2, maxLength: 0 }).issues.map((issue) => issue.code),
    ["too_small", "too_big"],
  );
});

test("exclusive numeric bounds reject equal values with non-inclusive issue metadata", () => {
  const lower = check(0, { type: "number", exclusiveMinimum: 0 });
  assert.equal(lower.valid, false);
  assert.deepEqual(lower.errors, ["$ must be > 0"]);
  assert.equal(
    JSON.stringify(lower.issues[0]),
    '{"origin":"number","code":"too_small","minimum":0,"inclusive":false,"path":[],"message":"Too small: expected number to be >0"}',
  );
  const upper = check(10, { type: "number", exclusiveMaximum: 10 });
  assert.equal(upper.valid, false);
  assert.deepEqual(upper.errors, ["$ must be < 10"]);
  assert.equal(upper.issues[0].code === "too_big" && upper.issues[0].inclusive, false);
  assert.equal(check(5, { exclusiveMinimum: 0, exclusiveMaximum: 10 }).valid, true);
  assert.equal(check(0, { minimum: 0, exclusiveMinimum: true }).valid, true);
});

test("real REPL schema rejects zero/negative budgets at the executor input boundary", () => {
  const entry = { metadata: { name: "js" }, inputSchema: JsInputJsonSchema } as ToolEntry;
  for (const timeout_ms of [0, -1])
    assert.ok(validateInput({ code: "", title: "检查", timeout_ms }, entry));
  for (const timeout_ms of [1, 120000])
    assert.equal(validateInput({ code: "", title: "检查", timeout_ms }, entry), undefined);
  assert.equal(validateInput({ code: "", title: "检查" }, entry), undefined);
});

function nested(depth: number, leaf: unknown) {
  let schema: JsonSchema = { type: "string" };
  let value = leaf;
  for (let index = 0; index < depth; index++) {
    schema = { type: "object", properties: { next: schema } };
    value = { next: value };
  }
  return { schema, value };
}

test("deep valid values do not consume the JavaScript call stack", () => {
  const { schema, value } = nested(12000, "valid");
  assert.equal(check(value, schema).valid, true);
});

test("deep failures preserve the complete issue path", () => {
  const { schema, value } = nested(12000, 4);
  const result = check(value, schema);
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].path.length, 12000);
  assert.equal(
    result.issues[0].path.every((part) => part === "next"),
    true,
  );
});

test("cyclic schema/value ancestors fail with a diagnostic without poisoning other calls", () => {
  const schema: JsonSchema = {};
  schema.oneOf = [schema];
  const result = check(1, schema);
  assert.equal(result.valid, false);
  assert.match(JSON.stringify(result.issues), /Cyclic schema\/value pair/);
  const array: unknown[] = [];
  array.push(array);
  const arraySchema: JsonSchema = { type: "array" };
  arraySchema.items = arraySchema;
  const loop = check(array, arraySchema);
  assert.equal(loop.issues[0].code, "custom");
  assert.deepEqual(loop.issues[0].path, [0]);
  assert.equal(check([1], { items: { type: "number" } }).valid, true);
});

test("a successful union sibling cannot mask a structurally cyclic branch", () => {
  const schema: JsonSchema = {};
  schema.oneOf = [schema, { type: "number" }];
  const result = check(1, schema);
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "custom");
});

test("recursive schemas with finite values and repeated sibling pairs remain valid", () => {
  const schema: JsonSchema = {};
  schema.oneOf = [
    { type: "null" },
    { type: "object", properties: { next: schema }, required: ["next"] },
  ];
  const value = { next: { next: null } };
  assert.equal(check(value, schema).valid, true);
  assert.equal(
    check({ left: value, right: value }, { properties: { left: schema, right: schema } }).valid,
    true,
  );
});

test("first executor validation projects exclusive budget failures into actual model content", () => {
  const entry = { metadata: { name: "js" }, inputSchema: JsInputJsonSchema } as ToolEntry;
  const error = validateInitialModelToolInput({ code: "", title: "检查", timeout_ms: 0 }, entry);
  assert.ok(error);
  const content = getInitialInputValidationModelContent(error);
  assert.ok(content);
  const json = content
    .replace(/^<tool_use_error>InputValidationError: /, "")
    .replace(/<\/tool_use_error>$/, "");
  const issues = JSON.parse(json);
  assert.deepEqual(
    issues.map(({ origin, code, minimum, inclusive, path }: Record<string, unknown>) => ({
      origin,
      code,
      minimum,
      inclusive,
      path,
    })),
    [{ origin: "number", code: "too_small", minimum: 0, inclusive: false, path: ["timeout_ms"] }],
  );
});

test("deep ordinary field failures still reach the existing model formatter", () => {
  const { value, schema } = nested(12000, 4);
  const entry = { metadata: { name: "fixture" }, inputSchema: schema } as ToolEntry;
  const error = validateInitialModelToolInput(value, entry);
  assert.ok(error);
  const content = getInitialInputValidationModelContent(error);
  assert.ok(content);
  assert.equal(content.split("next").length - 1, 12000);
  assert.match(content, /expected as `string` but provided as `number`/);
});
