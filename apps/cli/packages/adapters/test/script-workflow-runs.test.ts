// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { ScriptWorkflowRunStats, ScriptWorkflowRunStatus } from "@knorvia/contracts";
import { clock, definition, parent, workflowFixture } from "./script-workflow-fixture.js";

test("workflow definition defaults and conflict replace options while retaining creation identity", async (t) => {
  const f = await workflowFixture(t);
  const first = await f.store.upsertScriptWorkflowDefinition(
    definition({ source: "builtin", enabled: false, trusted: true, scriptPath: "original" }),
  );
  assert.equal(first.scope, "builtin");
  assert.equal(first.timeCreated, clock);
  t.mock.method(Date, "now", () => 200);
  const next = await f.store.upsertScriptWorkflowDefinition(
    definition({
      name: "Revised",
      source: "user",
      meta: { name: "Changed", description: "New", phases: [] },
    }),
  );
  assert.deepEqual(
    [
      next.id,
      next.timeCreated,
      next.timeUpdated,
      next.scope,
      next.enabled,
      next.trusted,
      next.scriptPath,
    ],
    [first.id, clock, 200, "explicit", true, false, undefined],
  );
  assert.equal(next.name, "Revised");
  assert.equal(Object.hasOwn(next, "scriptPath"), true);
  assert.equal(Object.getPrototypeOf(next), Object.prototype);
  assert.equal(f.rows("session")[0]?.time_updated, 2);
});

test("definition scope is independent and booleans require exact true and false", async (t) => {
  const f = await workflowFixture(t);
  const value = await f.store.upsertScriptWorkflowDefinition(
    definition({
      scope: "project",
      source: "builtin",
      enabled: 0 as unknown as boolean,
      trusted: 1 as unknown as boolean,
    }),
  );
  assert.equal(value.scope, "project");
  assert.equal(value.enabled, true);
  assert.equal(value.trusted, false);
  await assert.rejects(
    f.store.upsertScriptWorkflowDefinition(definition({ scope: "invalid" as "user" })),
    /CHECK/,
  );
  assert.equal(f.rows("workflow_definition").length, 1);
});

test("required metadata uses native JSON without schema parsing or nullable coercion", async (t) => {
  const f = await workflowFixture(t);
  const untyped = { a: 1, extension: { items: [false, null] } };
  const value = await f.store.upsertScriptWorkflowDefinition(
    definition({ meta: untyped as never }),
  );
  assert.deepEqual(value.meta, untyped);
  const nul = await f.store.upsertScriptWorkflowDefinition(definition({ meta: null as never }));
  assert.equal(nul.meta, null);
  assert.equal(f.rows("workflow_definition")[0]?.meta_json, "null");
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  await assert.rejects(
    f.store.upsertScriptWorkflowDefinition(definition({ meta: cyclic as never })),
    /circular/i,
  );
  assert.equal(f.rows("workflow_definition")[0]?.meta_json, "null");
});

test("run creation retains optional own keys and native defaults without touching sessions", async (t) => {
  const f = await workflowFixture(t);
  const sessions = f.rows("session");
  const value = await f.run({
    parentSessionId: parent,
    definitionId: "not-a-foreign-key",
    args: { extra: [1, null] },
    budgetTotal: 0,
    argsHash: "",
  });
  assert.deepEqual(
    [
      value.kind,
      value.status,
      value.budgetSpent,
      value.budgetTotal,
      value.createdAt,
      value.updatedAt,
    ],
    ["script", "pending", 0, 0, clock, clock],
  );
  assert.equal(value.definitionId, "not-a-foreign-key");
  assert.equal(value.argsHash, "");
  for (const key of ["currentPhase", "failure", "completedAt", "startedAt", "stats", "scriptPath"])
    assert.equal(Object.hasOwn(value, key), true);
  assert.deepEqual(value.args, { extra: [1, null] });
  assert.deepEqual(f.rows("session"), sessions);
  assert.equal(await f.store.getScriptWorkflowRun("missing"), null);
  await assert.rejects(f.run(), /UNIQUE/);
  await assert.rejects(
    f.run({ id: "bad-fk", parentSessionId: "missing" as typeof parent }),
    /FOREIGN KEY/,
  );
  await assert.rejects(
    f.run({ id: "bad-status", status: "other" as ScriptWorkflowRunStatus }),
    /CHECK/,
  );
  assert.equal(f.rows("workflow_run").length, 1);
});

test("run patch preserves omitted immutable data, supports clearing, and replaces complete JSON", async (t) => {
  const f = await workflowFixture(t);
  const original = await f.run({
    args: { untouched: true },
    budgetTotal: 90,
    stats: { unknown: 1 } as unknown as ScriptWorkflowRunStats,
  });
  t.mock.method(Date, "now", () => 200);
  let value = await f.store.updateScriptWorkflowRun({
    id: "run",
    currentPhase: "",
    budgetSpent: 0,
    status: "completed",
    startedAt: 0,
    completedAt: 10,
    failure: { old: true },
    stats: { new: 2 } as unknown as ScriptWorkflowRunStats,
  });
  assert.deepEqual(
    [value.currentPhase, value.startedAt, value.completedAt, value.stats, value.failure],
    ["", 0, 10, { new: 2 }, { old: true }],
  );
  value = await f.store.updateScriptWorkflowRun({ id: "run", status: "running" });
  assert.equal(value.completedAt, 10);
  assert.deepEqual(value.failure, { old: true });
  assert.equal(value.budgetTotal, 90);
  assert.deepEqual(value.args, original.args);
  assert.equal(value.createdAt, clock);
  assert.equal(value.updatedAt, 200);
  value = await f.store.updateScriptWorkflowRun({
    id: "run",
    currentPhase: null,
    startedAt: null,
    completedAt: null,
    failure: null,
    stats: null as never,
  });
  for (const key of ["currentPhase", "startedAt", "completedAt", "failure", "stats"] as const)
    assert.equal(value[key], undefined);
  const raw = f.rows("workflow_run")[0];
  for (const key of [
    "current_phase",
    "time_started",
    "time_completed",
    "failure_json",
    "stats_json",
  ])
    assert.equal(raw?.[key], null);
});

