// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const target = process.env.KNORVIA_UI_B1_LIB_DIR
  ? pathToFileURL(resolve(process.env.KNORVIA_UI_B1_LIB_DIR, "uiError.ts")).href
  : new URL("../src/lib/uiError.js", import.meta.url).href;
const { normalizeKnorviaUiError: normalize } = await import(target);

function expected(message: string, extra: Record<string, unknown> = {}) {
  return {
    code: "UNKNOWN",
    message,
    detail: undefined,
    traceId: undefined,
    taskId: undefined,
    ...extra,
  };
}

const cases: Array<[string, unknown, Record<string, unknown>]> = [
  ["missing input is converted", undefined, expected("undefined")],
  ["null input is converted", null, expected("null")],
  ["number input is converted", 0, expected("0")],
  ["false input is converted", false, expected("false")],
  ["array has no structured fields", ["array text"], expected("array text")],
  ["empty record uses default", {}, expected("Internal error")],
  ["empty string uses default", "  ", expected("Internal error")],
  ["plain string trims only edges", "  a\n  b  ", expected("a\n  b")],
  ["malformed JSON remains text", " {invalid} ", expected("{invalid}")],
  ["JSON array remains text", '[{"message":"nested"}]', expected('[{"message":"nested"}]')],
  [
    "record JSON without string candidates remains text",
    '{"message":1}',
    expected('{"message":1}'),
  ],
  [
    "record JSON uses provider reason",
    '{"message":"Internal error","data":{"details":" actionable "}}',
    expected("actionable"),
  ],
  [
    "generic wrappers yield to actionable detail",
    { message: "Internal error", detail: " fix " },
    expected("fix"),
  ],
  [
    "generic wrappers keep their first message",
    { message: "Compact failed", detail: "Internal error" },
    expected("Compact failed"),
  ],
  [
    "message wins before detail",
    { message: "first", detail: "second", data: { message: "third" } },
    expected("first", { detail: "second" }),
  ],
  [
    "candidates deduplicate trimmed text",
    { message: "same", detail: " same ", data: { details: "other" } },
    expected("same", { detail: "other" }),
  ],
  [
    "nested data fields keep plural before reason",
    { data: { details: "plural", reason: "reason", error: { message: "error" } } },
    expected("plural", { detail: "reason" }),
  ],
  [
    "knorvia provider fields follow ordinary error fields",
    { data: { error: { details: "ordinary" }, knorvia: { error: { message: "provider" } } } },
    expected("ordinary", { detail: "provider" }),
  ],
  [
    "field numbers and booleans are ignored",
    { message: 0, detail: false, data: { reason: "usable" }, code: 429 },
    expected("usable"),
  ],
  [
    "root code precedes providerCode",
    { message: "failed", code: " ROOT ", providerCode: "PROVIDER" },
    expected("failed", { code: "ROOT" }),
  ],
  [
    "provider code in first detail overrides root",
    { message: "failed", code: "WRAPPER", detail: "provider_code=00123 next" },
    expected("failed", { code: "00123", detail: "provider_code=00123 next" }),
  ],
  [
    "later detail cannot override first detail",
    { message: "failed", code: "ROOT", detail: "first", data: { detail: "provider_code=429" } },
    expected("failed", { code: "ROOT", detail: "first" }),
  ],
  [
    "plural details do not supply provider code",
    { data: { details: "provider_code=429" }, code: "ROOT" },
    expected("provider_code=429", { code: "ROOT" }),
  ],
  [
    "provider code digits need no suffix boundary",
    { message: "failed", detail: "provider_code=123abc" },
    expected("failed", { code: "123", detail: "provider_code=123abc" }),
  ],
  [
    "negative provider code does not match",
    { message: "failed", detail: "provider_code=-123", code: "ROOT" },
    expected("failed", { code: "ROOT", detail: "provider_code=-123" }),
  ],
  [
    "underlying fields are independent",
    {
      message: "failed",
      underlyingErrorMessage: " root ",
      data: { underlyingErrorDetail: " inner " },
    },
    expected("failed", { underlyingErrorMessage: "root", underlyingErrorDetail: "inner" }),
  ],
  [
    "empty attribution is a successful first match",
    { attribution: {}, data: { attribution: { source: "provider" } } },
    expected("Internal error", { attribution: {} }),
  ],
  [
    "invalid attribution yields to valid nested schema",
    {
      attribution: { unknown: true },
      data: { attribution: { source: "network", retryable: false, statusCode: 503 } },
    },
    expected("Internal error", {
      attribution: { source: "network", statusCode: 503, retryable: false },
    }),
  ],
  [
    "all invalid attribution is omitted",
    { attribution: { source: "invalid" }, data: { attribution: null } },
    expected("Internal error"),
  ],
  [
    "JSON string fields populate ids and code",
    '{"code":"C","message":"M","traceId":" T ","taskId":" task "}',
    expected("M", { code: "C", traceId: "T", taskId: "task" }),
  ],
];

