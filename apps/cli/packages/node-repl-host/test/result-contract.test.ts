// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import type { NodeReplRunResult, NodeReplStructuredResult } from "@knorvia/core/repl";
import { toMcpRunResult } from "../src/result.js";

const text = (text: string) => ({ type: "text" as const, text });
const image = (data: string, mimeType = "image/png") => ({
  type: "image" as const,
  data,
  mimeType,
});
const picture = (base64: string, mimeType = "image/png") => ({ base64, mimeType });
const SCREENSHOTS = "knorvia/browserScreenshotContentIndices";
const APP = "knorvia/nodeReplCuaApp";
const ASSOCIATIONS = "knorvia.cua/app-associations-v1";
const HAS_IMAGE = "knorvia/nodeReplEmittedImage";

test("REPL results preserve empty output, logs and prefixed final values", () => {
  assert.deepEqual(toMcpRunResult({ logs: "" }), { content: [text("(no output)")] });
  assert.deepEqual(toMcpRunResult({ logs: "first\nsecond" }), { content: [text("first\nsecond")] });
  assert.deepEqual(toMcpRunResult({ logs: "log", result: "42" }), {
    content: [text("log\n=> 42")],
  });
  assert.deepEqual(toMcpRunResult({ logs: "", result: "" }), { content: [text("=> ")] });
});

test("REPL image-only output places images before logs and final value", () => {
  const result = toMcpRunResult({
    logs: "observed",
    result: "done",
    images: [picture("A"), picture("B", "image/jpeg")],
  });
  assert.deepEqual(result, {
    content: [image("A"), image("B", "image/jpeg"), text("observed\n=> done")],
    _meta: { [HAS_IMAGE]: true },
  });
});

test("REPL explicit results keep block order and suppress fallback final values", () => {
  const a = { content: [text("first")], structuredContent: { first: true }, _meta: { order: 1 } };
  const b = {
    content: [text("second")],
    structuredContent: {},
    _meta: { order: 2 },
    isError: true,
  };
  const result = toMcpRunResult({
    logs: "log",
    result: JSON.stringify({ content: [text("fallback")] }),
    structuredResults: [a, b],
    images: [picture("A")],
  });
  assert.deepEqual(result, {
    content: [text("first"), text("second"), image("A"), text("log")],
    structuredContent: {},
    isError: true,
    _meta: { order: 2, [HAS_IMAGE]: true },
  });
});

test("REPL embedded content accepts plain or prefixed objects and follows emitted images", () => {
  for (const prefix of ["", "=> ", " \n=> "]) {
    const result = toMcpRunResult({
      logs: "log",
      result:
        prefix +
        JSON.stringify({
          content: [text("fallback"), image("A")],
          structuredContent: { value: 1 },
          _meta: { embedded: true },
        }),
      images: [picture("A")],
      browserScreenshotImageIndices: [0],
    });
    assert.deepEqual(result, {
      content: [image("A"), text("fallback"), image("A"), text("log")],
      structuredContent: { value: 1 },
      _meta: { embedded: true, [SCREENSHOTS]: [0], [HAS_IMAGE]: true },
    });
  }
});

test("REPL malformed embedded shapes remain ordinary text", () => {
  for (const result of [
    "not json",
    "null",
    "3",
    "[]",
    "{}",
    '{"content":null}',
    '{"content":[null]}',
    '{"content":[{"type":3}]}',
  ]) {
    assert.deepEqual(toMcpRunResult({ logs: "", result }), { content: [text(`=> ${result}`)] });
  }
  assert.deepEqual(toMcpRunResult({ logs: "", result: '{"content":[]}' }), {
    content: [text("(no output)")],
  });
});

test("REPL explicit image reuse matches both bytes and MIME while plain images stay distinct", () => {
  const result = toMcpRunResult({
    logs: "",
    structuredResults: [
      { content: [text("prefix"), image("A"), image("A"), image("B", "image/jpeg")] },
    ],
    images: [picture("A"), picture("B"), picture("A"), picture("B", "image/jpeg")],
    browserScreenshotImageIndices: [0, 1, 2, 3],
  });
  assert.deepEqual(result.content, [
    text("prefix"),
    image("A"),
    image("A"),
    image("B", "image/jpeg"),
    image("B"),
  ]);
  assert.deepEqual(result._meta?.[SCREENSHOTS], [1, 4, 3]);
  assert.deepEqual(
    toMcpRunResult({
      logs: "",
      images: [picture("A"), picture("A")],
      browserScreenshotImageIndices: [1, 0, 1],
    })._meta?.[SCREENSHOTS],
    [1, 0],
  );
  assert.deepEqual(
    toMcpRunResult({
      logs: "",
      structuredResults: [{ content: [] }],
      images: [picture("A"), picture("A")],
    }).content,
    [image("A")],
  );
});

