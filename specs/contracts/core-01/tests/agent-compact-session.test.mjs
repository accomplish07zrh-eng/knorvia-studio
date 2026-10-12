// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组 3（A8 compact-session 的会话裁剪与保留段插回）。
// 入口用文件级入口 `src/agent/compact-session.ts`：本区三个导出**不经区域桶**（区域桶 10 个导出里没有它们），
// 因此按 acceptance.md 的口径用文件级入口做黑盒断言（不触碰内部私有函数），并在行为条目里注明。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const compactSession = await loadFile("agent/compact-session");

const user = (id) => ({ info: { id, role: "user" }, parts: [{ type: "text" }] });
const boundaryMessage = (segment) => ({
  info: { id: "boundary", role: "assistant" },
  parts: [{ type: "compaction", compactBoundary: { preservedSegment: segment } }],
});

test("A8 compact-session：压缩边界的判定与保留条件", () => {
  const { isActiveCompactionBoundaryPart, isCompactPreservableSessionMessage } = compactSession;

  assert.equal(isActiveCompactionBoundaryPart({ type: "text" }), false);
  assert.equal(
    isActiveCompactionBoundaryPart({ type: "compaction", compactBoundary: { boundaryId: "b" } }),
    true,
    "有 compactBoundary 即为活动边界",
  );
  assert.equal(
    isActiveCompactionBoundaryPart({ type: "compaction", timelineStatus: "pending" }),
    false,
    "无 compactBoundary 但有 timelineStatus → 不是活动边界",
  );
  assert.equal(
    isActiveCompactionBoundaryPart({ type: "compaction" }),
    true,
    "无 compactBoundary 且无 timelineStatus → 视为活动边界",
  );

  assert.equal(isCompactPreservableSessionMessage(user("u1")), true);
  assert.equal(
    isCompactPreservableSessionMessage({ info: { id: "a1", role: "assistant" }, parts: [] }),
    true,
  );
  assert.equal(
    isCompactPreservableSessionMessage({
      info: { id: "a1", role: "assistant", error: { type: "x" } },
      parts: [],
    }),
    false,
    "带 error 的 assistant 不保留",
  );
  assert.equal(
    isCompactPreservableSessionMessage({
      info: { id: "u1", role: "user", semantics: { providerVisibility: "hidden" } },
      parts: [],
    }),
    false,
    "hidden 语义不保留",
  );
  assert.equal(
    isCompactPreservableSessionMessage({
      info: { id: "u1", role: "user" },
      parts: [{ type: "compaction" }],
    }),
    false,
    "含 compaction part 不保留",
  );
  assert.equal(
    isCompactPreservableSessionMessage({ info: { id: "s1", role: "system" }, parts: [] }),
    false,
    "只有 user/assistant 可保留",
  );
});

test("A8 compact-session：活动消息裁剪与保留段插回", () => {
  const { compactActiveSessionMessages } = compactSession;
  const messages = [
    user("u1"),
    user("u0"),
    boundaryMessage({ headMessageId: "u1", tailMessageId: "u0" }),
    user("u2"),
  ];

  const withoutPreserved = compactActiveSessionMessages(messages, 2, false);
  assert.deepEqual(
    withoutPreserved.map((message) => message.info.id),
    ["boundary", "u2"],
    "不保留时只做 slice(boundaryIndex)",
  );
  assert.equal(withoutPreserved[0], messages[2], "slice 返回同一批消息引用");

  const noSegment = compactActiveSessionMessages(
    [
      user("u1"),
      { info: { id: "boundary", role: "assistant" }, parts: [{ type: "compaction" }] },
      user("u2"),
    ],
    1,
    true,
  );
  assert.deepEqual(
    noSegment.map((message) => message.info.id),
    ["boundary", "u2"],
    "边界没有 preservedSegment 时不插回",
  );

  const anchorMissing = compactActiveSessionMessages(messages, 2, true);
  assert.deepEqual(
    anchorMissing.map((message) => message.info.id),
    ["boundary", "u1", "u0", "u2"],
    "锚点不在活动消息里时插到下标 1",
  );

  const anchorPresent = compactActiveSessionMessages(
    [
      user("u1"),
      user("u0"),
      boundaryMessage({ headMessageId: "u1", tailMessageId: "u0", anchorMessageId: "u2" }),
      user("u2"),
    ],
    2,
    true,
  );
  assert.deepEqual(
    anchorPresent.map((message) => message.info.id),
    ["boundary", "u2", "u1", "u0"],
    "锚点在活动消息里时插到锚点之后",
  );

  const outOfRange = compactActiveSessionMessages(
    [
      user("u1"),
      user("u0"),
      boundaryMessage({ headMessageId: "u0", tailMessageId: "missing" }),
      user("u2"),
    ],
    2,
    true,
  );
  assert.deepEqual(
    outOfRange.map((message) => message.info.id),
    ["boundary", "u2"],
    "head/tail 定位失败时不插回",
  );
});
