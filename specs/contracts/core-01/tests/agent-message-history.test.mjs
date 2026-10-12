// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组 3（A7 message-history 的追加/替换/缓存统计与只读借用）。
// 入口用本区公开桶 `src/agent/index.ts`（包根在 tsx 下不可加载，见 known-differences.md §2）。
//
// 实测备忘（见 acceptance.md §14）：
// 1) 每条 `toRuntimeEntries()` 条目都带 `metadata` 键（缺省值为 `undefined`，JSON 里看不到）；
// 2) `getCacheStats()` 的 `cacheReadTokens` **只在设置过之后才存在**（从未设置时键缺席）——
//    因此统计断言一律「核心三字段 deepEqual + cacheReadTokens 值断言」，不假定键的存在性；
// 3) `setCacheHit`/`setCacheMiss`/`recomputeCacheStats` 都**没有返回值**，统计要另调 `getCacheStats()`；
// 4) `borrowReadOnlyRuntimeEntries()` 是**借用视图**（与历史共享同一数组），push 会真的改到历史。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const agent = await loadFile("agent/index");
const { createMessageHistory } = agent;

const coreStats = (stats) => ({
  totalMessages: stats.totalMessages,
  cachedMessages: stats.cachedMessages,
  lastCacheHit: stats.lastCacheHit,
});

test("A7 message-history：初始化、追加、替换与只读借用", () => {
  const history = createMessageHistory();
  assert.equal(history.getMessageCount(), 0);
  assert.deepEqual(history.toRuntimeEntries(), []);
  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 0,
    cachedMessages: 0,
    lastCacheHit: false,
  });
  assert.equal(history.getCacheStats().cacheReadTokens, undefined);

  history.init([{ role: "user", content: "seed" }]);
  assert.equal(history.getMessageCount(), 1);
  assert.deepEqual(history.toRuntimeEntries(), [
    { message: { role: "user", content: "seed" }, metadata: undefined },
  ]);

  history.addUser("hello");
  assert.deepEqual(history.toRuntimeEntries().at(-1), {
    message: { role: "user", content: "hello" },
    metadata: undefined,
  });

  history.addUser("with meta", { source: "real_user" });
  assert.deepEqual(history.toRuntimeEntries().at(-1), {
    message: { role: "user", content: "with meta" },
    metadata: { source: "real_user" },
  });

  history.addAssistant("answer");
  assert.deepEqual(history.toRuntimeEntries().at(-1), {
    message: { role: "assistant", content: "answer" },
    metadata: undefined,
  });
  assert.equal(history.getMessageCount(), 4);

  const borrowed = history.borrowReadOnlyRuntimeEntries();
  assert.equal(borrowed.length, history.getMessageCount(), "只读借用返回全部条目");
  borrowed.push({ message: { role: "user", content: "injected" }, metadata: undefined });
  assert.equal(history.getMessageCount(), 5, "借用视图与历史共享同一数组（只读是约定，不是冻结）");

  history.replaceMessages([{ role: "user", content: "replaced" }]);
  assert.equal(history.getMessageCount(), 1);
  assert.deepEqual(history.toRuntimeEntries(), [
    { message: { role: "user", content: "replaced" }, metadata: undefined },
  ]);
});

test("A7 message-history：缓存统计与重置", () => {
  const history = createMessageHistory();
  history.init([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ]);

  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 2,
    cachedMessages: 0,
    lastCacheHit: false,
  });
  assert.equal(history.getCacheStats().cacheReadTokens, undefined);

  assert.equal(history.setCacheHit(3), undefined, "setCacheHit 不返回值");
  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 2,
    cachedMessages: 2,
    lastCacheHit: true,
  });
  assert.equal(history.getCacheStats().cacheReadTokens, 3);

  assert.equal(history.setCacheMiss(), undefined, "setCacheMiss 不返回值");
  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 2,
    cachedMessages: 0,
    lastCacheHit: false,
  });
  assert.equal(history.getCacheStats().cacheReadTokens, undefined);

  assert.equal(history.recomputeCacheStats(), undefined, "重算不返回值，只刷新统计");
  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 2,
    cachedMessages: 0,
    lastCacheHit: false,
  });

  history.reset();
  assert.equal(history.getMessageCount(), 0);
  assert.deepEqual(history.toRuntimeEntries(), []);
  assert.deepEqual(coreStats(history.getCacheStats()), {
    totalMessages: 0,
    cachedMessages: 0,
    lastCacheHit: false,
  });
});
