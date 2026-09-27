// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  JsInputSchema,
  JsRuntimeInputSchema,
  JsInputJsonSchema,
  JsOutputSchema,
  JsOutputJsonSchema,
  type JsInput,
  type JsRuntimeInput,
  type JsOutput,
} from "../src/tools/node-repl.js";

test("new JS requests require a title but historical requests may omit it", () => {
  const historical: JsRuntimeInput = { code: "" };
  assert.deepEqual(JsRuntimeInputSchema.parse(historical), historical);
  assert.equal(JsInputSchema.safeParse(historical).success, false);
  const current: JsInput = { code: "await Promise.resolve(1)", title: "读取结果" };
  assert.deepEqual(JsInputSchema.parse(current), current);
  assert.deepEqual(JsRuntimeInputSchema.parse(current), current);
  assert.equal(JsInputSchema.shape.title.isOptional(), false);
  assert.equal(JsRuntimeInputSchema.shape.title.isOptional(), true);
  assert.deepEqual(JsInputSchema.pick({ title: true }).parse({ title: "x" }), { title: "x" });
});

test("JS runtime input accepts exact timeout and title boundaries without coercion or trimming", () => {
  for (const timeout_ms of [1, 30_000, 120_000]) {
    for (const title of [" ", "x".repeat(120)]) {
      const value = { code: " ", timeout_ms, title };
      assert.deepEqual(JsRuntimeInputSchema.parse(value), value);
      assert.deepEqual(JsInputSchema.parse(value), value);
    }
  }
  for (const timeout_ms of [0, -1, 1.5, 120_001, NaN, Infinity, "1", null]) {
    assert.equal(JsRuntimeInputSchema.safeParse({ code: "", timeout_ms }).success, false);
  }
  for (const title of ["", "x".repeat(121), 1, null]) {
    assert.equal(JsRuntimeInputSchema.safeParse({ code: "", title }).success, false);
  }
});

test("both JS inputs reject missing code and unexpected properties", () => {
  for (const schema of [JsInputSchema, JsRuntimeInputSchema]) {
    for (const value of [
      {},
      { title: "x" },
      { code: 1, title: "x" },
      { code: "", title: "x", command: "other-tool" },
      { code: "", title: "x", extra: undefined },
    ])
      assert.equal(schema.safeParse(value).success, false);
  }
  const result = JsInputSchema.safeParse({ code: "", title: "x", timeout_ms: 1.5 });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(result.error.issues[0]!.path, ["timeout_ms"]);
});

test("JS output accepts optional result, image, screenshot and metadata fields without new authority checks", () => {
  const output: JsOutput = {
    logs: "",
    result: "",
    images: [{ base64: "protocol-value", mimeType: "image/png" }],
    browserScreenshotPaths: ["relative-fixture.png"],
    responseMeta: { a: null, b: [1, "x"] },
    error: { name: "Fixture", message: "a\nb", stack: "fixture stack" },
  };
  assert.deepEqual(JsOutputSchema.parse(output), output);
  assert.deepEqual(JsOutputSchema.parse({ logs: "" }), { logs: "" });
  assert.deepEqual(JsOutputSchema.parse({ logs: "", images: [], browserScreenshotPaths: [] }), {
    logs: "",
    images: [],
    browserScreenshotPaths: [],
  });
});

test("output strictness keeps the legacy exception for unknown nested error fields", () => {
  assert.deepEqual(
    JsOutputSchema.parse({ logs: "", error: { name: "E", message: "m", private: 3 } }),
    {
      logs: "",
      error: { name: "E", message: "m" },
    },
  );
  for (const invalid of [
    {},
    { logs: 1 },
    { logs: "", result: null },
    { logs: "", extra: 3 },
    { logs: "", images: [{ base64: "", mimeType: "", extra: 3 }] },
    { logs: "", images: [{ base64: "" }] },
    { logs: "", browserScreenshotPaths: [1] },
    { logs: "", responseMeta: [] },
    { logs: "", error: { name: "E" } },
  ])
    assert.equal(JsOutputSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
});

test("advertised JS schema retains strict parameter names and numeric/string bounds", () => {
  assert.deepEqual(JsInputJsonSchema.required, ["code", "title"]);
  assert.equal(JsInputJsonSchema.additionalProperties, false);
  const properties = JsInputJsonSchema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(properties), ["code", "timeout_ms", "title"]);
  assert.equal(properties.code!.type, "string");
  assert.equal(properties.timeout_ms!.type, "integer");
  assert.equal(properties.timeout_ms!.minimum, undefined);
  assert.equal(properties.timeout_ms!.exclusiveMinimum, 0);
  assert.equal(properties.timeout_ms!.maximum, 120_000);
  assert.equal(properties.title!.minLength, 1);
  assert.equal(properties.title!.maxLength, 120);
  assert.match(String(properties.timeout_ms!.description), /30000/u);
  assert.match(String(properties.timeout_ms!.description), /15000/u);
  assert.match(String(properties.timeout_ms!.description), /120000/u);
});

test("advertised output still requires logs and forbids unknown top-level/image fields", () => {
  assert.deepEqual(JsOutputJsonSchema.required, ["logs"]);
  assert.equal(JsOutputJsonSchema.additionalProperties, false);
  const fields = JsOutputJsonSchema.properties as Record<string, Record<string, unknown>>;
  const item = fields.images!.items as Record<string, unknown>;
  assert.deepEqual(item.required, ["base64", "mimeType"]);
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(fields.responseMeta, {
    type: "object",
    additionalProperties: {},
    propertyNames: { type: "string" },
  });
});
