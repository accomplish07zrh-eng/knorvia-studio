// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  normalizeToolJsonSchema,
  toToolJsonSchema,
  TOOL_JSON_SCHEMA_VERSION,
} from "../src/tools/json-schema.js";

type Schema = Record<string, unknown>;

test("normalization mutates the schema but preserves application field names and annotations", () => {
  const annotation = { $id: "application-id", anyOf: [{ minimum: 7 }] };
  const value: Schema = {
    $schema: "old",
    $id: "id",
    $ref: "ref",
    $defs: { ignored: annotation },
    definitions: {},
    properties: { $id: { minLength: 2 }, definitions: { const: false } },
    default: annotation,
    examples: [annotation],
    not: annotation,
    description: "retained",
  };
  assert.equal(normalizeToolJsonSchema(value), value);
  assert.deepEqual(value, {
    type: "object",
    properties: {
      $id: { type: "string", minLength: 2 },
      definitions: { type: "boolean", const: false },
    },
    default: annotation,
    examples: [annotation],
    not: annotation,
    description: "retained",
  });
  assert.deepEqual(annotation, { $id: "application-id", anyOf: [{ minimum: 7 }] });
});

test("only supported schema positions are walked, including tuples and combinations", () => {
  const value: Schema = {
    properties: { field: { items: [{ enum: [1, 2] }, { const: null }] } },
    additionalProperties: { allOf: [{ required: [] }, { minLength: 1 }] },
    oneOf: [{ items: { minimum: 0 } }],
    anyOf: [{ enum: [true, false] }],
  };
  normalizeToolJsonSchema(value);
  assert.deepEqual(value, {
    type: "object",
    properties: {
      field: {
        type: "array",
        items: [
          { type: "integer", enum: [1, 2] },
          { type: "null", const: null },
        ],
      },
    },
    additionalProperties: {
      allOf: [
        { type: "object", required: [], properties: {} },
        { type: "string", minLength: 1 },
      ],
    },
    oneOf: [{ type: "array", items: { type: "number", minimum: 0 } }],
    anyOf: [{ type: "boolean", enum: [true, false] }],
  });
});

test("anyOf migration preserves branch identity and an existing oneOf", () => {
  const choices = [{ const: "a" }, { const: 4 }];
  const value: Schema = { anyOf: choices, oneOf: undefined };
  normalizeToolJsonSchema(value);
  assert.equal(value.oneOf, choices);
  assert.equal(Object.hasOwn(value, "anyOf"), false);
  for (const existing of [null, false, [], {}]) {
    const both = { anyOf: [{ minLength: 1 }], oneOf: existing };
    normalizeToolJsonSchema(both);
    assert.equal(both.oneOf, existing);
    assert.deepEqual(both.anyOf, [{ type: "string", minLength: 1 }]);
  }
  const malformed = { anyOf: { minimum: 3 } };
  normalizeToolJsonSchema(malformed);
  assert.deepEqual(malformed, { anyOf: { type: "number", minimum: 3 } });
});

test("type inference preserves priority and homogeneous literal rules", () => {
  const cases: Array<[Schema, string | undefined]> = [
    [{ properties: {}, items: {}, const: "x" }, "object"],
    [{ required: [], minItems: 0 }, "object"],
    [{ items: false, minLength: 2 }, "array"],
    [{ minItems: 0 }, "array"],
    [{ maxItems: 2 }, "array"],
    [{ enum: ["", "x"] }, "string"],
    [{ enum: [false, true] }, "boolean"],
    [{ enum: [0, -3, 17] }, "integer"],
    [{ enum: [1, 2.5] }, "number"],
    [{ enum: [null, null] }, "null"],
    [{ const: 2.5 }, "number"],
    [{ const: 0 }, "integer"],
    [{ const: undefined }, undefined],
    [{ enum: [], minLength: 1 }, undefined],
    [{ enum: [1, "a"], minimum: 0 }, undefined],
    [{ enum: [null, false], const: 8 }, undefined],
    [{ const: {}, maxLength: 4 }, undefined],
    [{ minLength: 0, minimum: 0 }, "string"],
    [{ maxLength: 4 }, "string"],
    [{ minimum: 0 }, "number"],
    [{ maximum: 8 }, "number"],
    [{ minLength: "3", exclusiveMinimum: 0 }, undefined],
  ];
  for (const [schema, expected] of cases) {
    normalizeToolJsonSchema(schema);
    assert.equal(schema.type, expected, JSON.stringify(schema));
  }
});

