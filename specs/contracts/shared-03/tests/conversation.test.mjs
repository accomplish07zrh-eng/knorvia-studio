// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：conversation/assistant 五件（behavior B20–B26，金样④）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";
import { conversationShareRoundtrip as golden } from "./fixtures.mjs";

const parts = await loadModule("assistant-message-parts");
const presentation = await loadModule("assistant-presentation");
const policy = await loadModule("conversation-message-projection-policy");
const preview = await loadModule("conversation-preview-artifacts");
const share = await loadModule("conversation-share");

test("B20 分段合并语义", () => {
  const base = [{ type: "content", content: "a" }];
  const merged = parts.appendAssistantMessagePart(base, { type: "content", content: "b" });
  assert.deepEqual(merged, [{ type: "content", content: "ab" }]);
  assert.deepEqual(base, [{ type: "content", content: "a" }], "不改原数组");
  const appended = parts.appendAssistantMessagePart(merged, { type: "thought", content: "t" });
  assert.equal(appended.length, 2);
  const tool = parts.appendAssistantMessagePart(appended, { type: "tool-call", toolId: "x" });
  const tool2 = parts.appendAssistantMessagePart(tool, { type: "tool-call", toolId: "y" });
  assert.equal(tool2.length, 4, "tool-call 永不合并");
  assert.deepEqual(parts.appendAssistantMessagePart(undefined, { type: "content", content: "z" }), [
    { type: "content", content: "z" },
  ]);
  assert.equal(parts.getLatestAssistantContentText(tool2), "ab");
  assert.equal(parts.getLatestAssistantContentPart([{ type: "thought", content: "t" }]), null);
});

test("B21 呈现组装：root 判定、去重、latestPart 取消语义", () => {
  const built = presentation.buildKnorviaAssistantPresentation({
    content: "hello",
    thought: "think",
    toolCalls: [
      { toolId: "t1", kind: "Bash", input: {}, status: "ok" },
      { toolId: "t2", parentToolUseId: "t1", kind: "Bash", input: {}, status: "ok" },
      { toolId: "t1", kind: "Bash", input: {}, status: "done" },
    ],
  });
  assert.deepEqual(
    built.messageParts.map((p) => p.type),
    ["thought", "tool-call", "tool-call", "content"],
    "messageParts 保留重复 root 条目，blocks 才去重",
  );
  const toolBlocks = built.blocks.filter((b) => b.type === "tool-call");
  assert.equal(toolBlocks.length, 1, "只渲染 root 且首见");
  assert.equal(built.latestPart?.content, "hello");
  assert.equal(built.historyBlocks.length, built.blocks.length - 1);
  const streaming = presentation.buildKnorviaAssistantPresentation({
    content: "x",
    toolCalls: [],
    streaming: true,
  });
  assert.equal(streaming.latestPart, null, "streaming 不选 latestPart");
});

test("B22 投影策略判定序（抽样七路）", () => {
  const msg = (info, semantics, partsList = []) => ({ info, semantics, parts: partsList });
  assert.equal(
    policy.getConversationMessageProjectionPolicy(msg({ role: "user", summary: {} })),
    "providerContextOnly",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(
      msg({ role: "user", source: "subagent" }, undefined),
    ),
    "providerContextOnly",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(msg({ role: "user", source: "fork" }, undefined)),
    "timelineOnly",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(msg({ role: "assistant" }, undefined)),
    "visibleAssistant",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(msg({ role: "user" }, undefined)),
    "realUserInput",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(
      msg({ role: "user" }, undefined, [{ metadata: { visibility: "model-only" } }]),
    ),
    "providerContextOnly",
  );
  assert.equal(
    policy.getConversationMessageProjectionPolicy(
      msg({ role: "user" }, undefined, [{ text: "<task-notification>..." }], undefined),
    ),
    "realUserInput",
    "非 synthetic 的 legacy 通知文本不改判（以实测为准）",
  );
});

test("B23 预览常量与引用抽取", () => {
  assert.equal(preview.CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT, 15);
  assert.equal(preview.CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT, 10);
  const refs = preview.extractConversationPreviewFileReferences(
    "看到 `docs/a.md` 与 [link](docs/b.pdf) 和 file:///ws/docs/c.xlsx",
    "/ws",
  );
  const paths = refs.map((r) => r.path);
  assert.ok(paths.includes("/ws/docs/a.md"), "裸路径");
  assert.ok(paths.includes("/ws/docs/b.pdf"), "markdown 链接");
  assert.ok(paths.includes("/ws/docs/c.xlsx"), "file URL");
  const types = refs.map((r) => r.kind);
  assert.ok(types.includes("markdown") && types.includes("pdf") && types.includes("xlsx"));
});

test("B25/B26 分享金样：pathname/localize/decode/narrow/envelope/version", () => {
  assert.equal(golden.constants.schemaVersion, 1);
  assert.deepEqual(golden.constants.localePathPrefix, share.CONVERSATION_SHARE_LOCALE_PATH_PREFIX);
  for (const c of golden.pathnameCases) {
    assert.deepEqual(c.actual, c.expect, `parse(${c.url})`);
  }
  for (const c of golden.localizeCases) {
    assert.equal(c.actual, c.expect, `localize(${c.url}, ${c.locale})`);
  }
  assert.equal(golden.decoded.rows.length, 2);
  assert.equal(golden.decoded.unsupportedCount, 1);
  assert.deepEqual(golden.decoded.unsupportedKinds, ["future_kind"]);
  // 现场重放 decode 语义
  const rerun = share.decodeConversationShareRows([{ kind: "future_kind" }]);
  assert.equal(rerun.unsupportedCount, 1);
  assert.deepEqual(rerun.rows, []);
  // narrow：未知取值丢弃并计数（金样）
  assert.deepEqual(golden.caps.unsupportedArtifactTypes, ["unknown_type"]);
  assert.deepEqual(golden.caps.unsupportedAccessModes, ["future_mode"]);
  assert.equal(golden.caps.capabilities.allowed_artifacts.length, 2);
  // 版本判定（v<=1）
  assert.equal(golden.versionCases.find((c) => c.v === 1).actual, true);
  assert.equal(golden.versionCases.find((c) => c.v === 2).actual, false);
  // 信封：成功 msg 非 literal、错误 code 不设枚举
  assert.equal(golden.envelopeSuccessOk, true);
  assert.equal(golden.envelopeErrorOk, true);
  const error = share.conversationShareErrorEnvelopeSchema.safeParse({
    code: 9999,
    msg: "future code",
  });
  assert.equal(error.success, true);
});
