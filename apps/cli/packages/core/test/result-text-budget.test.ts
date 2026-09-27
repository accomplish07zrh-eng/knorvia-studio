// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  appendHookToPersistedArtifactPreview,
  appendHookToStringContent,
  fitContentWithSuffix,
  projectHookAugmentedModelContent,
} from "../src/tool/executor/result-content-projection.js";
import {
  formatGenericPersistedOutputContent,
  formatPersistedOutputEnvelope,
  isPersistedOutputContent,
} from "../src/tool/result-persistence-format.js";
import type { ModelMessageContentBlock } from "@knorvia/contracts";

test("suffix reserves bytes first and head/tail never split a code point", () => {
  const source = "a中😀z";
  assert.equal(fitContentWithSuffix(source, 6, "!", "head"), "a中!");
  assert.equal(fitContentWithSuffix(source, 6, "!", "tail"), "😀z!");
  assert.equal(fitContentWithSuffix(source, 3, "😀!", "tail"), "z");
  assert.equal(fitContentWithSuffix(source, 4, "😀!", "tail"), "😀");
  assert.equal(fitContentWithSuffix("e\u0301z", 2, "", "head"), "e");
  assert.equal(fitContentWithSuffix("\ud800A", 3, "", "head"), "\ud800");
  assert.equal(fitContentWithSuffix("A\udc00", 3, "", "tail"), "\udc00");
  for (const limit of [0, -1, NaN])
    assert.equal(fitContentWithSuffix(source, limit, "!", "head"), "");
  assert.equal(fitContentWithSuffix(source, 4.5, "!", "head"), "a!");
  assert.equal(fitContentWithSuffix(source, Infinity, "!", "head"), source + "!");
});

test("ordinary hooks share the budget, persisted previews reserve only the hook budget", () => {
  assert.deepEqual(appendHookToStringContent("body", "\n\nhook", 10, "head"), {
    content: "body\n\nhook",
    truncated: false,
  });
  assert.deepEqual(appendHookToStringContent("body", "\n\nhook", 8, "tail"), {
    content: "dy\n\nhook",
    truncated: true,
  });
  assert.deepEqual(appendHookToPersistedArtifactPreview("very long preview", "\n\n中!", 5), {
    content: "very long preview\n\n中",
    truncated: true,
  });
});

test("generic persisted preview has a separate character budget and stable decimal labels", () => {
  assert.equal(
    formatGenericPersistedOutputContent({
      content: "value",
      originalBytes: 999,
      persistedPath: "artifact:sample",
    }),
    "<persisted-output>\nOutput too large (999 B). Full output saved to: artifact:sample\n\nPreview (first 2 KB):\nvalue\n</persisted-output>",
  );
  for (const [bytes, label] of [
    [1500, "2 KB"],
    [1999999, "2 MB"],
    [2500000000, "3 GB"],
  ] as const) {
    assert.ok(
      formatGenericPersistedOutputContent({
        content: "中".repeat(2001),
        originalBytes: bytes,
        persistedPath: "p",
      }).includes(`(${label})`),
    );
  }
  const value = formatGenericPersistedOutputContent({
    content: "中".repeat(2001),
    originalBytes: 6003,
    persistedPath: "p",
  });
  assert.ok(value.endsWith("中".repeat(2000) + "\n...\n</persisted-output>"));
});

test("character preview uses only a newline strictly after halfway and calls the supplied formatter in order", () => {
  for (const [content, expected] of [
    ["12345\n7890123", "12345\n7890"],
    ["123456\n890123", "123456"],
    ["1234567890", "1234567890"],
  ]) {
    const calls: number[] = [];
    const actual = formatPersistedOutputEnvelope({
      content,
      previewChars: 10,
      originalBytes: 88,
      persistedPath: " p ",
      formatBytes: (n) => {
        calls.push(n);
        return `${n}u`;
      },
    });
    assert.deepEqual(calls, [88, 10]);
    assert.equal(
      actual,
      `<persisted-output>\nOutput too large (88u). Full output saved to:  p \n\nPreview (first 10u):\n${expected}${content.length > 10 ? "\n..." : ""}\n</persisted-output>`,
    );
  }
  assert.equal(isPersistedOutputContent("<persisted-output>x</persisted-output>after"), true);
  for (const text of [
    " <persisted-output>x</persisted-output>",
    "<persisted-output>x",
    "x</persisted-output>",
  ])
    assert.equal(isPersistedOutputContent(text), false);
});

test("preview compatibility keeps existing negative slice behavior and ignores unrelated input properties", () => {
  const envelope = formatPersistedOutputEnvelope({
    content: "abcdef",
    previewChars: -3,
    originalBytes: 6,
    persistedPath: "p",
    formatBytes: String,
  });
  assert.ok(envelope.endsWith("\nabcde\n...\n</persisted-output>"));
  const input = { content: "abc", originalBytes: 3, persistedPath: "p" };
  Object.defineProperty(input, "unrelated", {
    enumerable: true,
    get() {
      throw new Error("must not read");
    },
  });
  assert.ok(formatGenericPersistedOutputContent(input).includes("\nabc\n"));
});

test("truncated structured hooks preserve media and extract file text without mutating blocks", () => {
  const image = { type: "image", mediaType: "image/png", dataUrl: "data:fixture" } as const;
  const emptyFile = { type: "file", mediaType: "text/plain", text: "" } as const;
  const reasoning = { type: "reasoning", text: "hidden" } as const;
  const blocks: ModelMessageContentBlock[] = [
    image,
    { type: "text", text: "first" },
    { type: "file", mediaType: "text/plain", text: "second" },
    emptyFile,
    reasoning,
  ];
  const actual = projectHookAugmentedModelContent({
    artifactPreview: false,
    contentProjection: { content: "converted", truncated: true },
    hookContext: "H",
    maxModelBytes: 20,
    modelContent: blocks,
    previewDirection: "head",
    suffix: "\n\nH",
  });
  assert.deepEqual(actual, [
    image,
    emptyFile,
    reasoning,
    { type: "text", text: "first\n\nsecond\n\nH" },
  ]);
  assert.equal(blocks.length, 5);
  assert.equal((actual as ModelMessageContentBlock[])[0], image);
  assert.equal(
    projectHookAugmentedModelContent({
      artifactPreview: true,
      contentProjection: { content: "saved", truncated: false },
      hookContext: "H",
      maxModelBytes: 0,
      modelContent: blocks,
      previewDirection: "head",
      suffix: "H",
    }),
    "saved",
  );
});

test("structured text is captured once before the retained-block pass", () => {
  let reads = 0;
  const image = { type: "image", mediaType: "image/png", dataUrl: "fixture" } as const;
  const text = {
    type: "text" as const,
    get text() {
      return `value-${++reads}`;
    },
  };
  const actual = projectHookAugmentedModelContent({
    artifactPreview: false,
    contentProjection: { content: "clipped", truncated: true },
    hookContext: "H",
    maxModelBytes: 100,
    modelContent: [image, text],
    previewDirection: "head",
    suffix: "\n\nH",
  });
  assert.deepEqual(actual, [image, { type: "text", text: "value-1\n\nH" }]);
  assert.equal(reads, 1);
});
