// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { toolInput, turnInput, usageFixture } from "./usage-storage-fixture.js";

test("turn positive counters retain distinct field mapping on insert and replacement", async (t) => {
  const f = await usageFixture(t);
  const counters = {
    modelRequestCount: 1,
    modelRetryCount: 2,
    toolCallCount: 3,
    toolErrorCount: 4,
    inputTokens: 5,
    outputTokens: 6,
    reasoningTokens: 7,
    cacheCreationInputTokens: 8,
    cacheReadInputTokens: 9,
    computedTotalTokens: 10,
  };
  const columns = [
    "model_request_count",
    "model_retry_count",
    "tool_call_count",
    "tool_error_count",
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "computed_total_tokens",
  ];
  for (const increment of [0, 10]) {
    const values = Object.fromEntries(
      Object.entries(counters).map(([name, count]) => [name, count + increment]),
    );
    await f.store.upsertTurnUsage(turnInput(values));
    const row = f.rows("turn_usage")[0];
    assert.deepEqual(
      columns.map((column) => row[column]),
      columns.map((_, index) => index + 1 + increment),
    );
  }
});

test("tool nullable flags distinguish missing from explicit false and runtime null", async (t) => {
  const f = await usageFixture(t);
  await f.store.upsertToolUsage(toolInput());
  assert.equal(f.rows("tool_usage")[0].read_only, null);
  assert.equal(f.rows("tool_usage")[0].destructive, null);
  await f.store.upsertToolUsage(toolInput({ readOnly: true, destructive: true }));
  await f.store.upsertToolUsage(toolInput());
  assert.equal(f.rows("tool_usage")[0].read_only, 1);
  assert.equal(f.rows("tool_usage")[0].destructive, 1);
  await f.store.upsertToolUsage(
    toolInput({ readOnly: false, destructive: null as unknown as boolean }),
  );
  assert.equal(f.rows("tool_usage")[0].read_only, 0);
  assert.equal(f.rows("tool_usage")[0].destructive, 0);
});
