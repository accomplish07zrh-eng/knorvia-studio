// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { TraceId, UpdateSessionInput } from "@knorvia/contracts";
import {
  id,
  input,
  message,
  permission,
  pid,
  recordsFixture,
  revert,
  sessions,
  sid,
  workspace,
} from "./session-records-fixture.js";

test("create defaults and explicit zero clocks distinguish implicit title source", (t) => {
  const f = recordsFixture(t);
  t.mock.method(Date, "now", () => 90);
  const created = f.create({ time: undefined });
  assert.deepEqual(created.time, {
    created: 90,
    updated: 90,
    titleUpdated: undefined,
    compacting: undefined,
    archived: undefined,
  });
  assert.equal(created.taskType, "interactive");
  assert.equal(created.titleSource, "first_input");
  assert.equal(f.row().title_source, "first_input");
  f.create({ id: sid("zero"), titleSource: "first_input", time: { created: 0, updated: 0 } });
  assert.deepEqual(
    [
      f.row(sid("zero")).time_created,
      f.row(sid("zero")).time_updated,
      f.row(sid("zero")).time_title_updated,
    ],
    [0, 0, 0],
  );
  const byMessage = f.create({
    id: sid("message"),
    titleMessageID: message,
    time: { created: 11 },
  });
  assert.equal(byMessage.time.titleUpdated, 11);
});

test("same-ID creation preserves identity and history while replacing creation fields", async (t) => {
  const f = recordsFixture(t);
  f.create({
    traceID: "trace-old" as TraceId,
    workspaceID: workspace,
    parentID: sid("parent"),
    path: "/old",
    shareURL: "fixture:old",
    permission,
    titleSource: "custom",
  });
  await sessions.updateSession(f.db, {
    id,
    summary: { additions: 1, deletions: 2, files: 3, diffs: [] },
    revert,
    timeCompacting: 0,
    timeArchived: 40,
    timeUpdated: 80,
  });
  const before = f.row();
  const result = f.create({
    projectID: pid("new-project"),
    traceID: "trace-new" as TraceId,
    title: "Recreated",
    time: { created: 100, updated: 1 },
  });
  const after = f.row();
  for (const key of [
    "rowid",
    "time_created",
    "summary_additions",
    "summary_deletions",
    "summary_files",
    "summary_diffs",
    "revert",
    "permission",
    "time_compacting",
    "time_archived",
    "trace_id",
  ])
    assert.deepEqual(after[key], before[key], key);
  for (const key of [
    "workspace_id",
    "parent_id",
    "path",
    "share_url",
    "title_message_id",
    "time_title_updated",
  ])
    assert.equal(after[key], null, key);
  assert.equal(result.projectID, "new-project");
  assert.equal(result.title, "Recreated");
  assert.equal(result.time.updated, 1);
  assert.deepEqual(result.permission, permission);
  f.db.prepare("UPDATE session SET trace_id='' WHERE id=?").run(id);
  f.create({ traceID: "ignored" as TraceId, permission: {} });
  assert.equal(f.row().trace_id, "");
  assert.deepEqual(sessions.getSession(f.db, id)?.permission, {});
  f.db.prepare("UPDATE session SET trace_id=NULL WHERE id=?").run(id);
  f.create({ traceID: "accepted" as TraceId });
  assert.equal(f.row().trace_id, "accepted");
});

test("create returns trigger-updated storage and exact missing-after-write error", (t) => {
  const f = recordsFixture(t);
  f.db.exec(
    "CREATE TRIGGER rename_created AFTER INSERT ON session BEGIN UPDATE session SET title='Stored' WHERE id=NEW.id; END",
  );
  assert.equal(f.create().title, "Stored");
  f.db.exec(
    "CREATE TRIGGER remove_created AFTER INSERT ON session BEGIN DELETE FROM session WHERE id=NEW.id; END",
  );
  assert.throws(() => f.create({ id: sid("removed") }), {
    message: "Session not found after write: removed",
  });
  assert.equal(sessions.getSession(f.db, sid("removed")), null);
});

