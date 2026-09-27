// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as make from "../src/tool/tool-input-validation-issues.js";

test("type diagnostics keep three exact wire layouts", () => {
  assert.equal(
    JSON.stringify(make.createInvalidTypeIssue(false, "string", ["x"])),
    '{"expected":"string","code":"invalid_type","path":["x"],"message":"Invalid input: expected string, received boolean"}',
  );
  assert.equal(
    JSON.stringify(make.createInvalidTypeIssue(1.5, "integer", [])),
    '{"expected":"int","format":"safeint","code":"invalid_type","path":[],"message":"Invalid input: expected int, received number"}',
  );
  assert.equal(
    JSON.stringify(make.createInvalidTypeIssue(NaN, "integer", [])),
    '{"expected":"number","code":"invalid_type","received":"NaN","path":[],"message":"Invalid input: expected number, received NaN"}',
  );
});

test("integer diagnostics classify finite numbers without doing another validation", () => {
  for (const value of [0, -0, 0.5, 2 ** 54]) {
    const issue = make.createInvalidTypeIssue(value, "integer", []);
    assert.equal(issue.expected, "int");
    assert.equal(issue.format, "safeint");
    assert.equal(Object.hasOwn(issue, "received"), false);
  }
  for (const value of [Infinity, -Infinity]) {
    assert.deepEqual(make.createInvalidTypeIssue(value, "integer", []), {
      expected: "number",
      code: "invalid_type",
      received: "Infinity",
      path: [],
      message: "Invalid input: expected number, received number",
    });
  }
  assert.equal(make.createInvalidTypeIssue("1", "integer", []).expected, "number");
});

test("received labels distinguish primitives, arrays, class instances and cross-realm objects", () => {
  class Example {}
  const cases: Array<[unknown, string]> = [
    [null, "null"],
    [[], "array"],
    [{}, "object"],
    [Object.create(null), "object"],
    [new Example(), "Example"],
    [runInNewContext("({})"), "Object"],
    [undefined, "undefined"],
    [Symbol("x"), "symbol"],
    [1n, "bigint"],
    [() => 1, "function"],
  ];
  for (const [value, label] of cases)
    assert.equal(
      make.createInvalidTypeIssue(value, "string", []).message,
      `Invalid input: expected string, received ${label}`,
    );
});

test("choice messages preserve unescaped strings and bigint notation", () => {
  assert.deepEqual(make.createInvalidValueIssue([], []), {
    code: "invalid_value",
    values: [],
    path: [],
    message: "Invalid option: expected one of ",
  });
  assert.equal(
    make.createInvalidValueIssue(['quote"\nline'], []).message,
    'Invalid input: expected "quote"\nline"',
  );
  assert.equal(
    make.createInvalidValueIssue([9n, undefined, NaN, null], []).message,
    "Invalid option: expected one of 9n|undefined|NaN|null",
  );
  assert.equal(
    make.createInvalidValueIssue([Symbol("x")], []).message,
    "Invalid input: expected Symbol(x)",
  );
});

test("sparse lists keep source message slots but produce dense outer copies", () => {
  const values: string[] = [];
  values.length = 2;
  values[1] = "x";
  const issue = make.createInvalidValueIssue(values, []);
  assert.equal(issue.message, 'Invalid option: expected one of |"x"');
  assert.deepEqual(issue.values, [undefined, "x"]);
  assert.equal(Object.hasOwn(issue.values, 0), true);
  const keys = make.createUnrecognizedKeysIssue(values, []);
  assert.equal(keys.message, 'Unrecognized keys: , "x"');
  assert.deepEqual(keys.keys, [undefined, "x"]);
  assert.equal(make.createUnrecognizedKeysIssue([], []).message, "Unrecognized key: ");
});

test("all factories copy paths and preserve the documented shallow references", () => {
  const path: make.ToolInputValidationPath = ["x"];
  const object = { shared: true };
  const values = [object];
  const value = make.createInvalidValueIssue(values, path);
  assert.notEqual(value.values, values);
  assert.equal(value.values[0], object);
  const keys = ["x"];
  assert.notEqual(make.createUnrecognizedKeysIssue(keys, path).keys, keys);
  const errors = [[make.createCustomIssue("nested", [])]];
  const union = make.createInvalidUnionIssue(errors, path);
  assert.equal(union.errors, errors);
  const issues = [
    value,
    union,
    make.createCustomIssue("custom", path),
    make.createInvalidTypeIssue(1, "string", path),
    make.createInvalidFormatIssue("url", "bad", path),
    make.createUnrecognizedKeysIssue(keys, path),
    make.createTooSmallIssue("number", 1, path),
    make.createTooBigIssue("number", 2, path),
  ];
  for (const issue of issues) {
    assert.notEqual(issue.path, path);
    issue.path.push(0);
    assert.deepEqual(path, ["x"]);
    assert.equal(Object.isFrozen(issue), false);
  }
});

