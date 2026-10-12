// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组最后三文件之二（A12 filePartToContentBlock 的同步投影分支）。
// 入口用文件级入口 `src/agent/file-part-hydration.ts`（该导出不经区域桶）。
// 本轮只覆盖**不需要注入 store**的分支（内联 data URL、媒体类型推导、text 预览、文本回落与引用身份），
// 需要 `artifactStore.readToolResultArtifact` 的分支登记在 acceptance §18。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const hydration = await loadFile("agent/file-part-hydration");
const toBlock = (part) => hydration.filePartToContentBlock(part, undefined);

const fileOrigin = (path, value) => ({ type: "file", path, text: { value } });

test("A12 filePartToContentBlock：内联媒体的块形态与引用身份", async () => {
  const imagePart = {
    id: "f1",
    mime: "image/png",
    url: "data:image/png;base64,AAAA",
    filename: "shot.png",
    source: fileOrigin("/w/shot.png", "shot.png"),
    metadata: { sizeBytes: 3, sha256: "abc" },
  };
  const image = await toBlock(imagePart);
  assert.equal(image.type, "image");
  assert.equal(image.mediaType, "image/png");
  assert.equal(image.dataUrl, "data:image/png;base64,AAAA");
  assert.deepEqual(image.source, {
    id: "f1",
    kind: "local_file",
    uri: "data:image/png;base64,AAAA",
    path: "/w/shot.png",
    mimeType: "image/png",
    sizeBytes: 3,
    sha256: "abc",
    placeholder: "shot.png",
  });

  const wildcard = await toBlock({
    id: "f2",
    mime: "image/*",
    url: "data:image/webp;base64,AA",
    filename: "w.webp",
    source: fileOrigin("/w/w.webp", "w.webp"),
    metadata: {},
  });
  assert.equal(wildcard.type, "image");
  assert.equal(wildcard.mediaType, "image/webp", "image/* 时从 data URL 推导媒体类型");

  const video = await toBlock({
    id: "f3",
    mime: "video/mp4",
    url: "data:video/mp4;base64,AA",
    filename: "v.mp4",
    source: fileOrigin("/w/v.mp4", "v.mp4"),
    metadata: {},
  });
  assert.equal(video.type, "video");
  assert.equal(video.mediaType, "video/mp4");

  const pdf = await toBlock({
    id: "f4",
    mime: "application/pdf; charset=binary",
    url: "data:application/pdf;base64,AA",
    filename: "d.pdf",
    source: fileOrigin("/w/d.pdf", "d.pdf"),
    metadata: {},
  });
  assert.equal(pdf.type, "file");
  assert.equal(pdf.mediaType, "application/pdf", "PDF 带参数时归一为 application/pdf");
  assert.equal(pdf.name, "d.pdf");

  const resource = await toBlock({
    id: "f5",
    mime: "application/pdf",
    url: "data:application/pdf;base64,AA",
    filename: "d.pdf",
    source: { type: "resource", uri: "https://example.invalid/d.pdf", text: { value: "d.pdf" } },
    metadata: {},
  });
  assert.equal(resource.source.kind, "resource");
  assert.equal(resource.source.uri, "https://example.invalid/d.pdf");

  // 实测 quirk：`source` 存在时 `source.text.value` 必填——实现写的是 `origin?.text.value`，
  // 可选链只护住 `origin`，缺 `text` 会抛 `TypeError: Cannot read properties of undefined (reading 'value')`。
  await assert.rejects(
    () =>
      toBlock({
        id: "f11",
        mime: "application/pdf",
        url: "https://example.invalid/x.pdf",
        filename: "x.pdf",
        source: { type: "resource", uri: "https://example.invalid/x.pdf" },
        metadata: {},
      }),
    TypeError,
  );
});

test("A12 filePartToContentBlock：text 预览与文本回落", async () => {
  const previewed = await toBlock({
    id: "f6",
    mime: "text/markdown",
    url: "https://example.invalid/a.md",
    filename: "a.md",
    source: undefined,
    metadata: { preview: { text: "# preview" } },
  });
  assert.deepEqual(previewed, { type: "text", text: "# preview" });

  const fallback = await toBlock({
    id: "f7",
    mime: "application/octet-stream",
    url: "https://example.invalid/blob.bin",
    filename: "blob.bin",
    source: undefined,
    metadata: {},
  });
  assert.deepEqual(fallback, {
    type: "text",
    text: "[Attached application/octet-stream: blob.bin]",
  });

  const noName = await toBlock({
    id: "f8",
    mime: "application/octet-stream",
    url: "https://example.invalid/raw",
    source: undefined,
    metadata: {},
  });
  assert.deepEqual(noName, {
    type: "text",
    text: "[Attached application/octet-stream: https://example.invalid/raw]",
  });

  const localRef = await toBlock({
    id: "f9",
    mime: "application/octet-stream",
    url: "https://example.invalid/ignored",
    filename: "ignored.bin",
    source: fileOrigin("/w/real.bin", "real.bin"),
    metadata: { storageKind: "local_ref" },
  });
  assert.deepEqual(localRef, {
    type: "text",
    text: "[Attached application/octet-stream: real.bin]",
  });

  const textWithoutPreview = await toBlock({
    id: "f10",
    mime: "text/plain",
    url: "https://example.invalid/a.txt",
    filename: "a.txt",
    source: undefined,
    metadata: {},
  });
  assert.deepEqual(textWithoutPreview, { type: "text", text: "[Attached text/plain: a.txt]" });
});
