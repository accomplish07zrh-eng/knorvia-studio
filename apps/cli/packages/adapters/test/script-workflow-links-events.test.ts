// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Compatibility cases, including deliberately limited legacy task-link behavior.
import assert from "node:assert/strict";
import test from "node:test";
import {
  activity,
  child,
  event,
  link,
  otherChild,
  parent,
  workflowFixture,
} from "./script-workflow-extra-fixture.js";

test("event allocation uses native numeric arithmetic for legacy text in the affinity column", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.appendScriptWorkflowEvent(event("legacy"));
  db.exec("UPDATE workflow_event SET sequence='not-numeric' WHERE id='legacy'");
  const created = await store.appendScriptWorkflowEvent(event("next"));
  assert.equal(created.sequence, 1);
  assert.equal(
    db.prepare("SELECT typeof(sequence) AS kind FROM workflow_event WHERE id='next'").get()?.kind,
    "integer",
  );
});

test("events allocate one-based sequences per run and retain payload order and one timestamp", async (t) => {
  const { store, rows, clock } = await workflowFixture(t);
  const sessions = rows("session");
  const first = await store.appendScriptWorkflowEvent(
    event("e1", { phase: "", payload: { z: 1, a: [2, false] } }),
  );
  assert.deepEqual(first, {
    activityId: undefined,
    createdAt: 100,
    id: "e1",
    payload: { z: 1, a: [2, false] },
    phase: "",
    runId: "run",
    sequence: 1,
    type: "custom.event",
  });
  assert.equal(clock.reads, 1);
  assert.equal(rows("workflow_event")[0]?.payload_json, '{"z":1,"a":[2,false]}');
  assert.equal((await store.appendScriptWorkflowEvent(event("e2"))).sequence, 2);
  assert.equal(
    (await store.appendScriptWorkflowEvent(event("other", { runId: "other-run" }))).sequence,
    1,
  );
  assert.deepEqual(rows("session"), sessions);
});

test("event allocation uses current maximum; duplicate ids fail and deleting the tail permits reuse", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.appendScriptWorkflowEvent(event("e1"));
  await store.appendScriptWorkflowEvent(event("e2"));
  await assert.rejects(store.appendScriptWorkflowEvent(event("e1")), /UNIQUE constraint failed/);
  assert.equal((await store.appendScriptWorkflowEvent(event("e3"))).sequence, 3);
  db.exec("DELETE FROM workflow_event WHERE id='e3'");
  assert.equal((await store.appendScriptWorkflowEvent(event("replacement"))).sequence, 3);
  assert.deepEqual(
    (await store.listScriptWorkflowEvents({ runId: "run" })).map((row) => row.sequence),
    [1, 2, 3],
  );
});

test("event tail is newest N returned ascending; nonpositive and NaN limits mean all", async (t) => {
  const { store, clock } = await workflowFixture(t);
  for (let index = 1; index <= 5; index++)
    await store.appendScriptWorkflowEvent(event(`e${index}`));
  clock.reads = 0;
  assert.deepEqual(
    (await store.listScriptWorkflowEvents({ runId: "run", limit: 2 })).map((row) => row.id),
    ["e4", "e5"],
  );
  assert.deepEqual(
    (await store.listScriptWorkflowEvents({ runId: "run", limit: 1 })).map((row) => row.id),
    ["e5"],
  );
  for (const limit of [undefined, 0, -1, NaN, 20]) {
    assert.deepEqual(
      (await store.listScriptWorkflowEvents({ runId: "run", limit })).map((row) => row.sequence),
      [1, 2, 3, 4, 5],
    );
  }
  assert.deepEqual(await store.listScriptWorkflowEvents({ runId: "absent", limit: 2 }), []);
  await assert.rejects(
    store.listScriptWorkflowEvents({ runId: "run", limit: 1.5 }),
    /datatype mismatch/,
  );
  assert.equal(clock.reads, 0);
});

test("event decoding is limited to selected tail and SQL-null payload differs from JSON null", async (t) => {
  const { store, db } = await workflowFixture(t);
  for (let index = 1; index <= 3; index++)
    await store.appendScriptWorkflowEvent(event(`e${index}`, { payload: null }));
  db.exec(
    "UPDATE workflow_event SET payload_json='{' WHERE id='e1'; UPDATE workflow_event SET payload_json='null' WHERE id='e2'",
  );
  const tail = await store.listScriptWorkflowEvents({ runId: "run", limit: 2 });
  assert.equal(tail[0]?.payload, null);
  assert.equal(tail[1]?.payload, undefined);
  assert.ok(Object.hasOwn(tail[1] ?? {}, "payload"));
  await assert.rejects(store.listScriptWorkflowEvents({ runId: "run" }), SyntaxError);
  assert.deepEqual(await store.listScriptWorkflowEvents({ runId: "other-run" }), []);
});

