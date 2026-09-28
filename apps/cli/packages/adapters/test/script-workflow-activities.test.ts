// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Compatibility cases: each is expected to pass the frozen old implementation.
import assert from "node:assert/strict";
import test from "node:test";
import { activity, child, workflowFixture } from "./script-workflow-extra-fixture.js";

test("activity allocation uses native numeric arithmetic for legacy text in the affinity column", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity("legacy"));
  db.exec("UPDATE workflow_activity SET attempt='not-numeric' WHERE id='legacy'");
  const created = await store.createScriptWorkflowActivity(activity("next"));
  assert.equal(created.attempt, 1);
  assert.equal(
    db.prepare("SELECT typeof(attempt) AS kind FROM workflow_activity WHERE id='next'").get()?.kind,
    "integer",
  );
});

test("activity creation keeps defaults, optional values and JSON without touching sessions", async (t) => {
  const { store, rows, clock } = await workflowFixture(t);
  const sessions = rows("session");
  const created = await store.createScriptWorkflowActivity(
    activity("a", {
      callIndex: -2,
      parentActivityId: "unresolved-parent",
      phase: "",
      label: "",
      prompt: "",
      opts: { tools: ["tool-b", "tool-a"], schema: { z: 1, nested: { kept: true } } },
    }),
  );
  assert.deepEqual(created, {
    attempt: 1,
    callIndex: -2,
    callPath: "root/agent",
    childSessionId: undefined,
    completedAt: undefined,
    createdAt: 100,
    error: undefined,
    id: "a",
    inputHash: "input-hash",
    label: "",
    opts: { tools: ["tool-b", "tool-a"], schema: { z: 1, nested: { kept: true } } },
    parentActivityId: "unresolved-parent",
    phase: "",
    prompt: "",
    result: undefined,
    runId: "run",
    startedAt: undefined,
    status: "queued",
    type: "agent",
    updatedAt: 100,
  });
  assert.equal(Object.getPrototypeOf(created), Object.prototype);
  assert.equal(clock.reads, 1);
  assert.equal(
    rows("workflow_activity")[0]?.opts_json,
    '{"tools":["tool-b","tool-a"],"schema":{"z":1,"nested":{"kept":true}}}',
  );
  assert.deepEqual(rows("session"), sessions);
});

test("attempts count all statuses and hashes but are isolated by run and call path", async (t) => {
  const { store } = await workflowFixture(t);
  const inputs = [
    activity("a", { status: "failed" }),
    activity("b", { status: "cancelled", inputHash: "different" }),
    activity("c", { status: "cached" }),
    activity("d", { runId: "other-run" }),
    activity("e", { callPath: "root/other" }),
  ];
  const attempts = [];
  for (const input of inputs)
    attempts.push((await store.createScriptWorkflowActivity(input)).attempt);
  assert.deepEqual(attempts, [1, 2, 3, 1, 1]);
  await assert.rejects(
    store.createScriptWorkflowActivity(activity("a")),
    /UNIQUE constraint failed/,
  );
  assert.equal((await store.createScriptWorkflowActivity(activity("f"))).attempt, 4);
});

test("activity patch preserves undefined, explicitly clears nullable fields and replaces JSON", async (t) => {
  const { store, rows, clock } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(
    activity("a", { label: "fixed", opts: { model: "fixture" } }),
  );
  await store.updateScriptWorkflowActivity({
    id: "a",
    childSessionId: child,
    startedAt: 0,
    completedAt: 12,
    result: { first: 1, keep: true },
    error: { cause: "initial" },
    status: "completed",
  });
  clock.value = 150;
  clock.reads = 0;
  const kept = await store.updateScriptWorkflowActivity({
    id: "a",
    status: "running",
    result: undefined,
  });
  assert.equal(kept.childSessionId, child);
  assert.equal(kept.startedAt, 0);
  assert.equal(kept.completedAt, 12);
  assert.deepEqual(kept.result, { first: 1, keep: true });
  assert.deepEqual(kept.error, { cause: "initial" });
  assert.equal(kept.createdAt, 100);
  assert.equal(kept.updatedAt, 150);
  assert.equal(clock.reads, 1);
  const cleared = await store.updateScriptWorkflowActivity({
    id: "a",
    childSessionId: null,
    startedAt: null,
    completedAt: null,
    result: { replacement: 2 },
    error: null,
  });
  assert.equal(cleared.childSessionId, undefined);
  assert.equal(cleared.startedAt, undefined);
  assert.equal(cleared.completedAt, undefined);
  assert.equal(cleared.error, undefined);
  assert.deepEqual(cleared.result, { replacement: 2 });
  const raw = rows("workflow_activity")[0];
  assert.equal(raw?.result_json, '{"replacement":2}');
  assert.equal(raw?.error_json, null);
  assert.equal(raw?.label, "fixed");
  assert.equal(raw?.opts_json, '{"model":"fixture"}');
});

