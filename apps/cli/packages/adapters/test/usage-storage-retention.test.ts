// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  day,
  modelInput,
  now,
  session,
  tables,
  toolInput,
  turnInput,
  usageFixture,
} from "./usage-storage-fixture.js";

test("default retention is a strict thirty-day global cutoff across all three usage tables", async (t) => {
  const f = await usageFixture(t);
  f.seedExpired();
  const cutoff = now - 30 * day;
  for (const table of tables) f.db.prepare(`UPDATE ${table} SET started_at=?`).run(cutoff);
  const boundary = f.snapshot();
  await f.store.pruneUsage();
  assert.deepEqual(f.snapshot(), boundary);
  f.db.prepare("UPDATE model_usage SET started_at=?,status='running'").run(cutoff - 1);
  f.db.prepare("UPDATE turn_usage SET started_at=?").run(cutoff - 1);
  f.db.prepare("UPDATE tool_usage SET started_at=?").run(cutoff - 1);
  await f.store.pruneUsage();
  for (const table of tables) assert.equal(f.rows(table).length, 0, table);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM session").get()?.n, 1);
});

test("explicit zero cutoff does not read clock and preserves equal or later rows", async (t) => {
  const f = await usageFixture(t);
  f.seedExpired();
  f.db.exec("UPDATE model_usage SET started_at=-1; UPDATE tool_usage SET started_at=1");
  t.mock.method(Date, "now", () => {
    throw new Error("Explicit zero is a real cutoff");
  });
  await f.store.pruneUsage({ beforeTime: 0 });
  assert.equal(f.rows("model_usage").length, 0);
  assert.equal(f.rows("turn_usage").length, 1);
  assert.equal(f.rows("tool_usage").length, 1);
});

test("each writer prunes globally and can successfully remove its just-written old fact", async (t) => {
  const f = await usageFixture(t);
  for (const write of [
    () => f.store.recordModelUsage(modelInput({ startedAt: 0 })),
    () => f.store.upsertTurnUsage(turnInput({ startedAt: 0 })),
    () => f.store.upsertToolUsage(toolInput({ startedAt: 0 })),
  ]) {
    f.seedExpired();
    assert.equal(await write(), undefined);
    for (const table of tables) assert.equal(f.rows(table).length, 0, table);
    assert.equal(f.db.isTransaction, false);
  }
});

test("direct prune calculates time before BEGIN and cannot clean up another transaction", async (t) => {
  const f = await usageFixture(t);
  f.seedExpired();
  const before = f.snapshot();
  f.db.exec("BEGIN IMMEDIATE");
  const failure = new Error("fixture cutoff failure");
  t.mock.method(Date, "now", () => {
    throw failure;
  });
  t.mock.method(f.db, "exec", () => {
    throw new Error("No transaction control before valid cutoff");
  });
  await assert.rejects(f.store.pruneUsage(), (error) => error === failure);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, true);
});

test("existing session-delete cascades remove model, turn and tool facts", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(modelInput());
  await f.store.upsertTurnUsage(turnInput());
  await f.store.upsertToolUsage(toolInput());
  for (const table of tables) assert.equal(f.rows(table).length, 1, table);
  f.db.prepare("DELETE FROM session WHERE id=?").run(session);
  for (const table of tables) assert.equal(f.rows(table).length, 0, table);
});
