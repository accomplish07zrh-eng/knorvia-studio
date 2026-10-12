// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组最后三文件之三（A13 session-history-hydrator）。
// 入口用区域桶 `src/agent/index.ts`（两个导出都经桶公开）。
//
// 实测语义（acceptance.md §19，已实测写死，无需再读源码）：
// - `activeSessionMessages(messages)`：无压缩边界 → 按原序返回全部消息且引用同一批对象；
//   有 compaction 边界 → 从**最后一个边界（含）**起。
// - `hydrateMessageHistoryFromSession(session, history)`：第一参是**会话对象**（内部读 `session.messages`），
//   异步，返回 `{appliedMessageCount, interruptedToolCount, messageCount, partCount}`；
//   没有 parts 的消息不追加条目（`appliedMessageCount` 为 0）且重复水合幂等。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const agent = await loadFile("agent/index");
const { activeSessionMessages, createMessageHistory, hydrateMessageHistoryFromSession } = agent;

const message = (id, role, parts = []) => ({ info: { id, role }, parts });

test("A13 activeSessionMessages：无边界原序同引用、有边界从最后一个边界起", () => {
  assert.deepEqual(activeSessionMessages([]), []);

  const messages = [message("m1", "user"), message("m2", "assistant"), message("m3", "user")];
  const active = activeSessionMessages(messages);
  assert.deepEqual(
    active.map((item) => item.info.id),
    ["m1", "m2", "m3"],
    "没有压缩边界时按原序返回全部消息",
  );
  assert.equal(active.length, messages.length);
  assert.equal(active[0], messages[0], "返回同一批消息引用");

  const withBoundary = [
    message("m1", "user"),
    {
      info: { id: "b", role: "assistant" },
      parts: [{ type: "compaction", compactBoundary: { boundaryId: "b" } }],
    },
    message("m3", "user"),
  ];
  assert.deepEqual(
    activeSessionMessages(withBoundary).map((item) => item.info.id),
    ["b", "m3"],
    "有边界时从最后一个边界（含）起",
  );
});

test("A13 hydrateMessageHistoryFromSession：异步计数结果与幂等", async () => {
  const history = createMessageHistory();
  history.init([{ role: "user", content: "seed" }]);
  const messages = [message("m1", "user"), message("m2", "assistant")];

  const first = await hydrateMessageHistoryFromSession({ messages }, history);
  assert.deepEqual(
    first,
    { appliedMessageCount: 0, interruptedToolCount: 0, messageCount: 2, partCount: 0 },
    "没有 parts 的消息不追加条目",
  );
  assert.equal(history.getMessageCount(), 1, "历史条目保持原样");
  assert.deepEqual(history.toRuntimeEntries(), [
    { message: { role: "user", content: "seed" }, metadata: undefined },
  ]);

  const second = await hydrateMessageHistoryFromSession({ messages }, history);
  assert.deepEqual(second, first, "重复水合返回同样的计数（幂等）");
  assert.equal(history.getMessageCount(), 1);
});
