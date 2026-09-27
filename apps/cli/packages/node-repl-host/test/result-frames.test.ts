// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";

// The current runtime does not attest official frame text. Exercise its public
// predicate contract with a local fixture, without claiming real driver support.
mock.module("@knorvia/cua/frame-contract", {
  namedExports: {
    isOfficialCuaImageRefText: (text: string) => text.startsWith("fixture-authority:"),
  },
});
const { toMcpRunResult } = await import("../src/result.js");
const text = (text: string) => ({ type: "text", text });
const image = (data: string) => ({ type: "image", data, mimeType: "image/png" });

test("REPL keeps only the last recognized frame pair across structured results", () => {
  const result = toMcpRunResult({
    logs: "log",
    structuredResults: [
      { content: [text("before"), image("old"), text("fixture-authority:old"), image("ordinary")] },
      { content: [text("between"), image("new")] },
      { content: [text("fixture-authority:new"), text("after")] },
    ],
  });
  assert.deepEqual(result.content, [
    text("before"),
    image("ordinary"),
    text("between"),
    image("new"),
    text("fixture-authority:new"),
    text("after"),
    text("log"),
  ]);
});

test("REPL orphan authority and ordinary text never remove surrounding ordinary images", () => {
  const blocks = [text("fixture-authority:orphan"), image("A"), text("ordinary"), image("B")];
  assert.deepEqual(
    toMcpRunResult({ logs: "", structuredResults: [{ content: blocks }] }).content,
    blocks,
  );
});

test("REPL maps screenshot origin after frame pruning, including a separately emitted old image", () => {
  const result = toMcpRunResult({
    logs: "",
    structuredResults: [
      {
        content: [
          image("old"),
          text("fixture-authority:old"),
          text("middle"),
          image("new"),
          text("fixture-authority:new"),
        ],
      },
    ],
    images: [
      { base64: "old", mimeType: "image/png" },
      { base64: "new", mimeType: "image/png" },
    ],
    browserScreenshotImageIndices: [0, 1],
  });
  assert.deepEqual(result.content, [
    text("middle"),
    image("new"),
    text("fixture-authority:new"),
    image("old"),
  ]);
  assert.deepEqual(result._meta?.["knorvia/browserScreenshotContentIndices"], [3, 1]);
});

test("REPL prunes embedded fallback frames without reordering separate emitted images", () => {
  const result = toMcpRunResult({
    logs: "",
    result: JSON.stringify({
      content: [
        image("old"),
        text("fixture-authority:old"),
        image("new"),
        text("fixture-authority:new"),
      ],
    }),
    images: [{ base64: "new", mimeType: "image/png" }],
  });
  assert.deepEqual(result.content, [image("new"), image("new"), text("fixture-authority:new")]);
});