test("id-only updates re-encode mutable JSON but preserve creation options bytes", async (t) => {
  const { store, db, rows } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  db.prepare(
    "UPDATE workflow_activity SET result_json=?, error_json=?, opts_json=? WHERE id=?",
  ).run(' { "b" : 2, "a": 1 } ', "null", ' { "model" : "fixture" } ', "activity");
  const result = await store.updateScriptWorkflowActivity({ id: "activity" });
  assert.deepEqual(result.result, { b: 2, a: 1 });
  assert.equal(result.error, undefined);
  assert.deepEqual(Object.keys(result.result as object), ["b", "a"]);
  assert.equal(rows("workflow_activity")[0]?.result_json, '{"b":2,"a":1}');
  assert.equal(rows("workflow_activity")[0]?.error_json, null);
  assert.equal(rows("workflow_activity")[0]?.opts_json, ' { "model" : "fixture" } ');
});

test("missing or malformed current activity rejects before reading the update clock", async (t) => {
  const { store, db, clock, rows } = await workflowFixture(t);
  await assert.rejects(store.updateScriptWorkflowActivity({ id: "missing" }), {
    message: "Workflow activity not found: missing",
  });
  assert.equal(clock.reads, 0);
  await store.createScriptWorkflowActivity(activity());
  db.exec("UPDATE workflow_activity SET opts_json='{' WHERE id='activity'");
  const before = rows("workflow_activity");
  clock.reads = 0;
  await assert.rejects(
    store.updateScriptWorkflowActivity({ id: "activity", result: "new" }),
    SyntaxError,
  );
  assert.equal(clock.reads, 0);
  assert.deepEqual(rows("workflow_activity"), before);
});

test("cache chooses the newest eligible attempt, not latest creation time or latest failure", async (t) => {
  const { store, db } = await workflowFixture(t);
  for (const [id, status] of [
    ["first", "completed"],
    ["second", "cached"],
    ["third", "failed"],
  ] as const) {
    await store.createScriptWorkflowActivity(activity(id, { status }));
    await store.updateScriptWorkflowActivity({ id, result: id });
  }
  db.exec("UPDATE workflow_activity SET time_created=999 WHERE id='first'");
  const input = { runId: "run", callPath: "root/agent", inputHash: "input-hash" };
  assert.equal((await store.findCachedScriptWorkflowActivity(input))?.id, "second");
  assert.equal(
    await store.findCachedScriptWorkflowActivity({ ...input, runId: "other-run" }),
    null,
  );
  assert.equal(
    await store.findCachedScriptWorkflowActivity({ ...input, callPath: "root/agent/" }),
    null,
  );
  assert.equal(
    await store.findCachedScriptWorkflowActivity({ ...input, inputHash: "other" }),
    null,
  );
});

test("cache does not require a truthy result and only parses its selected row", async (t) => {
  const { store, db } = await workflowFixture(t);
  const input = { runId: "run", callPath: "root/agent", inputHash: "input-hash" };
  await store.createScriptWorkflowActivity(activity("old", { status: "completed" }));
  db.exec("UPDATE workflow_activity SET result_json='{' WHERE id='old'");
  for (const [index, result] of [false, 0, null, ""].entries()) {
    const id = `candidate-${index}`;
    await store.createScriptWorkflowActivity(activity(id, { status: "cached" }));
    await store.updateScriptWorkflowActivity({ id, result });
    const cached = await store.findCachedScriptWorkflowActivity(input);
    assert.equal(cached?.id, id);
    assert.equal(cached?.result, result === null ? undefined : result);
  }
  db.exec("UPDATE workflow_activity SET result_json='{' WHERE id='candidate-3'");
  await assert.rejects(store.findCachedScriptWorkflowActivity(input), SyntaxError);
});

test("activity lists sort call index then id and reject corruption only in their run", async (t) => {
  const { store, db, clock } = await workflowFixture(t);
  for (const input of [
    activity("z", { callIndex: 0 }),
    activity("a", { callIndex: 0 }),
    activity("m", { callIndex: -1 }),
    activity("other", { runId: "other-run" }),
  ]) {
    await store.createScriptWorkflowActivity(input);
  }
  db.exec("UPDATE workflow_activity SET error_json='{' WHERE id='other'");
  clock.reads = 0;
  assert.deepEqual(
    (await store.listScriptWorkflowActivities({ runId: "run" })).map((row) => row.id),
    ["m", "a", "z"],
  );
  assert.deepEqual(await store.listScriptWorkflowActivities({ runId: "absent" }), []);
  await assert.rejects(store.listScriptWorkflowActivities({ runId: "other-run" }), SyntaxError);
  assert.equal(clock.reads, 0);
});

test("native reference constraints and JSON failures preserve existing activity rows", async (t) => {
  const { store, rows } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  const before = rows("workflow_activity");
  await assert.rejects(
    store.createScriptWorkflowActivity(activity("missing-run", { runId: "absent" })),
    /FOREIGN KEY constraint failed/,
  );
  await assert.rejects(
    store.updateScriptWorkflowActivity({
      id: "activity",
      childSessionId: "absent" as typeof child,
    }),
    /FOREIGN KEY constraint failed/,
  );
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  await assert.rejects(
    store.updateScriptWorkflowActivity({ id: "activity", result: cycle }),
    TypeError,
  );
  await assert.rejects(
    store.updateScriptWorkflowActivity({ id: "activity", result: 1n }),
    TypeError,
  );
  assert.deepEqual(rows("workflow_activity"), before);
});