test("update distinguishes undefined, null, empty strings and whole summary replacement", async (t) => {
  const f = recordsFixture(t);
  f.create({
    workspaceID: workspace,
    parentID: sid("parent"),
    traceID: "trace" as TraceId,
    taskType: "fork",
    permission,
    path: "/path",
    shareURL: "fixture:url",
    titleMessageID: message,
  });
  await sessions.updateSession(f.db, {
    id,
    summary: { additions: 1, deletions: 2, files: 3, diffs: [] },
    revert,
    timeArchived: 0,
    timeCompacting: 0,
  });
  const stable = f.row();
  await sessions.updateSession(f.db, {
    id,
    title: "",
    directory: "",
    path: "",
    shareURL: "",
    summary: { additions: 0 },
  });
  const partial = f.row();
  assert.deepEqual(
    [partial.title, partial.directory, partial.path, partial.share_url],
    ["", "", "", ""],
  );
  assert.deepEqual(
    [
      partial.summary_additions,
      partial.summary_deletions,
      partial.summary_files,
      partial.summary_diffs,
    ],
    [0, null, null, null],
  );
  for (const key of [
    "rowid",
    "id",
    "project_id",
    "workspace_id",
    "parent_id",
    "trace_id",
    "task_type",
    "slug",
    "version",
    "time_created",
    "permission",
    "revert",
    "time_archived",
    "time_compacting",
  ])
    assert.deepEqual(partial[key], stable[key], key);
  const cleared = await sessions.updateSession(f.db, {
    id,
    path: null,
    shareURL: null,
    titleMessageID: null,
    summary: {},
    revert: null,
    permission: null,
    timeArchived: null,
    timeCompacting: null,
  });
  for (const key of [
    "path",
    "share_url",
    "title_message_id",
    "summary_additions",
    "summary_deletions",
    "summary_files",
    "summary_diffs",
    "revert",
    "permission",
    "time_archived",
    "time_compacting",
  ])
    assert.equal(f.row()[key], null, key);
  assert.equal(cleared.title, "");
  assert.equal(cleared.time.created, 10);
});

test("title timestamp uses current clock; activity never regresses", async (t) => {
  const f = recordsFixture(t);
  f.create();
  let now = 100;
  t.mock.method(Date, "now", () => now);
  await sessions.updateSession(f.db, { id, title: "Original", timeUpdated: 0 });
  assert.equal(f.row().time_title_updated, null);
  assert.equal(f.row().time_updated, 20);
  await sessions.updateSession(f.db, { id, title: "Changed", timeUpdated: 21 });
  assert.equal(f.row().time_title_updated, 100);
  now = 110;
  await sessions.updateSession(f.db, { id, titleSource: "first_input", timeUpdated: 0 });
  assert.equal(f.row().time_title_updated, 110);
  now = 120;
  await sessions.updateSession(f.db, { id, titleMessageID: null, timeUpdated: 0 });
  assert.equal(f.row().time_title_updated, 120);
  now = 130;
  await sessions.updateSession(f.db, { id });
  assert.equal(f.row().time_title_updated, 120);
  assert.equal(f.row().time_updated, 130);
});

test("title gate rejects the entire patch but absent title or empty gate permits updates", async (t) => {
  const f = recordsFixture(t);
  f.create({ titleSource: "custom", permission });
  const before = f.row();
  const rejected = await sessions.updateSession(f.db, {
    id,
    title: "Original",
    expectedTitleSources: ["first_input"],
    permission: {},
    timeArchived: 0,
  });
  assert.equal(rejected.titleSource, "custom");
  assert.deepEqual(f.row(), before);
  await sessions.updateSession(f.db, { id, expectedTitleSources: ["first_input"], permission: {} });
  assert.equal(f.row().permission, "{}");
  await sessions.updateSession(f.db, { id, title: "Allowed", expectedTitleSources: [] });
  assert.equal(f.row().title, "Allowed");
  f.create({ id: sid("defaulted") });
  await sessions.updateSession(f.db, {
    id: sid("defaulted"),
    title: "Defaulted",
    expectedTitleSources: ["first_input"],
  });
  assert.equal(f.row(sid("defaulted")).title, "Defaulted");
});

test("revert wrappers preserve other fields and clear the whole summary on reset", async (t) => {
  const f = recordsFixture(t);
  f.create({ permission });
  await sessions.updateSession(f.db, { id, summary: { additions: 2, files: 1 }, timeArchived: 0 });
  await sessions.setRevert(f.db, { sessionID: id, revert });
  assert.equal(f.row().summary_additions, 2);
  await sessions.setRevert(f.db, {
    sessionID: id,
    revert,
    summary: { additions: 3, deletions: 4, files: 5, diffs: [] },
  });
  assert.equal(f.row().summary_files, 5);
  await sessions.clearRevert(f.db, id);
  for (const key of [
    "revert",
    "summary_additions",
    "summary_deletions",
    "summary_files",
    "summary_diffs",
  ])
    assert.equal(f.row()[key], null, key);
  assert.equal(f.row().permission, JSON.stringify(permission));
  assert.equal(f.row().time_archived, 0);
});