test("REPL screenshot provenance maps only existing emitted images in requested order", () => {
  const result = toMcpRunResult({
    logs: "",
    structuredResults: [{ content: [text("offset"), image("B"), image("unobserved")] }],
    images: [picture("A"), picture("B")],
    browserScreenshotImageIndices: [1, -1, 99, 0, 0, 0.5, NaN],
  });
  assert.deepEqual(result._meta?.[SCREENSHOTS], [1, 3]);
  assert.ok(
    !(
      SCREENSHOTS in
      (toMcpRunResult({ logs: "", images: [picture("A")], browserScreenshotImageIndices: [99] })
        ._meta ?? {})
    ),
  );
});

test("REPL metadata overlays retain ordinary fields and reject forged host authority", () => {
  const forged = {
    [SCREENSHOTS]: [99],
    [APP]: { appKey: "forged" },
    [ASSOCIATIONS]: { primary: { appKey: "forged" } },
    order: "response",
  };
  const input: NodeReplRunResult = {
    logs: "",
    responseMeta: forged,
    structuredResults: [
      { content: [text("first")], _meta: { ...forged, order: "first", extra: 1 } },
      { content: [], _meta: { order: "last" } },
    ],
  };
  assert.deepEqual(toMcpRunResult(input)._meta, { order: "last", extra: 1 });
  assert.deepEqual(
    toMcpRunResult({ ...input, cuaApp: { appKey: "trusted", displayName: "Fixture" } })._meta,
    { order: "last", extra: 1, [APP]: { appKey: "trusted", displayName: "Fixture" } },
  );
  assert.equal(input.responseMeta, forged);
  assert.equal(forged[SCREENSHOTS][0], 99);
});

test("REPL error drops content and screenshot authority but preserves observed app and metadata", () => {
  const result = toMcpRunResult({
    logs: "hidden log",
    result: "hidden final",
    images: [picture("hidden")],
    browserScreenshotImageIndices: [0],
    error: { name: "Failure", message: "visible error", stack: "hidden stack" },
    structuredResults: [
      {
        content: [text("hidden content"), image("hidden")],
        _meta: { info: "known" },
        structuredContent: { recorded: true },
      },
    ],
    cuaApp: { appKey: "trusted" },
  });
  assert.deepEqual(result, {
    content: [text("visible error")],
    isError: true,
    structuredContent: { recorded: true },
    _meta: { info: "known", [APP]: { appKey: "trusted" } },
  });
  const fallback = toMcpRunResult({
    logs: "",
    error: { name: "Failure", message: "failed" },
    result: JSON.stringify({
      content: [],
      _meta: { hidden: true },
      structuredContent: { hidden: true },
    }),
  });
  assert.deepEqual(fallback, { content: [text("failed")], isError: true });
});

test("REPL result adapter leaves frozen inputs unchanged", () => {
  const structured: NodeReplStructuredResult = {
    content: [text("value")],
    _meta: { normal: true, [APP]: { appKey: "forged" } },
  };
  const run: NodeReplRunResult = {
    logs: "",
    images: [picture("A")],
    structuredResults: [structured],
    responseMeta: { response: 1 },
    browserScreenshotImageIndices: [0],
  };
  const freeze = (value: unknown) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(run);
  const before = JSON.stringify(run);
  assert.equal(toMcpRunResult(run).content.length, 2);
  assert.equal(JSON.stringify(run), before);
});

test("REPL JSON metadata keys cannot replace the output prototype", () => {
  const input = JSON.parse('{"__proto__":{"foreign":true},"label":"ordinary"}');
  for (const run of [
    { logs: "", responseMeta: input },
    { logs: "", structuredResults: [{ content: [], _meta: input }] },
  ]) {
    const result = toMcpRunResult(run);
    assert.equal(Object.getPrototypeOf(result._meta), Object.prototype);
    assert.equal(Object.hasOwn(result._meta!, "__proto__"), true);
    assert.equal(result._meta?.foreign, undefined);
    assert.equal(result._meta?.label, "ordinary");
  }
});
