// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { descriptor } from "./mcp-primitives.fixture.js";

const { normalizeMcpToolDescriptor: normalize } = descriptor;
const descriptorKeys = [
  "serverName",
  "toolName",
  "name",
  "description",
  "timeoutMs",
  "inputSchema",
  "outputSchema",
  "annotations",
];
const annotationKeys = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];

test("MCP descriptor exposes one four-argument projection", () => {
  assert.deepEqual(Object.keys(descriptor), ["normalizeMcpToolDescriptor"]);
  assert.equal(normalize.length, 4);
  assert.deepEqual(Object.keys(normalize("owned", {})), descriptorKeys);
});

for (const [label, tool] of [
  ["missing", undefined],
  ["null", null],
  ["number", 8],
  ["boolean", false],
  ["text", "tool"],
  ["array", []],
  ["function", () => ({ name: "ignored" })],
] as const) {
  test(`MCP descriptor treats ${label} tool input as absent`, () => {
    const result = normalize("owned", tool);
    assert.equal(result.toolName, "unknown");
    assert.equal(result.name, "mcp__owned__unknown");
    assert.equal(result.description, undefined);
    assert.equal(result.outputSchema, undefined);
    assert.equal(result.annotations, undefined);
    assert.deepEqual(Object.keys(result), descriptorKeys);
  });
}

for (const [server, name, qualified] of [
  ["", "", "mcp__unknown__unknown"],
  ["my.server", "a b", "mcp__my_server__a_b"],
  ["___", "a 😀 b", "mcp_____a_b"],
  ["Alpha-42", "call_9", "mcp__Alpha-42__call_9"],
  ["中文", "é", "mcp______"],
  ["__a__", "___b___", "mcp___a____b_"],
] as const) {
  test(`MCP descriptor separately qualifies ${JSON.stringify([server, name])}`, () => {
    const result = normalize(server, { name });
    assert.equal(result.serverName, server);
    assert.equal(result.toolName, name);
    assert.equal(result.name, qualified);
  });
}

test("MCP descriptor keeps raw optional scalars and ignores untrusted official flag", () => {
  const input = Object.freeze({ name: "", description: "", official: true });
  const result = normalize("owned", input, -1.25, false);
  assert.equal(result.toolName, "");
  assert.equal(result.description, "");
  assert.equal(result.timeoutMs, -1.25);
  assert.equal(Object.hasOwn(result, "official"), false);
  assert.equal(Number.isNaN(normalize("owned", {}, NaN).timeoutMs), true);
  const official = normalize("owned", { official: false }, 0, true);
  assert.equal(official.official, true);
  assert.deepEqual(Object.keys(official), [...descriptorKeys, "official"]);
  assert.equal(normalize("owned", { name: 1, description: false }).toolName, "unknown");
  assert.equal(normalize("owned", { description: {} }).description, undefined);
});

for (const [label, schema] of [
  ["missing", undefined],
  ["null", null],
  ["text", "object"],
  ["number", 1],
  ["array", []],
  ["function", () => {}],
] as const) {
  test(`MCP descriptor creates fresh fallback input schema for ${label}`, () => {
    const first = normalize("owned", { inputSchema: schema }).inputSchema;
    const second = normalize("owned", { inputSchema: schema }).inputSchema;
    assert.deepEqual(first, { type: "object", properties: {}, additionalProperties: true });
    assert.notEqual(first, second);
    assert.notEqual(first.properties, second.properties);
    assert.equal(Object.getPrototypeOf(first), Object.prototype);
  });
}

test("MCP schema projection is shallow, immutable and preserves existing key positions", () => {
  const properties = Object.freeze({ value: { type: "string" } });
  const extra = Object.freeze({ owned: true });
  const schema = Object.freeze({
    properties,
    z: extra,
    type: "array",
    additionalProperties: false,
  });
  const result = normalize("owned", Object.freeze({ inputSchema: schema })).inputSchema;
  assert.notEqual(result, schema);
  assert.equal(result.type, "object");
  assert.equal(result.properties, properties);
  assert.equal(result.z, extra);
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(Object.keys(result), ["properties", "z", "type", "additionalProperties"]);
  assert.equal(schema.type, "array");
});

