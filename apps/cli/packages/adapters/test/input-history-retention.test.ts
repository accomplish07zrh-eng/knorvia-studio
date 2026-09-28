// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { historyFixture, otherProject, project } from "./input-history-fixture.js";

test("retention is a global hundred across projects and kinds", async (t) => {
  const f = historyFixture(t);
  for (let index = 1; index <= 100; index++) {
    f.seed(`seed-${index}`, {
      projectID: index % 2 ? otherProject : project,
      kind: index % 3 ? "prompt" : "slash_command",
      created: index,
    });
  }
  const result = await f.record({ text: "new", time: { created: 101 } });
  const rows = f.rows();
  assert.equal(rows.length, 100);
  assert.equal(rows[0].id, result?.id);
  assert.equal(rows.at(-1)?.id, "seed-2");
  assert.equal(rows.filter((row) => row.project_id === otherProject).length, 49);
  assert.equal(rows.filter((row) => row.project_id === project).length, 51);
});

test("equal-time retention uses database ID order, not insertion order", async (t) => {
  const f = historyFixture(t);
  for (let index = 100; index >= 1; index--) f.seed(`seed-${String(index).padStart(3, "0")}`);
  const saved = await f.record({ text: "new", time: { created: 20 } });
  assert.ok(saved);
  const rows = f.rows();
  assert.equal(rows.length, 100);
  assert.equal(rows[0].id, "seed-100");
  assert.equal(rows.at(-1)?.id, "seed-001");
  assert.equal(
    rows.some((row) => row.id === saved.id),
    false,
  );
});

test("a successful old-dated insertion can be pruned immediately but still returns its entry", async (t) => {
  const f = historyFixture(t);
  for (let index = 1; index <= 100; index++) f.seed(`seed-${index}`, { created: index });
  const before = f.rows();
  const result = await f.record({ text: "too old", time: { created: 0 } });
  assert.ok(result);
  assert.equal(result.text, "too old");
  assert.equal(result.time.created, 0);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.db.isTransaction, false);
});

test("empty, duplicate and recall do not repair artificially overfull history", async (t) => {
  const f = historyFixture(t);
  for (let index = 1; index <= 101; index++) f.seed(`seed-${index}`, { created: index });
  const before = f.rows();
  assert.equal(await f.record({ text: " " }), null);
  assert.equal(await f.record({ text: "Seed" }), null);
  assert.equal((await f.recall())?.id, "seed-101");
  assert.deepEqual(f.rows(), before);
});