test("id-only run update normalizes stats and failure while preserving args bytes", async (t) => {
  const f = await workflowFixture(t);
  await f.run();
  f.db
    .prepare("UPDATE workflow_run SET args_json=?,stats_json=?,failure_json=?")
    .run(' { "keep" : 1 } ', ' {"b": 1, "a": 2 } ', ' {"x": 1, "x":2} ');
  await f.store.updateScriptWorkflowRun({ id: "run" });
  const raw = f.rows("workflow_run")[0];
  assert.equal(raw?.args_json, ' { "keep" : 1 } ');
  assert.equal(raw?.stats_json, '{"b":1,"a":2}');
  assert.equal(raw?.failure_json, '{"x":2}');
});

for (const field of ["args_json", "failure_json", "stats_json"])
  test(`corrupt current ${field} rejects run patch before clock and preserves row`, async (t) => {
    const f = await workflowFixture(t);
    await f.run();
    f.db.exec(`UPDATE workflow_run SET ${field}='bad-json'`);
    const before = f.snapshot();
    let clocks = 0;
    t.mock.method(Date, "now", () => {
      clocks++;
      return 200;
    });
    await assert.rejects(
      f.store.updateScriptWorkflowRun({ id: "run", failure: null, stats: null as never }),
      SyntaxError,
    );
    assert.equal(clocks, 0);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

test("missing updates reject before clock, with their public error strings", async (t) => {
  const f = await workflowFixture(t);
  let clocks = 0;
  t.mock.method(Date, "now", () => {
    clocks++;
    return 200;
  });
  await assert.rejects(f.store.updateScriptWorkflowRun({ id: "missing" }), {
    message: "Workflow run not found: missing",
  });
  await assert.rejects(f.store.updateScriptWorkflowActivity({ id: "missing" }), {
    message: "Workflow activity not found: missing",
  });
  assert.equal(clocks, 0);
});

test("run filters combine exact cwd and statuses, retain descending time/id ties and native limits", async (t) => {
  const f = await workflowFixture(t);
  await f.run({ id: "a", cwd: "/a", status: "running" });
  await f.run({ id: "b", cwd: "/a", status: "paused" });
  t.mock.method(Date, "now", () => 200);
  await f.run({ id: "c", cwd: "/A", status: "running" });
  const ids = async (input: Parameters<typeof f.store.listScriptWorkflowRuns>[0] = {}) =>
    (await f.store.listScriptWorkflowRuns(input)).map((row) => row.id);
  assert.deepEqual(await ids(), ["c", "b", "a"]);
  assert.deepEqual(await ids({ cwd: "/a", statuses: ["running", "running"] }), ["a"]);
  assert.deepEqual(await ids({ cwd: "", statuses: [], limit: 1 }), ["c"]);
  for (const limit of [undefined, 0, -1, NaN])
    assert.deepEqual(await ids({ limit }), ["c", "b", "a"]);
  for (const limit of [1.5, Infinity]) await assert.rejects(ids({ limit }), /datatype mismatch/);
  f.db.exec("UPDATE workflow_run SET args_json='bad' WHERE id='a'");
  assert.deepEqual(await ids({ limit: 2 }), ["c", "b"]);
  await assert.rejects(ids(), SyntaxError);
});

test("run updates in the same turn compose disjoint fields instead of saving a stale full patch", async (t) => {
  const f = await workflowFixture(t);
  await f.run();
  const first = f.store.updateScriptWorkflowRun({ id: "run", currentPhase: "phase-A" });
  const second = f.store.updateScriptWorkflowRun({ id: "run", budgetSpent: 7 });
  const results = await Promise.all([first, second]);
  assert.deepEqual(
    [results[0]?.currentPhase, results[1]?.currentPhase, results[1]?.budgetSpent],
    ["phase-A", "phase-A", 7],
  );
  const final = await f.store.getScriptWorkflowRun("run");
  assert.equal(final?.currentPhase, "phase-A");
  assert.equal(final?.budgetSpent, 7);
});

test("activity updates in the same turn compose child linkage and result", async (t) => {
  const f = await workflowFixture(t);
  await f.run();
  await f.activity();
  const first = f.store.updateScriptWorkflowActivity({ id: "activity", childSessionId: parent });
  const second = f.store.updateScriptWorkflowActivity({ id: "activity", result: { value: 7 } });
  const results = await Promise.all([first, second]);
  assert.equal(results[1]?.childSessionId, parent);
  const final = (await f.store.listScriptWorkflowActivities({ runId: "run" }))[0];
  assert.equal(final?.childSessionId, parent);
  assert.deepEqual(final?.result, { value: 7 });
});

test("same-field run absolute values keep last-call-wins semantics", async (t) => {
  const f = await workflowFixture(t);
  await f.run();
  await Promise.all([
    f.store.updateScriptWorkflowRun({ id: "run", budgetSpent: 7 }),
    f.store.updateScriptWorkflowRun({ id: "run", budgetSpent: 4 }),
  ]);
  assert.equal((await f.store.getScriptWorkflowRun("run"))?.budgetSpent, 4);
});
