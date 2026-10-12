// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组最后三文件之四（A14 filePartToContentBlock 的 artifact 分支）。
// 入口用文件级入口 `src/agent/file-part-hydration.ts`（该导出不经区域桶）。
//
// 实测（探针）：`isArtifactUri` 接受 `knorvia-artifact://…`（`artifact://`/`artifact:`/`https://` 一律 false）。
// 命中 artifact 身份的条件是「本地 file/symbol 起源 + 媒体 mime + durableUri 是 artifact URI」，
// 此时引用身份为 `kind:"inline"`、`uri = metadata.artifactUri`、**`path` 置空**；
// payload 由注入的 `artifactStore.readToolResultArtifact` 提供（必须是内联 data URL），读取失败/内容非 data URL 时回落文本。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const hydration = await loadFile("agent/file-part-hydration");
const toBlock = (part, store) => hydration.filePartToContentBlock(part, store);

const artifactUri = "knorvia-artifact://a1";
const part = {
  id: "f1",
  mime: "image/png",
  url: artifactUri,
  filename: "shot.png",
  source: { type: "file", path: "/w/shot.png", text: { value: "shot.png" } },
  metadata: { artifactUri, sizeBytes: 3 },
};
const storeReturning = (content) => ({ readToolResultArtifact: async () => ({ content }) });

test("A14 filePartToContentBlock：artifact 身份分支与引用形状", async () => {
  const block = await toBlock(part, storeReturning("data:image/png;base64,ZZZZ"));
  assert.equal(block.type, "image");
  assert.equal(block.mediaType, "image/png");
  assert.equal(block.dataUrl, "data:image/png;base64,ZZZZ", "payload 来自 artifact 读取");
  assert.equal(block.source.kind, "inline", "artifact 身份使用 inline 引用");
  assert.equal(block.source.uri, artifactUri, "uri 取 metadata.artifactUri");
  assert.equal(block.source.path, undefined, "artifact 身份下 path 置空");
  assert.equal(block.source.sizeBytes, 3);
  assert.equal(block.source.placeholder, "shot.png");
  assert.equal(block.source.mimeType, "image/png");
});

test("A14 filePartToContentBlock：artifact 读取失败或内容非 data URL 时回落文本", async () => {
  const throwing = {
    readToolResultArtifact: async () => {
      throw new Error("artifact unavailable");
    },
  };
  const failed = await toBlock(part, throwing);
  assert.equal(failed.type, "text", "读取失败保留文本回落");
  assert.equal(failed.text, "[Attached image/png: shot.png]");

  const notInline = await toBlock(part, storeReturning("not-a-data-url"));
  assert.equal(notInline.type, "text", "内容不是内联 data URL 时不产出图片块");

  const noStore = await toBlock(part, undefined);
  assert.equal(noStore.type, "text", "没有 artifact store 时回落文本");

  const nonArtifactUri = await toBlock(
    { ...part, url: "https://example.invalid/shot.png", metadata: { sizeBytes: 3 } },
    storeReturning("data:image/png;base64,ZZZZ"),
  );
  assert.equal(nonArtifactUri.type, "text", "durableUri 不是 artifact URI 时不走身份分支");
});