test("event references require existing native rows but do not add cross-run scope validation", async (t) => {
  const { store, rows } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(
    activity("foreign-activity", { runId: "other-run", phase: "activity-phase" }),
  );
  const stored = await store.appendScriptWorkflowEvent(
    event("e1", { activityId: "foreign-activity" }),
  );
  assert.equal(stored.runId, "run");
  assert.equal(stored.activityId, "foreign-activity");
  assert.equal(stored.phase, undefined);
  const before = rows("workflow_event");
  await assert.rejects(
    store.appendScriptWorkflowEvent(event("bad-activity", { activityId: "missing" })),
    /FOREIGN KEY/,
  );
  await assert.rejects(
    store.appendScriptWorkflowEvent(event("bad-run", { runId: "missing" })),
    /FOREIGN KEY/,
  );
  await assert.rejects(
    store.appendScriptWorkflowEvent(event("bad-payload", { payload: 1n })),
    TypeError,
  );
  assert.deepEqual(rows("workflow_event"), before);
});

test("task-link child conflict changes only status and updated timestamp, returning original identity", async (t) => {
  const { store, rows, clock } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  const original = await store.createSessionTaskLink(
    link("first", {
      rootWorkflowRunId: "run",
      activityId: "activity",
      parentSessionId: parent,
      role: "agent",
      depth: 2,
      phase: "phase",
      label: "label",
      agentType: "worker",
      model: "model",
    }),
  );
  const sessions = rows("session");
  clock.value = 160;
  clock.reads = 0;
  const updated = await store.createSessionTaskLink(
    link("different-request-id", {
      rootWorkflowRunId: "other-run",
      parentSessionId: otherChild,
      role: "new-role",
      depth: 99,
      path: "replacement-path",
      phase: "new-phase",
      label: "new-label",
      model: "other",
      status: "done",
    }),
  );
  assert.deepEqual(updated, { ...original, status: "done", updatedAt: 160 });
  assert.equal(clock.reads, 1);
  assert.equal(rows("session_task_link").length, 1);
  assert.equal(rows("session_task_link")[0]?.id, "first");
  assert.deepEqual(rows("session"), sessions);
});

test("task links keep unknown role/status, zero/default depth and native identity constraints", async (t) => {
  const { store, rows } = await workflowFixture(t);
  const a = await store.createSessionTaskLink(
    link("link-a", { role: "external-role", status: "custom-status" }),
  );
  assert.equal(a.depth, 0);
  assert.equal(a.role, "external-role");
  assert.equal(a.status, "custom-status");
  assert.equal(a.rootWorkflowRunId, undefined);
  assert.equal(a.parentLinkId, undefined);
  await assert.rejects(
    store.createSessionTaskLink(link("link-a", { childSessionId: otherChild })),
    /UNIQUE constraint failed/,
  );
  const b = await store.createSessionTaskLink(
    link("link-b", { childSessionId: otherChild, parentLinkId: "link-a", depth: -1, path: "" }),
  );
  assert.equal(b.depth, -1);
  assert.equal(b.path, "");
  assert.equal(b.parentLinkId, "link-a");
  assert.equal(rows("session_task_link").length, 2);
});

test("dynamic-workflow actor links intentionally omit the legacy workflow-run foreign key", async (t) => {
  const { store, rows } = await workflowFixture(t);
  const actor = await store.createSessionTaskLink(
    link("actor", {
      role: "workflow_actor",
      path: "dwf/dynamic-run/site-a@2",
      label: "Actor",
      parentSessionId: parent,
    }),
  );
  assert.equal(actor.role, "workflow_actor");
  assert.equal(actor.rootWorkflowRunId, undefined);
  assert.equal(actor.path, "dwf/dynamic-run/site-a@2");
  await assert.rejects(
    store.createSessionTaskLink(
      link("bad-root", {
        childSessionId: otherChild,
        rootWorkflowRunId: "dynamic-run",
        role: "workflow_actor",
        path: "dwf/dynamic-run/site-b@1",
      }),
    ),
    /FOREIGN KEY/,
  );
  assert.equal(rows("session_task_link").length, 1);
});

test("native child deletion cascades the link while activity and parent-session removal set null", async (t) => {
  const { store, db } = await workflowFixture(t);
  await store.createScriptWorkflowActivity(activity());
  await store.createSessionTaskLink(
    link("first", { activityId: "activity", parentSessionId: parent }),
  );
  db.exec("DELETE FROM workflow_activity WHERE id='activity'");
  const withoutActivity = db
    .prepare("SELECT activity_id FROM session_task_link WHERE child_session_id=?")
    .get(child);
  assert.equal(withoutActivity?.activity_id, null);
  db.prepare("DELETE FROM session WHERE id=?").run(parent);
  assert.equal(
    db
      .prepare("SELECT parent_session_id FROM session_task_link WHERE child_session_id=?")
      .get(child)?.parent_session_id,
    null,
  );
  db.prepare("DELETE FROM session WHERE id=?").run(child);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM session_task_link").get()?.count, 0);
});