test("explicit types and explicit empty values are not overwritten", () => {
  for (const declared of ["string", null, false, [], ["array", "object"]]) {
    const schema: Schema = { type: declared, properties: {}, items: null };
    normalizeToolJsonSchema(schema);
    assert.equal(schema.type, declared);
    assert.equal(schema.items, null);
  }
  const schemas: Schema[] = [
    { type: "object" },
    { type: "array" },
    { type: ["object", "array"] },
    { type: "object", additionalProperties: false },
    { type: "object", additionalProperties: { minimum: 0 } },
    { type: "object", properties: {}, additionalProperties: {} },
    { type: "object", additionalProperties: {}, propertyNames: null },
  ];
  schemas.forEach(normalizeToolJsonSchema);
  assert.deepEqual(schemas, [
    { type: "object", properties: {} },
    { type: "array", items: {} },
    { type: ["object", "array"], properties: {}, items: {} },
    { type: "object", additionalProperties: false },
    {
      type: "object",
      additionalProperties: { minimum: 0, type: "number" },
      propertyNames: { type: "string" },
    },
    { type: "object", properties: {}, additionalProperties: {} },
    { type: "object", additionalProperties: {}, propertyNames: null },
  ]);
  assert.deepEqual(Object.keys(schemas[2]!), ["type", "properties", "items"]);
});

test("repeated normalization is stable and shared schema nodes remain shared", () => {
  const branch: Schema = { anyOf: [{ const: "x" }], $id: "remove" };
  const value = { properties: { first: branch, second: branch }, items: branch };
  normalizeToolJsonSchema(value);
  const firstPass = JSON.stringify(value);
  normalizeToolJsonSchema(value);
  assert.equal(JSON.stringify(value), firstPass);
  assert.equal(value.properties.first, value.properties.second);
  assert.equal(value.items, branch);
});

test("shared nodes are visited in schema field order before a later alias removes metadata", () => {
  const field: Schema = { properties: { value: { type: "string" } } };
  const shared = { $defs: field };
  const root = { properties: { first: { properties: shared }, second: shared }, default: field };
  normalizeToolJsonSchema(root);
  assert.equal(root.default, field);
  assert.equal(field.type, "object");
  assert.equal(Object.hasOwn(shared, "$defs"), false);
  assert.deepEqual(root.properties.first.properties, shared);
});

test("sparse enum slots retain the legacy in-memory literal inference", () => {
  const emptySlots: unknown[] = [];
  emptySlots.length = 2;
  const withText: unknown[] = [];
  withText[1] = "text";
  const withNumber: unknown[] = [1];
  withNumber.length = 2;
  const cases: Array<[unknown[], string | undefined]> = [
    [emptySlots, "string"],
    [withText, "string"],
    [withNumber, "integer"],
    [[undefined, "text"], undefined],
    [[], undefined],
  ];
  for (const [values, expected] of cases) {
    const schema: Schema = { enum: values };
    normalizeToolJsonSchema(schema);
    assert.equal(schema.enum, values);
    assert.equal(schema.type, expected);
  }
});