test("missing rows and malformed JSON propagate instead of fabricating a session", async (t) => {
  const f = recordsFixture(t);
  assert.equal(sessions.getSession(f.db, id), null);
  await assert.rejects(sessions.updateSession(f.db, { id }), {
    message: `Session not found: ${id}`,
  });
  await assert.rejects(sessions.clearRevert(f.db, id), { message: `Session not found: ${id}` });
  f.create();
  f.db.prepare("UPDATE session SET permission='invalid' WHERE id=?").run(id);
  assert.throws(() => sessions.getSession(f.db, id), SyntaxError);
  await assert.rejects(sessions.listSessions(f.db), SyntaxError);
  await assert.rejects(sessions.updateSession(f.db, { id, permission: {} }), SyntaxError);
});

test("encoding errors and input objects are preserved", async (t) => {
  const f = recordsFixture(t);
  const first = Object.freeze(input());
  sessions.createSession(f.db, first);
  const patch = Object.freeze({
    id,
    permission: Object.freeze({}),
    summary: Object.freeze({ files: 0 }),
  });
  await sessions.updateSession(f.db, patch as UpdateSessionInput);
  const before = f.row();
  const failure = new Error("fixture serialization");
  const invalid = {
    toJSON() {
      throw failure;
    },
  } as unknown as UpdateSessionInput["permission"];
  await assert.rejects(
    sessions.updateSession(f.db, { id, permission: invalid }),
    (error) => error === failure,
  );
  assert.deepEqual(f.row(), before);
  assert.equal(f.db.isTransaction, false);
});

test("empty patches reencode stored JSON; rejected title patches avoid new encoding only", async (t) => {
  const f = recordsFixture(t);
  f.create({ titleSource: "custom" });
  f.db
    .prepare("UPDATE session SET permission=?,summary_diffs=?,revert=? WHERE id=?")
    .run(JSON.stringify(permission, null, 2), "[  ]", JSON.stringify(revert, null, 2), id);
  await sessions.updateSession(f.db, { id, timeUpdated: 20 });
  assert.equal(f.row().permission, JSON.stringify(permission));
  assert.equal(f.row().summary_diffs, "[]");
  assert.equal(f.row().revert, JSON.stringify(revert));
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const invalid = circular as UpdateSessionInput["permission"];
  const patch: UpdateSessionInput = {
    id,
    title: "Rejected",
    expectedTitleSources: ["first_input"],
    permission: invalid,
  };
  const before = f.row();
  await sessions.updateSession(f.db, patch);
  assert.deepEqual(f.row(), before);
  await assert.rejects(
    sessions.updateSession(f.db, { ...patch, expectedTitleSources: [] }),
    TypeError,
  );
  f.db.prepare("UPDATE session SET permission='invalid' WHERE id=?").run(id);
  await assert.rejects(sessions.updateSession(f.db, { ...patch, permission: null }), SyntaxError);
  assert.equal(f.db.isTransaction, false);
});

test("bounded historical nulls preserve nonnullable values and optional revert summary", async (t) => {
  const f = recordsFixture(t);
  f.create({ titleSource: "custom" });
  t.mock.method(Date, "now", () => 100);
  await sessions.updateSession(f.db, { id, summary: { additions: 5 }, timeUpdated: 20 });
  await sessions.updateSession(f.db, { id, title: null } as unknown as UpdateSessionInput);
  assert.equal(f.row().title, "Original");
  assert.equal(f.row().time_title_updated, 100);
  const patch = {
    id,
    directory: null,
    title: null,
    titleSource: null,
    timeUpdated: 20,
  } as unknown as UpdateSessionInput;
  await sessions.updateSession(f.db, patch);
  assert.deepEqual(
    [f.row().directory, f.row().title, f.row().title_source, f.row().time_title_updated],
    ["/work/root", "Original", "custom", 100],
  );
  const command = { sessionID: id, revert, summary: null } as unknown as Parameters<
    typeof sessions.setRevert
  >[1];
  await sessions.setRevert(f.db, command);
  assert.equal(f.row().summary_additions, 5);
});
