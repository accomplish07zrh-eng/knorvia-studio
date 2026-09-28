// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Fixed public projections; field names are compatibility requirements.
import assert from "node:assert/strict";
import test from "node:test";
import {
  activity,
  child,
  codecs,
  event,
  link,
  parent,
  workflowFixture,
} from "./script-workflow-extra-fixture.js";

test("all five codecs expose complete ordered ordinary records and ignore extra physical columns", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.upsertScriptWorkflowDefinition({
    id: "definition",
    name: "Definition",
    source: "user",
    meta: { name: "Nested", description: "Description", phases: [] },
    scriptHash: "hash",
  });
  await store.createScriptWorkflowActivity(activity());
  await store.appendScriptWorkflowEvent(event());
  await store.createSessionTaskLink(link());
  const definition = codecs.decodeDefinition({
    ...db.prepare("SELECT * FROM workflow_definition").get(),
    ignored: "physical",
  } as unknown as Parameters<typeof codecs.decodeDefinition>[0]);
  const run = codecs.decodeRun(
    db.prepare("SELECT * FROM workflow_run WHERE id='run'").get() as unknown as Parameters<
      typeof codecs.decodeRun
    >[0],
  );
  const item = codecs.decodeActivity(
    db.prepare("SELECT * FROM workflow_activity").get() as unknown as Parameters<
      typeof codecs.decodeActivity
    >[0],
  );
  const notice = codecs.decodeEvent(
    db.prepare("SELECT * FROM workflow_event").get() as unknown as Parameters<
      typeof codecs.decodeEvent
    >[0],
  );
  const task = codecs.decodeTaskLink(
    db.prepare("SELECT * FROM session_task_link").get() as unknown as Parameters<
      typeof codecs.decodeTaskLink
    >[0],
  );
  const pairs = [
    [
      definition,
      {
        enabled: true,
        id: "definition",
        meta: { name: "Nested", description: "Description", phases: [] },
        name: "Definition",
        scope: "explicit",
        scriptHash: "hash",
        scriptPath: undefined,
        source: "user",
        timeCreated: 100,
        timeUpdated: 100,
        trusted: false,
      },
    ],
    [
      run,
      {
        args: undefined,
        argsHash: undefined,
        budgetSpent: 0,
        budgetTotal: undefined,
        completedAt: undefined,
        createdAt: 100,
        currentPhase: undefined,
        cwd: "/synthetic-workflow",
        definitionId: undefined,
        failure: undefined,
        id: "run",
        kind: "script",
        name: "run",
        parentSessionId: parent,
        scriptHash: "script-hash",
        scriptPath: undefined,
        startedAt: undefined,
        stats: undefined,
        status: "pending",
        updatedAt: 100,
      },
    ],
    [
      item,
      {
        attempt: 1,
        callIndex: 1,
        callPath: "root/agent",
        childSessionId: undefined,
        completedAt: undefined,
        createdAt: 100,
        error: undefined,
        id: "activity",
        inputHash: "input-hash",
        label: undefined,
        opts: undefined,
        parentActivityId: undefined,
        phase: undefined,
        prompt: undefined,
        result: undefined,
        runId: "run",
        startedAt: undefined,
        status: "queued",
        type: "agent",
        updatedAt: 100,
      },
    ],
    [
      notice,
      {
        activityId: undefined,
        createdAt: 100,
        id: "event",
        payload: undefined,
        phase: undefined,
        runId: "run",
        sequence: 1,
        type: "custom.event",
      },
    ],
    [
      task,
      {
        activityId: undefined,
        agentType: undefined,
        childSessionId: child,
        createdAt: 100,
        depth: 0,
        id: "link",
        label: undefined,
        model: undefined,
        parentLinkId: undefined,
        parentSessionId: undefined,
        path: "root/agent",
        phase: undefined,
        role: "agent",
        rootWorkflowRunId: undefined,
        status: "running",
        updatedAt: 100,
      },
    ],
  ] as const;
  for (const [actual, expected] of pairs) {
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(Object.hasOwn(actual, "ignored"), false);
  }
});