test("wire field order is fixed for every non-type issue family", () => {
  const cases: Array<[make.ToolInputValidationIssue, string[]]> = [
    [make.createCustomIssue("x", []), ["code", "path", "message"]],
    [make.createInvalidValueIssue([1], []), ["code", "values", "path", "message"]],
    [make.createUnrecognizedKeysIssue(["x"], []), ["code", "keys", "path", "message"]],
    [make.createInvalidUnionIssue([], []), ["code", "errors", "path", "message"]],
    [
      make.createTooSmallIssue("array", 1, [], { exact: true }),
      ["origin", "code", "minimum", "inclusive", "exact", "path", "message"],
    ],
    [
      make.createTooBigIssue("string", 2, []),
      ["origin", "code", "maximum", "inclusive", "path", "message"],
    ],
    [
      make.createInvalidFormatIssue("regex", "x", [], { origin: "string", pattern: "" }),
      ["origin", "code", "format", "pattern", "path", "message"],
    ],
  ];
  for (const [issue, keys] of cases) assert.deepEqual(Object.keys(issue), keys);
  assert.equal(
    JSON.stringify(make.createInvalidUnionIssue([], [])),
    '{"code":"invalid_union","errors":[],"path":[],"message":"Invalid input"}',
  );
});

test("range descriptions preserve open bounds and exact does not replace the comparison", () => {
  const cases: Array<[make.ToolInputTooSmallIssue["origin"], string, string]> = [
    [
      "string",
      "Too small: expected string to have >2 characters",
      "Too big: expected string to have <=2 characters",
    ],
    [
      "array",
      "Too small: expected array to have >2 items",
      "Too big: expected array to have <=2 items",
    ],
    ["number", "Too small: expected number to be >2", "Too big: expected number to be <=2"],
  ];
  for (const [origin, low, high] of cases) {
    const minimum = make.createTooSmallIssue(origin, 2, [], { inclusive: false, exact: true });
    assert.equal(minimum.message, low);
    assert.equal(minimum.exact, true);
    assert.equal(make.createTooBigIssue(origin, 2, []).message, high);
  }
  assert.equal(
    make.createTooBigIssue("number", NaN, [], { inclusive: false }).message,
    "Too big: expected number to be <NaN",
  );
  assert.equal(
    make.createTooSmallIssue("number", -0, []).message,
    "Too small: expected number to be >=0",
  );
});

test("optional wire fields are omitted while empty format patterns are retained", () => {
  const plain = make.createInvalidFormatIssue("regex", "bad", [], {
    origin: undefined,
    pattern: undefined,
  });
  assert.deepEqual(Object.keys(plain), ["code", "format", "path", "message"]);
  assert.equal(make.createInvalidFormatIssue("regex", "bad", [], { pattern: "" }).pattern, "");
  assert.equal(
    Object.hasOwn(make.createTooBigIssue("array", 1, [], { exact: false }), "exact"),
    false,
  );
  const options = { inclusive: null } as unknown as { inclusive?: boolean };
  assert.equal(make.createTooSmallIssue("number", 1, [], options).inclusive, true);
});

test("copy and message evaluation order remain observable without deep cloning", () => {
  const events: string[] = [];
  const item = {
    toString() {
      events.push("message");
      return "item";
    },
  };
  const values = [item];
  values[Symbol.iterator] = function* () {
    events.push("values");
    yield item;
    return undefined;
  };
  const path = ["x"];
  path[Symbol.iterator] = function* () {
    events.push("path");
    yield "x";
    return undefined;
  };
  const issue = make.createInvalidValueIssue(values, path);
  assert.deepEqual(events, ["values", "path", "message"]);
  assert.equal(issue.values[0], item);
});

test("unrepresentable values keep conversion errors rather than placeholder diagnostics", () => {
  assert.throws(() => make.createInvalidValueIssue([Object.create(null)], []), TypeError);
  assert.throws(() => make.createInvalidTypeIssue(1, Object.create(null), []), TypeError);
});

test("format option accessors preserve check/read order and decided field presence", () => {
  let reads = 0;
  const changing = make.createInvalidFormatIssue("regex", "bad", [], {
    get pattern() {
      return `^${++reads}$`;
    },
  });
  assert.equal(changing.pattern, "^2$");
  assert.equal(reads, 2);
  const events: string[] = [];
  let originReads = 0;
  let patternReads = 0;
  const disappearing = make.createInvalidFormatIssue("regex", "bad", [], {
    get origin(): "string" | undefined {
      events.push("origin");
      return ++originReads === 1 ? "string" : undefined;
    },
    get pattern() {
      events.push("pattern");
      return ++patternReads === 1 ? "^x$" : undefined;
    },
  });
  assert.deepEqual(events, ["origin", "origin", "pattern", "pattern"]);
  assert.deepEqual(Object.keys(disappearing), [
    "origin",
    "code",
    "format",
    "pattern",
    "path",
    "message",
  ]);
  assert.equal(disappearing.origin, undefined);
  assert.equal(disappearing.pattern, undefined);
});
