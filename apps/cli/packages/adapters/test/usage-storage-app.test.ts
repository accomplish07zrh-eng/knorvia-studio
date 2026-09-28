// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { SessionId, TurnId } from "@knorvia/contracts";
import {
  day,
  modelInput,
  now,
  project,
  session,
  toolInput,
  turnInput,
  usageFixture,
} from "./usage-storage-fixture.js";

test("empty and reversed app windows return detached ordinary results with zero totals and null averages", async (t) => {
  const f = await usageFixture(t);
  const value = await f.store.queryAppUsage({ since: 1, until: 0, tzOffsetMs: 0 });
  assert.deepEqual(value, {
    totals: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelRequestCount: 0,
      modelErrorCount: 0,
      avgTimeToFirstTokenMs: null,
    },
    turnTotals: { totalSessions: 0, totalTurns: 0, avgTurnDurationMs: null, longestSessionMs: 0 },
    toolTotals: { toolCallCount: 0, toolErrorCount: 0 },
    models: [],
    tools: [],
    days: [],
    dayModels: [],
  });
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.getPrototypeOf(value.totals), Object.prototype);
  assert.deepEqual(Object.keys(value), [
    "totals",
    "turnTotals",
    "toolTotals",
    "models",
    "tools",
    "days",
    "dayModels",
  ]);
  assert.deepEqual(Object.keys(value.turnTotals), [
    "totalSessions",
    "totalTurns",
    "avgTurnDurationMs",
    "longestSessionMs",
  ]);
  value.totals.totalTokens = 7;
  assert.equal(
    (await f.store.queryAppUsage({ since: 0, until: now, tzOffsetMs: 0 })).totals.totalTokens,
    0,
  );
});

test("app aggregates preserve inclusive bounds, model grouping, averages and union of sparse days", async (t) => {
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
  await f.store.recordModelUsage(
    modelInput({
      id: "m1",
      modelId: "A",
      inputTokens: 10,
      outputTokens: 2,
      reasoningTokens: 1,
      cacheCreationInputTokens: 3,
      cacheReadInputTokens: 4,
      providerTotalTokens: 999,
      timeToFirstTokenMs: 0,
    }),
  );
  await f.store.recordModelUsage(
    modelInput({
      id: "m2",
      providerId: "other",
      modelId: "A",
      startedAt: now + day,
      inputTokens: 20,
      outputTokens: 3,
      reasoningTokens: 2,
      timeToFirstTokenMs: 10,
      status: "error",
    }),
  );
  await f.store.recordModelUsage(
    modelInput({
      id: "m3",
      sessionID: other,
      modelId: "B",
      startedAt: now + 3 * day,
      inputTokens: 5,
      outputTokens: 1,
      status: "cancelled",
    }),
  );
  await f.store.recordModelUsage(
    modelInput({ id: "outside", startedAt: now + 4 * day, inputTokens: 99 }),
  );
  for (const [id, owner, offset, duration, status] of [
    ["t1", session, 0, 10, "completed"],
    ["t2", session, 1, 20, "completed"],
    ["t3", other, 1, 25, "completed"],
    ["t4", other, 2, 999, "error"],
  ] as const)
    await f.store.upsertTurnUsage(
      turnInput({
        turnID: id as TurnId,
        sessionID: owner,
        startedAt: now + offset * day,
        durationMs: duration,
        status,
      }),
    );
  await f.store.upsertToolUsage(toolInput({ id: "tool1", toolCallID: "call1", durationMs: 10 }));
  await f.store.upsertToolUsage(
    toolInput({
      id: "tool2",
      toolCallID: "call2",
      startedAt: now + 2 * day,
      durationMs: 30,
      status: "error",
    }),
  );
  await f.store.upsertToolUsage(
    toolInput({
      id: "tool3",
      toolCallID: "call3",
      startedAt: now + 3 * day,
      toolName: "Write",
      status: "running",
    }),
  );
  const value = await f.store.queryAppUsage({ since: now, until: now + 3 * day, tzOffsetMs: 0 });
  assert.deepEqual(value.totals, {
    totalTokens: 41,
    inputTokens: 35,
    outputTokens: 6,
    reasoningTokens: 3,
    cacheCreationTokens: 3,
    cacheReadTokens: 4,
    modelRequestCount: 3,
    modelErrorCount: 1,
    avgTimeToFirstTokenMs: 5,
  });
  assert.deepEqual(value.turnTotals, {
    totalSessions: 2,
    totalTurns: 4,
    avgTurnDurationMs: 55 / 3,
    longestSessionMs: 30,
  });
  assert.deepEqual(value.toolTotals, { toolCallCount: 3, toolErrorCount: 1 });
  assert.deepEqual(value.models, [
    { modelId: "A", totalTokens: 35, inputTokens: 30, outputTokens: 5, requestCount: 2 },
    { modelId: "B", totalTokens: 6, inputTokens: 5, outputTokens: 1, requestCount: 1 },
  ]);
  assert.deepEqual(value.tools, [
    { toolName: "Read", callCount: 2, errorCount: 1, avgDurationMs: 20 },
    { toolName: "Write", callCount: 1, errorCount: 0, avgDurationMs: null },
  ]);
  assert.deepEqual(value.days, [
    { dayIndex: 60, totalTokens: 12, turnCount: 1, toolCallCount: 1 },
    { dayIndex: 61, totalTokens: 23, turnCount: 2, toolCallCount: 0 },
    { dayIndex: 62, totalTokens: 0, turnCount: 1, toolCallCount: 1 },
    { dayIndex: 63, totalTokens: 6, turnCount: 0, toolCallCount: 1 },
  ]);
  assert.deepEqual(value.dayModels, [
    { dayIndex: 60, modelId: "A", totalTokens: 12 },
    { dayIndex: 61, modelId: "A", totalTokens: 23 },
    { dayIndex: 63, modelId: "B", totalTokens: 6 },
  ]);
  for (const values of [value.models, value.tools, value.days, value.dayModels])
    for (const row of values) assert.equal(Object.getPrototypeOf(row), Object.prototype);
  assert.equal(
    (await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: day })).days[0].dayIndex,
    61,
  );
});