test("definition booleans accept exactly numeric one and meta uses native required JSON parsing", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.upsertScriptWorkflowDefinition({
    id: "d",
    name: "D",
    source: "user",
    scriptHash: "h",
    meta: { name: "D", description: "D", phases: [] },
  });
  const base = db.prepare("SELECT * FROM workflow_definition").get() as unknown as Parameters<
    typeof codecs.decodeDefinition
  >[0];
  for (const value of [0, 1, 2, -1]) {
    const result = codecs.decodeDefinition({
      ...base,
      enabled: value,
      trusted: value,
      script_path: "",
    });
    assert.equal(result.enabled, value === 1);
    assert.equal(result.trusted, value === 1);
    assert.equal(result.scriptPath, "");
  }
  assert.equal(codecs.decodeDefinition({ ...base, meta_json: "null" }).meta, null);
  assert.throws(() => codecs.decodeDefinition({ ...base, meta_json: "" }), SyntaxError);
  assert.throws(() => codecs.decodeDefinition({ ...base, meta_json: "{" }), SyntaxError);
});

test("run scalar projection preserves empty strings and zeros with no status normalization", async (t) => {
  const { db } = await workflowFixture(t);
  const base = db
    .prepare("SELECT * FROM workflow_run WHERE id='run'")
    .get() as unknown as Parameters<typeof codecs.decodeRun>[0];
  const record = codecs.decodeRun({
    ...base,
    args_hash: "",
    budget_total: 0,
    current_phase: "",
    definition_id: "",
    script_path: "",
    time_started: 0,
    time_completed: 0,
    status: "paused",
    args_json: "false",
    stats_json: "null",
    failure_json: "[]",
  });
  assert.equal(record.argsHash, "");
  assert.equal(record.budgetTotal, 0);
  assert.equal(record.currentPhase, "");
  assert.equal(record.definitionId, "");
  assert.equal(record.scriptPath, "");
  assert.equal(record.startedAt, 0);
  assert.equal(record.completedAt, 0);
  assert.equal(record.status, "paused");
  assert.equal(record.args, false);
  assert.equal(record.stats, null);
  assert.deepEqual(record.failure, []);
});

test("optional JSON distinguishes null storage and empty storage from encoded JSON null", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  await store.appendScriptWorkflowEvent(event());
  const run = db
    .prepare("SELECT * FROM workflow_run WHERE id='run'")
    .get() as unknown as Parameters<typeof codecs.decodeRun>[0];
  const act = db.prepare("SELECT * FROM workflow_activity").get() as unknown as Parameters<
    typeof codecs.decodeActivity
  >[0];
  const evt = db.prepare("SELECT * FROM workflow_event").get() as unknown as Parameters<
    typeof codecs.decodeEvent
  >[0];
  for (const raw of [null, "", "null", "false", "0", '""', "[]"]) {
    const expected: unknown = !raw ? undefined : JSON.parse(raw);
    const a = codecs.decodeRun({ ...run, args_json: raw, stats_json: raw, failure_json: raw });
    const b = codecs.decodeActivity({ ...act, error_json: raw, opts_json: raw, result_json: raw });
    const c = codecs.decodeEvent({ ...evt, payload_json: raw });
    for (const value of [a.args, a.stats, a.failure, b.error, b.opts, b.result, c.payload])
      assert.deepEqual(value, expected);
    assert.ok(Object.hasOwn(a, "stats"));
    assert.ok(Object.hasOwn(b, "result"));
    assert.ok(Object.hasOwn(c, "payload"));
  }
});

test("nested unknown JSON keys and own __proto__ survive in fresh independent decoded values", async (t) => {
  const { db } = await workflowFixture(t);
  const base = db
    .prepare("SELECT * FROM workflow_run WHERE id='run'")
    .get() as unknown as Parameters<typeof codecs.decodeRun>[0];
  const args = '{"z":1,"__proto__":{"marker":true},"nested":[{"extra":2}],"a":3}';
  const first = codecs.decodeRun({ ...base, args_json: args });
  const second = codecs.decodeRun({ ...base, args_json: args });
  assert.deepEqual(first.args, JSON.parse(args));
  assert.deepEqual(Object.keys(first.args as object), ["z", "__proto__", "nested", "a"]);
  assert.equal(Object.getPrototypeOf(first.args), Object.prototype);
  assert.ok(Object.hasOwn(first.args as object, "__proto__"));
  assert.notEqual(first, second);
  assert.notEqual(first.args, second.args);
  assert.equal(Reflect.get(first.args as object, "marker"), undefined);
});

