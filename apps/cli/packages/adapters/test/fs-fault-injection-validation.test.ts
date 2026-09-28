// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  check,
  environment,
  errorOf,
  fresh,
  messageOf,
  rule,
} from "./fs-fault-injection.fixture.js";

test("JSON syntax uses the native parser text without a cause", async (t) => {
  environment(t, "[}", "test");
  const native = errorOf(() => JSON.parse("[}"));
  const port = await fresh();
  const error = errorOf(() => check(port));
  assert.equal(error.constructor, Error);
  assert.equal(error.message, `Invalid KNORVIA_E2E_FS_FAULTS: ${native.message}`);
  assert.equal(Object.hasOwn(error, "cause"), false);
});

for (const value of [null, {}, 3, "array", true]) {
  test(`non-array JSON is rejected: ${JSON.stringify(value)}`, async (t) => {
    environment(t, JSON.stringify(value), "test");
    const port = await fresh();
    assert.equal(
      messageOf(() => check(port)),
      "Invalid KNORVIA_E2E_FS_FAULTS: expected a JSON array",
    );
  });
}

test("all rule shapes are checked before any rule fields", async (t) => {
  environment(t, JSON.stringify([{}, null]), "test");
  const port = await fresh();
  assert.equal(
    messageOf(() => check(port)),
    "Invalid fs fault rule at index 1: rule must be an object",
  );
});

for (const value of [null, [], "rule", false, 5]) {
  test(`non-object rule is rejected: ${JSON.stringify(value)}`, async (t) => {
    environment(t, JSON.stringify([value]), "test");
    const port = await fresh();
    assert.equal(
      messageOf(() => check(port)),
      "Invalid fs fault rule at index 0: rule must be an object",
    );
  });
}

const invalidFields: [Record<string, unknown>, string][] = [
  [{ maxMatches: -1 }, "maxMatches must be a non-negative integer"],
  [{ maxMatches: 1.5 }, "maxMatches must be a non-negative integer"],
  [{ maxMatches: "2" }, "maxMatches must be a non-negative integer"],
  [{ maxMatches: null }, "maxMatches must be a non-negative integer"],
  [{ pathRegex: null }, "pathRegex must be a string"],
  [{ code: " \t " }, "code must be a non-empty string"],
  [{ code: false }, "code must be a non-empty string"],
  [{ id: " " }, "id must be a non-empty string"],
  [{ id: null }, "id must be a non-empty string"],
  [{ message: null }, "message must be a string"],
  [{ operations: [] }, "operations must be a non-empty array"],
  [{ operations: "writeFile" }, "operations must be a non-empty array"],
  [{ operations: ["WRITEFILE"] }, "unsupported operation WRITEFILE"],
  [{ operations: [" writeFile "] }, "unsupported operation  writeFile "],
  [{ operations: [null] }, "unsupported operation null"],
  [{ operations: [{}] }, "unsupported operation [object Object]"],
  [{ pathEndsWith: 1 }, "pathEndsWith must be a string"],
  [{ pathIncludes: false }, "pathIncludes must be a string"],
];
for (const [fields, suffix] of invalidFields) {
  test(`eager rule validation: ${JSON.stringify(fields)}`, async (t) => {
    environment(t, JSON.stringify([rule(), rule(fields)]), "test");
    const port = await fresh();
    const error = errorOf(() => check(port));
    assert.equal(error.message, `Invalid fs fault rule at index 1: ${suffix}`);
    assert.equal(error.constructor, Error);
    assert.equal(Object.hasOwn(error, "cause"), false);
  });
}

test("validation precedence retains field ordering before native regex construction", async (t) => {
  environment(t, "[]", "test");
  const invalid: Record<string, unknown> = {
    maxMatches: -1,
    pathRegex: null,
    code: "",
    id: "",
    message: null,
    operations: [],
    pathEndsWith: null,
    pathIncludes: null,
  };
  const steps: [string, unknown, string][] = [
    ["maxMatches", 1, "maxMatches must be a non-negative integer"],
    ["pathRegex", "[", "pathRegex must be a string"],
    ["code", "EACCES", "code must be a non-empty string"],
    ["id", "rule", "id must be a non-empty string"],
    ["message", "", "message must be a string"],
    ["operations", ["any"], "operations must be a non-empty array"],
    ["pathEndsWith", "", "pathEndsWith must be a string"],
    ["pathIncludes", "", "pathIncludes must be a string"],
  ];
  const port = await fresh();
  for (const [field, replacement, expected] of steps) {
    process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([invalid]);
    assert.equal(
      messageOf(() => check(port)),
      `Invalid fs fault rule at index 0: ${expected}`,
    );
    invalid[field] = replacement;
  }
  process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([invalid]);
  const actual = errorOf(() => check(port));
  const native = errorOf(() => new RegExp(String(invalid.pathRegex)));
  assert.equal(actual.constructor, SyntaxError);
  assert.equal(actual.message, native.message);
});
