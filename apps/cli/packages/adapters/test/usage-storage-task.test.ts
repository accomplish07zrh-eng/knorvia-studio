// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelUsageRecord, SessionId } from "@knorvia/contracts";
import { modelInput, now, project, session, usageFixture } from "./usage-storage-fixture.js";

test("empty task usage echoes requested identity with ordinary independent baseline objects", async (t) => {
  const f = await usageFixture(t);
  const missing = "missing" as SessionId;
  const value = await f.store.queryTaskUsage({ sessionID: missing });
  assert.deepEqual(value, {
    sessionID: missing,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    modelRequestCount: 0,
    modelErrorCount: 0,
    inputBaselineBySource: {},
  });
  assert.equal(Object.getPrototypeOf(value.inputBaselineBySource), Object.prototype);
  assert.deepEqual(Object.keys(value), [
    "sessionID",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "cacheCreationTokens",
    "cacheReadTokens",
    "modelRequestCount",
    "modelErrorCount",
    "inputBaselineBySource",
  ]);
  value.inputBaselineBySource.main_turn = 4;
  assert.deepEqual(
    (await f.store.queryTaskUsage({ sessionID: missing })).inputBaselineBySource,
    {},
  );
});

test("shrinking main context lowers its baseline without refund and exclusive cache remains supported", async (t) => {
  const f = await usageFixture(t);
  const records: Partial<ModelUsageRecord>[] = [
    { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 20, providerTotalTokens: 110 },
    { inputTokens: 40, outputTokens: 5, providerTotalTokens: 45, status: "cancelled" },
    {
      inputTokens: 50,
      outputTokens: 5,
      providerTotalTokens: 55,
      reasoningTokens: 3,
      status: "error",
    },
    {
      querySource: "compact",
      inputTokens: 10,
      outputTokens: 2,
      cacheReadInputTokens: 4,
      providerTotalTokens: 16,
    },
  ];
  for (let index = 0; index < records.length; index++)
    await f.store.recordModelUsage(
      modelInput({ ...records[index], id: `m${index}`, startedAt: now + index }),
    );
  assert.deepEqual(await f.store.queryTaskUsage({ sessionID: session }), {
    sessionID: session,
    totalTokens: 146,
    inputTokens: 124,
    outputTokens: 22,
    reasoningTokens: 3,
    cacheCreationTokens: 0,
    cacheReadTokens: 4,
    modelRequestCount: 4,
    modelErrorCount: 1,
    inputBaselineBySource: { main_turn: 50 },
  });
});

test("three source baselines are independent, span models, and exclude arbitrary source keys", async (t) => {
  const f = await usageFixture(t);
  const sources = ["main_turn", "subagent", "workflow_child", "main_turn", "compact", "__proto__"];
  for (let index = 0; index < sources.length; index++)
    await f.store.recordModelUsage(
      modelInput({
        id: `m${index}`,
        querySource: sources[index],
        modelId: `model${index}`,
        startedAt: now + index,
        inputTokens: 10,
        outputTokens: 1,
        cacheCreationInputTokens: 2,
        cacheReadInputTokens: 3,
      }),
    );
  const value = await f.store.queryTaskUsage({ sessionID: session });
  assert.equal(value.totalTokens, 56);
  assert.equal(value.inputTokens, 50);
  assert.equal(value.outputTokens, 6);
  assert.equal(value.cacheCreationTokens, 4);
  assert.equal(value.cacheReadTokens, 6);
  assert.deepEqual(value.inputBaselineBySource, {
    main_turn: 10,
    subagent: 10,
    workflow_child: 10,
  });
  assert.equal(Object.hasOwn(value.inputBaselineBySource, "__proto__"), false);
});

test("task ordering uses time then ID and every request counts without logical-request dedup", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput({ id: "b", inputTokens: 5, status: "running" }));
  await f.store.recordModelUsage(modelInput({ id: "a", inputTokens: 10, status: "error" }));
  await f.store.recordModelUsage(modelInput({ id: "c", inputTokens: 8, startedAt: now + 1 }));
  const value = await f.store.queryTaskUsage({ sessionID: session });
  assert.equal(value.inputTokens, 13);
  assert.equal(value.totalTokens, 13);
  assert.equal(value.modelRequestCount, 3);
  assert.equal(value.modelErrorCount, 1);
  assert.deepEqual(value.inputBaselineBySource, { main_turn: 8 });
});

test("task totals and context baselines exclude every other session", async (t) => {
  const f = await usageFixture(t);
  const other = "usage-other" as SessionId;
  await f.store.createSession({
    id: other,
    projectID: project,
    slug: "other",
    directory: "/fixture/other",
    title: "Other",
    version: "test",
  });
  await f.store.recordModelUsage(modelInput({ id: "first", inputTokens: 10, outputTokens: 2 }));
  await f.store.recordModelUsage(
    modelInput({ id: "second", startedAt: now + 1, inputTokens: 12, outputTokens: 2 }),
  );
  await f.store.recordModelUsage(
    modelInput({
      id: "foreign",
      sessionID: other,
      querySource: "compact",
      startedAt: now + 2,
      inputTokens: 1000,
      outputTokens: 200,
    }),
  );
  const value = await f.store.queryTaskUsage({ sessionID: session });
  assert.equal(value.totalTokens, 16);
  assert.equal(value.inputTokens, 12);
  assert.equal(value.modelRequestCount, 2);
  assert.deepEqual(value.inputBaselineBySource, { main_turn: 12 });
  assert.equal((await f.store.queryTaskUsage({ sessionID: other })).totalTokens, 1200);
});

test("task cache inference keeps ties as total input and prefers a provider total over computed", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(
    modelInput({
      id: "tie",
      querySource: "compact",
      inputTokens: 10,
      outputTokens: 2,
      cacheReadInputTokens: 4,
      computedTotalTokens: 999,
      providerTotalTokens: 14,
    }),
  );
  await f.store.recordModelUsage(
    modelInput({
      id: "cache",
      querySource: "unknown",
      inputTokens: 0,
      outputTokens: 1,
      cacheCreationInputTokens: 3,
      cacheReadInputTokens: 4,
      providerTotalTokens: 8,
    }),
  );
  await f.store.recordModelUsage(
    modelInput({
      id: "zero",
      querySource: "unknown",
      inputTokens: 5,
      outputTokens: 2,
      cacheReadInputTokens: 4,
      providerTotalTokens: 0,
    }),
  );
  const value = await f.store.queryTaskUsage({ sessionID: session });
  assert.equal(value.totalTokens, 27);
  assert.equal(value.inputTokens, 22);
  assert.equal(value.outputTokens, 5);
  assert.equal(value.cacheCreationTokens, 3);
  assert.equal(value.cacheReadTokens, 12);
  assert.deepEqual(value.inputBaselineBySource, {});
  const before = f.snapshot();
  f.db.exec("UPDATE model_usage SET started_at=0");
  t.mock.method(Date, "now", () => {
    throw new Error("Task reads do not prune");
  });
  assert.equal((await f.store.queryTaskUsage({ sessionID: session })).modelRequestCount, 3);
  assert.equal(f.rows("model_usage").length, before.model_usage.length);
});