test("multiple malformed JSON columns fail in run args/failure/stats and activity error/opts/result order", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  const run = db
    .prepare("SELECT * FROM workflow_run WHERE id='run'")
    .get() as unknown as Parameters<typeof codecs.decodeRun>[0];
  const act = db.prepare("SELECT * FROM workflow_activity").get() as unknown as Parameters<
    typeof codecs.decodeActivity
  >[0];
  const nativeMessage = (raw: string) => {
    try {
      JSON.parse(raw);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("Fixture must be invalid JSON");
  };
  const invalid = ["{", "not-json", "[1,"];
  const check = (action: () => unknown, raw: string) =>
    assert.throws(action, { name: "SyntaxError", message: nativeMessage(raw) });
  check(
    () =>
      codecs.decodeRun({
        ...run,
        args_json: invalid[0]!,
        failure_json: invalid[1]!,
        stats_json: invalid[2]!,
      }),
    invalid[0]!,
  );
  check(
    () =>
      codecs.decodeRun({
        ...run,
        args_json: "{}",
        failure_json: invalid[1]!,
        stats_json: invalid[2]!,
      }),
    invalid[1]!,
  );
  check(
    () =>
      codecs.decodeRun({ ...run, args_json: "{}", failure_json: "[]", stats_json: invalid[2]! }),
    invalid[2]!,
  );
  check(
    () =>
      codecs.decodeActivity({
        ...act,
        error_json: invalid[0]!,
        opts_json: invalid[1]!,
        result_json: invalid[2]!,
      }),
    invalid[0]!,
  );
  check(
    () =>
      codecs.decodeActivity({
        ...act,
        error_json: "{}",
        opts_json: invalid[1]!,
        result_json: invalid[2]!,
      }),
    invalid[1]!,
  );
  check(
    () =>
      codecs.decodeActivity({
        ...act,
        error_json: "{}",
        opts_json: "[]",
        result_json: invalid[2]!,
      }),
    invalid[2]!,
  );
});

test("activity, event and task nullable scalar fields retain empty strings and zero times", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  await store.appendScriptWorkflowEvent(event());
  await store.createSessionTaskLink(link());
  const act = db.prepare("SELECT * FROM workflow_activity").get() as unknown as Parameters<
    typeof codecs.decodeActivity
  >[0];
  const evt = db.prepare("SELECT * FROM workflow_event").get() as unknown as Parameters<
    typeof codecs.decodeEvent
  >[0];
  const task = db.prepare("SELECT * FROM session_task_link").get() as unknown as Parameters<
    typeof codecs.decodeTaskLink
  >[0];
  const a = codecs.decodeActivity({
    ...act,
    label: "",
    parent_activity_id: "",
    phase: "",
    prompt: "",
    time_started: 0,
    time_completed: 0,
  });
  assert.deepEqual(
    [a.label, a.parentActivityId, a.phase, a.prompt, a.startedAt, a.completedAt],
    ["", "", "", "", 0, 0],
  );
  const e = codecs.decodeEvent({ ...evt, activity_id: "", phase: "" });
  assert.deepEqual([e.activityId, e.phase], ["", ""]);
  const l = codecs.decodeTaskLink({
    ...task,
    activity_id: "",
    agent_type: "",
    label: "",
    model: "",
    parent_link_id: "",
    phase: "",
    root_workflow_run_id: "",
  });
  assert.deepEqual(
    [l.activityId, l.agentType, l.label, l.model, l.parentLinkId, l.phase, l.rootWorkflowRunId],
    ["", "", "", "", "", "", ""],
  );
});