test("MCP schema appends absent required keys without inventing extra policy", () => {
  const result = normalize("owned", { inputSchema: { z: 1 } }).inputSchema;
  assert.deepEqual(Object.keys(result), ["z", "type", "properties"]);
  assert.deepEqual(result, { z: 1, type: "object", properties: {} });
  assert.equal(Object.hasOwn(result, "additionalProperties"), false);
  for (const properties of [null, [], "owned", false, () => {}]) {
    const one = normalize("owned", { inputSchema: { properties } }).inputSchema;
    const two = normalize("owned", { inputSchema: { properties } }).inputSchema;
    assert.deepEqual(one.properties, {});
    assert.notEqual(one.properties, two.properties);
  }
});

test("MCP schema preserves own special and symbol data without changing prototype", () => {
  const symbol = Symbol("owned schema field");
  const special = JSON.parse('{"__proto__":{"owned":true},"constructor":"data"}') as Record<
    string | symbol,
    unknown
  >;
  const marker = Object.freeze({ value: true });
  special[symbol] = marker;
  Object.defineProperty(special, "hidden", { value: "omit", enumerable: false });
  const result = normalize("owned", { inputSchema: special }).inputSchema;
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, "__proto__"), true);
  assert.equal(result.__proto__, special.__proto__);
  assert.equal(result.constructor, "data");
  assert.equal(Reflect.get(result, symbol), marker);
  assert.equal(Object.hasOwn(result, "hidden"), false);
  assert.deepEqual(Object.keys(result), ["__proto__", "constructor", "type", "properties"]);
});

test("MCP schema selects inherited properties but only copies own enumerable fields", () => {
  const properties = new Date(0);
  const schema: Record<string, unknown> = Object.assign(
    Object.create({ properties, inherited: "omit" }),
    { z: 1 },
  );
  const result = normalize("owned", { inputSchema: schema }).inputSchema;
  assert.equal(result.properties, properties);
  assert.deepEqual(Object.keys(result), ["z", "type", "properties"]);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test("MCP descriptor accepts non-plain records and borrows output schema identity", () => {
  class OwnedTool {
    name = "owned";
    inputSchema = new Date(0);
  }
  const outputSchema: Record<string, unknown> = Object.assign(Object.create(null), {
    type: "number",
  });
  const input = Object.assign(new OwnedTool(), { outputSchema });
  const result = normalize("owned", input);
  assert.equal(result.toolName, "owned");
  assert.deepEqual(result.inputSchema, { type: "object", properties: {} });
  assert.equal(result.outputSchema, outputSchema);
  const date = new Date(0);
  assert.equal(normalize("owned", { outputSchema: date }).outputSchema, date);
  for (const invalid of [null, undefined, [], "text", 1, () => {}]) {
    assert.equal(normalize("owned", { outputSchema: invalid }).outputSchema, undefined);
  }
});

test("MCP annotations retain four boolean-or-undefined keys and ignore extensions", () => {
  const annotation = Object.freeze({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: "true",
    openWorldHint: 1,
    extension: true,
  });
  const result = normalize("owned", { annotations: annotation }).annotations;
  assert.deepEqual(result, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: undefined,
    openWorldHint: undefined,
  });
  assert.deepEqual(Object.keys(result ?? {}), annotationKeys);
  assert.deepEqual(
    Object.keys(normalize("owned", { annotations: {} }).annotations ?? {}),
    annotationKeys,
  );
  for (const invalid of [null, undefined, [], false, () => {}]) {
    assert.equal(normalize("owned", { annotations: invalid }).annotations, undefined);
  }
});

test("MCP selected tool and annotation properties use ordinary inherited reads", () => {
  const output = { type: "string" },
    properties = { value: {} };
  const tool: unknown = Object.create({
    name: "inherited",
    description: "kept",
    inputSchema: { properties },
    outputSchema: output,
    annotations: Object.create({ openWorldHint: false }),
  });
  const result = normalize("owned", tool);
  assert.equal(result.toolName, "inherited");
  assert.equal(result.description, "kept");
  assert.equal(result.inputSchema.properties, properties);
  assert.equal(result.outputSchema, output);
  assert.equal(result.annotations?.openWorldHint, false);
});
