// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组剩余（A10 persistedTokenUsageBaseline）。
// 入口用文件级入口 `src/agent/message-history-usage.ts`：该导出**不经区域桶**（见 behavior.md A10），与 A8 同口径。
//
// 实测 quirk：`tokens.cache` **必须存在**——实现无条件读 `tokens.cache.read`/`.write`，
// 缺 `cache` 会抛 `TypeError: Cannot read properties of undefined (reading 'read')`（类型层要求必填，运行时不做兜底）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const usage = await loadFile("agent/message-history-usage");
const baseline = (tokens) => usage.persistedTokenUsageBaseline(tokens);

test("A10 persistedTokenUsageBaseline：输入推导与上下文用量的冻结规则", () => {
  assert.equal(baseline(undefined), undefined);

  assert.deepEqual(baseline({ input: 100, output: 50, total: 150, cache: { read: 10, write: 5 } }), {
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    contextUsageTokens: 150,
    inputTokens: 100,
    outputTokens: 50,
  });

  assert.deepEqual(
    baseline({ total: 200, output: 50, cache: {} }),
    {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      contextUsageTokens: 200,
      inputTokens: 150,
      outputTokens: 50,
    },
    "没有 input 时用 total - output 推导输入",
  );

  assert.deepEqual(
    baseline({ cache: { read: 30, write: 20 } }),
    {
      cacheReadTokens: 30,
      cacheWriteTokens: 20,
      contextUsageTokens: undefined,
      inputTokens: 50,
      outputTokens: 0,
    },
    "只有缓存用量时输入取 cache.read + cache.write；output 为 0 且无 total → 上下文用量未定义",
  );

  assert.deepEqual(
    baseline({ input: 10, output: 0, total: 10, cache: {} }),
    {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      contextUsageTokens: 10,
      inputTokens: 10,
      outputTokens: 0,
    },
    "output 为 0 时用 total（且 total ≥ input）作为上下文用量",
  );

  assert.equal(baseline({ input: 0, cache: {} }), undefined, "输入既非正数又无 total/cache → 整体未定义");
  assert.deepEqual(
    baseline({ input: 10, output: 0, cache: {} }).contextUsageTokens,
    undefined,
    "output 为 0 且无 total → 上下文用量未定义",
  );

  assert.deepEqual(
    baseline({ input: 12.9, output: 3.2, cache: { read: 1.5, write: 2.5 } }),
    {
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      contextUsageTokens: 15,
      inputTokens: 12,
      outputTokens: 3,
    },
    "所有数值向下取整（cache 允许 0，input/output 必须为正）",
  );

  assert.deepEqual(
    baseline({ input: -5, cache: { read: 7.9, write: -1 } }),
    {
      cacheReadTokens: 7,
      cacheWriteTokens: 0,
      contextUsageTokens: undefined,
      inputTokens: 7,
      outputTokens: 0,
    },
    "负数视为未给：write 归 0、read 取整保留",
  );

  const shape = baseline({ input: 5, output: 5, cache: {} });
  assert.deepEqual(Object.keys(shape).sort(), [
    "cacheReadTokens",
    "cacheWriteTokens",
    "contextUsageTokens",
    "inputTokens",
    "outputTokens",
  ]);

  assert.throws(
    () => baseline({ input: 1, output: 1 }),
    TypeError,
    "缺 cache 会抛 TypeError：tokens.cache 是必填（运行时不做兜底）",
  );
});
