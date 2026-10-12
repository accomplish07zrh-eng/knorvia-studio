// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组最后三文件之一（A11 projectPersistedToolMediaContent）。
// 入口用文件级入口 `src/agent/file-part-hydration.ts`：该导出**不经区域桶**，与 A8/A10 同口径。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const hydration = await loadFile("agent/file-part-hydration");
const project = (value, blocks = []) => hydration.projectPersistedToolMediaContent(value, blocks);

test("A11 projectPersistedToolMediaContent：全有或全无的行校验", () => {
  assert.equal(project(undefined), undefined);
  assert.equal(project([]), undefined, "空数组视为没有内容");
  assert.equal(project("not-an-array"), undefined);
  assert.equal(project([null]), undefined, "null 行不合法");
  assert.equal(project([[]]), undefined, "数组行不合法");
  assert.equal(project([{ type: "unknown" }]), undefined, "未知行类型不合法");
  assert.equal(project([{ type: "text", text: 5 }]), undefined, "text 必须是字符串");
  assert.equal(project([{ type: "attachment" }]), undefined, "attachment 必须有索引");
  assert.equal(project([{ type: "attachment", attachmentIndex: -1 }]), undefined, "索引不得为负");
  assert.equal(project([{ type: "attachment", attachmentIndex: 1.5 }]), undefined, "索引必须是整数");
  assert.equal(
    project([{ type: "text", text: "ok" }, { type: "unknown" }]),
    undefined,
    "任一行不合法就整体丢弃（不做部分投影）",
  );
});

test("A11 projectPersistedToolMediaContent：文本与附件块投影", () => {
  const attachment = { type: "image", mediaType: "image/png", dataUrl: "data:image/png;base64,AA" };
  const projected = project(
    [
      { type: "text", text: "first" },
      { type: "attachment", attachmentIndex: 0 },
      { type: "text", text: "second" },
    ],
    [attachment],
  );
  assert.deepEqual(projected, [
    { type: "text", text: "first" },
    attachment,
    { type: "text", text: "second" },
  ]);
  assert.equal(projected[1], attachment, "附件行引用同一个块对象（不复制）");
  assert.notEqual(projected[0], undefined);

  assert.equal(project([{ type: "attachment", attachmentIndex: 3 }], [attachment]), undefined, "索引越界整体丢弃");

  const textOnly = project([{ type: "text", text: "" }]);
  assert.deepEqual(textOnly, [{ type: "text", text: "" }], "空文本行合法");
});