for (const [name, input, result] of cases) {
  test(`B1 UI error: ${name}`, () => assert.deepEqual(normalize(input), result));
}

test("B1 UI error: JSON record candidate expansion is one level and route dependent", () => {
  const nested = JSON.stringify({ message: "Internal error", detail: "actionable" });
  assert.deepEqual(
    normalize({ message: "Internal error", detail: nested }),
    expected(nested, { detail: "actionable" }),
  );
  const outer = JSON.stringify({ message: nested });
  assert.deepEqual(normalize(outer), expected(nested));
  const twice = JSON.stringify({ message: nested });
  assert.deepEqual(normalize({ message: twice }), expected(twice, { detail: nested }));
});

test("B1 UI error: each generic message yields to the provider root cause", () => {
  for (const message of [
    "Internal error",
    "Turn execution failed",
    "Compact failed",
    "Rewind failed",
    "Knorvia Studio session failed",
  ]) {
    assert.deepEqual(
      normalize({ message, data: { knorvia: { error: { message: "root cause" } } } }),
      expected("root cause"),
    );
  }
  assert.deepEqual(
    normalize({ message: "internal error", detail: "root cause" }),
    expected("internal error", { detail: "root cause" }),
  );
});

test("B1 UI error: code path precedence is frozen at every position", () => {
  const paths = [
    "code",
    "providerCode",
    "data.code",
    "data.error.code",
    "data.knorvia.error.code",
    "data.knorvia.error.context.providerCode",
    "data.error.context.providerCode",
    "context.providerCode",
  ];
  for (let first = 0; first < paths.length; first++) {
    const input: Record<string, unknown> = { message: "failed" };
    for (let index = first; index < paths.length; index++) {
      const parts = paths[index]!.split(".");
      let node = input;
      for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>;
      node[parts.at(-1)!] = ` code-${index} `;
    }
    assert.equal(normalize(input).code, `code-${first}`);
  }
});

test("B1 UI error: fallback and option ids preserve explicit empty strings", () => {
  assert.deepEqual(
    normalize({}, { fallbackCode: "", fallbackMessage: "", traceId: "", taskId: "" }),
    { code: "", message: "", detail: undefined, traceId: "", taskId: "" },
  );
  assert.equal(normalize({}, { fallbackMessage: "  fallback  " }).message, "  fallback  ");
  assert.deepEqual(
    normalize(
      { message: "M", traceId: "from-error", taskId: "task" },
      { traceId: null, taskId: null },
    ),
    expected("M", { traceId: "from-error", taskId: "task" }),
  );
});

test("B1 UI error: public own fields and key order distinguish absent from undefined", () => {
  const plain = normalize({});
  assert.deepEqual(Object.keys(plain), ["code", "message", "detail", "traceId", "taskId"]);
  assert.equal(Object.hasOwn(plain, "detail"), true);
  assert.equal(Object.hasOwn(plain, "underlyingErrorMessage"), false);
  const full = normalize({
    underlyingErrorMessage: "M",
    underlyingErrorDetail: "D",
    attribution: {},
  });
  assert.deepEqual(Object.keys(full), [
    "code",
    "message",
    "detail",
    "underlyingErrorMessage",
    "underlyingErrorDetail",
    "traceId",
    "taskId",
    "attribution",
  ]);
});

test("B1 UI error: Error fields, inherited fields and frozen inputs remain readable", () => {
  const error = Object.assign(new Error("outer"), {
    data: { details: "inner" },
    providerCode: "429",
  });
  assert.deepEqual(normalize(error), expected("outer", { code: "429", detail: "inner" }));
  const inherited = Object.freeze(Object.create({ message: "inherited", code: "C" }));
  assert.deepEqual(normalize(inherited), expected("inherited", { code: "C" }));
});

test("B1 UI error: arrays stop nested traversal and cause is outside this projection", () => {
  assert.deepEqual(
    normalize({ data: [{ message: "ignored" }], cause: new Error("ignored") }),
    expected("Internal error"),
  );
});

test("B1 UI error: getter and String conversion failures remain public", () => {
  const failure = new Error("getter failure");
  assert.throws(
    () =>
      normalize({
        get message() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  const array = Object.assign([], {
    toString() {
      throw failure;
    },
  });
  assert.throws(
    () => normalize(array),
    (error) => error === failure,
  );
});