test("normalization handles deep schema structure without using the JS call stack", () => {
  const root: Schema = {};
  let tail = root;
  const depth = 20_000;
  for (let i = 0; i < depth; i++) {
    const child: Schema = {};
    tail.items = child;
    tail = child;
  }
  tail.const = true;
  assert.doesNotThrow(() => normalizeToolJsonSchema(root));
  let cursor = root;
  for (let i = 0; i < depth; i++) {
    assert.equal(cursor.type, "array");
    cursor = cursor.items as Schema;
  }
  assert.equal(cursor.type, "boolean");
});

test("cyclic in-memory schemas finish without erasing their reference structure", () => {
  const root: Schema = { $id: "remove", type: "object" };
  const choices: unknown[] = [root];
  choices.push(choices);
  root.properties = { self: root };
  root.allOf = choices;
  assert.doesNotThrow(() => normalizeToolJsonSchema(root));
  assert.equal((root.properties as Schema).self, root);
  assert.equal(root.allOf, choices);
  assert.equal(choices[1], choices);
  assert.equal(Object.hasOwn(root, "$id"), false);
  assert.throws(() => JSON.stringify(root), TypeError);
});

test("Zod conversion describes input effects, strictness and finite unions", () => {
  const schema = z
    .object({
      value: z.string().transform((text) => text.length),
      choice: z.union([z.literal("ok"), z.literal(4)]),
      labels: z.record(z.string(), z.number()),
    })
    .strict();
  const generated = toToolJsonSchema(schema);
  assert.equal(generated.$schema, TOOL_JSON_SCHEMA_VERSION);
  assert.equal(generated.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(generated.additionalProperties, false);
  assert.deepEqual(generated.required, ["value", "choice", "labels"]);
  const properties = generated.properties as Record<string, Schema>;
  assert.equal(properties.value!.type, "string");
  assert.deepEqual(properties.choice, { type: ["string", "number"], enum: ["ok", 4] });
  assert.deepEqual(properties.labels, {
    type: "object",
    additionalProperties: { type: "number" },
    propertyNames: { type: "string" },
  });
  assert.deepEqual(schema.parse({ value: "abcd", choice: "ok", labels: { a: 2 } }), {
    value: 4,
    choice: "ok",
    labels: { a: 2 },
  });
});

test("Zod descriptions, defaults and tuple bounds survive the model projection", () => {
  const schema = z.object({
    pair: z.tuple([z.string(), z.boolean()]).describe("a pair"),
    count: z.number().int().default(3),
    flag: z.boolean().optional(),
  });
  const converted = toToolJsonSchema(schema);
  const fields = converted.properties as Record<string, Schema>;
  assert.deepEqual(fields.pair, {
    type: "array",
    minItems: 2,
    maxItems: 2,
    items: [{ type: "string" }, { type: "boolean" }],
    description: "a pair",
  });
  assert.deepEqual(fields.count, { type: "integer", default: 3 });
  assert.deepEqual(converted.required, ["pair"]);
  assert.equal(converted.additionalProperties, false);
});

test("object unions follow the full Zod conversion and oneOf projection path", () => {
  const declared = z.union([
    z.object({ kind: z.literal("text"), value: z.string() }).strict(),
    z.object({ kind: z.literal("count"), value: z.number().int() }).strict(),
  ]);
  const generated = toToolJsonSchema(declared);
  assert.equal(Object.hasOwn(generated, "anyOf"), false);
  assert.deepEqual(generated.oneOf, [
    {
      type: "object",
      properties: { kind: { type: "string", const: "text" }, value: { type: "string" } },
      required: ["kind", "value"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { kind: { type: "string", const: "count" }, value: { type: "integer" } },
      required: ["kind", "value"],
      additionalProperties: false,
    },
  ]);
});

test("conversion failures propagate without replacement or a fabricated empty schema", () => {
  const failure = new Error("fixture schema is unavailable");
  const declaration = z.lazy(() => {
    throw failure;
  });
  assert.throws(
    () => toToolJsonSchema(declaration),
    (error) => error === failure,
  );
});