test("app native date buckets truncate negative effective timestamps toward zero and never prune", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput({ inputTokens: 2 }));
  f.db.exec("UPDATE model_usage SET started_at=-1");
  const before = f.snapshot();
  t.mock.method(Date, "now", () => {
    throw new Error("Queries do not read retention time");
  });
  t.mock.method(f.db, "exec", () => {
    throw new Error("Queries do not control transactions");
  });
  const value = await f.store.queryAppUsage({ since: -1, until: -1, tzOffsetMs: 0 });
  assert.deepEqual(value.days, [{ dayIndex: 0, totalTokens: 2, turnCount: 0, toolCallCount: 0 }]);
  const shifted = await f.store.queryAppUsage({ since: -1, until: -1, tzOffsetMs: -day });
  assert.equal(shifted.days[0].dayIndex, -1);
  assert.deepEqual(f.snapshot(), before);
});

test("model-by-day grouping keeps distinct models within one date bucket", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput({ id: "a1", modelId: "A", computedTotalTokens: 12 }));
  await f.store.recordModelUsage(
    modelInput({
      id: "a2",
      modelId: "A",
      providerId: "different-provider",
      computedTotalTokens: 4,
    }),
  );
  await f.store.recordModelUsage(modelInput({ id: "b", modelId: "B", computedTotalTokens: 1200 }));
  const value = await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: 0 });
  assert.deepEqual(value.dayModels, [
    { dayIndex: 60, modelId: "A", totalTokens: 16 },
    { dayIndex: 60, modelId: "B", totalTokens: 1200 },
  ]);
  assert.deepEqual(value.days, [
    { dayIndex: 60, totalTokens: 1216, turnCount: 0, toolCallCount: 0 },
  ]);
});

test("app queries see caller-owned changes and retain the existing transaction", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput({ inputTokens: 1 }));
  f.db.exec("BEGIN IMMEDIATE; UPDATE model_usage SET computed_total_tokens=9");
  assert.equal(
    (await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: 0 })).totals.totalTokens,
    9,
  );
  assert.equal(f.db.isTransaction, true);
  f.db.exec("ROLLBACK");
  assert.equal(
    (await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: 0 })).totals.totalTokens,
    1,
  );
});

test("longest session treats its all-null duration sum as zero before comparing sessions", async (t) => {
  const f = await usageFixture(t);
  const other = "missing-duration-session" as SessionId;
  await f.store.createSession({
    id: other,
    projectID: project,
    slug: "missing-duration",
    directory: "/fixture/missing-duration",
    title: "Missing duration",
    version: "test",
  });
  await f.store.upsertTurnUsage(turnInput({ durationMs: -5 }));
  const query = { since: now, until: now, tzOffsetMs: 0 };
  assert.equal((await f.store.queryAppUsage(query)).turnTotals.longestSessionMs, -5);
  await f.store.upsertTurnUsage(turnInput({ sessionID: other }));
  assert.deepEqual((await f.store.queryAppUsage(query)).turnTotals, {
    totalSessions: 2,
    totalTurns: 2,
    avgTurnDurationMs: -5,
    longestSessionMs: 0,
  });
});

test("model totals apply native null-to-zero projection before descending group ordering", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(
    modelInput({ id: "positive", modelId: "A", computedTotalTokens: Infinity }),
  );
  await f.store.recordModelUsage(
    modelInput({ id: "negative", modelId: "A", computedTotalTokens: -Infinity }),
  );
  await f.store.recordModelUsage(
    modelInput({ id: "finite", modelId: "B", computedTotalTokens: -1 }),
  );
  assert.equal(
    f.db
      .prepare("SELECT SUM(computed_total_tokens) AS total FROM model_usage WHERE model_id='A'")
      .get()?.total,
    null,
  );
  assert.deepEqual(
    (await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: 0 })).models,
    [
      { modelId: "A", totalTokens: 0, inputTokens: 0, outputTokens: 0, requestCount: 2 },
      { modelId: "B", totalTokens: -1, inputTokens: 0, outputTokens: 0, requestCount: 1 },
    ],
  );
});

test("NaN offset preserves the native days key and the separately numeric dayModels projection", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput({ computedTotalTokens: 2 }));
  await f.store.upsertTurnUsage(turnInput());
  await f.store.upsertToolUsage(toolInput());
  const value = await f.store.queryAppUsage({ since: now, until: now, tzOffsetMs: NaN });
  assert.deepEqual(value.days, [
    { dayIndex: null, totalTokens: 2, turnCount: 1, toolCallCount: 1 },
  ]);
  assert.deepEqual(value.dayModels, [{ dayIndex: 0, modelId: "fixture-model", totalTokens: 2 }]);
});
