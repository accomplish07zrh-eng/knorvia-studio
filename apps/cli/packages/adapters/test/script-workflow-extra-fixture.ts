// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import * as codecs from "../src/storage/session-store/repositories/script-workflow-codecs.js";

export { codecs };
type Store = SqliteSessionStore;
export type ActivityInput = Parameters<Store["createScriptWorkflowActivity"]>[0];
export type ActivityPatch = Parameters<Store["updateScriptWorkflowActivity"]>[0];
export type EventInput = Parameters<Store["appendScriptWorkflowEvent"]>[0];
export type LinkInput = Parameters<Store["createSessionTaskLink"]>[0];
type SessionId = Parameters<Store["createSession"]>[0]["id"];
type ProjectId = Parameters<Store["createSession"]>[0]["projectID"];
export const parent = "workflow-parent" as SessionId;
export const child = "workflow-child" as SessionId;
export const otherChild = "workflow-other-child" as SessionId;
export function activity(id = "activity", patch: Partial<ActivityInput> = {}): ActivityInput {
  return {
    id,
    runId: "run",
    callIndex: 1,
    callPath: "root/agent",
    inputHash: "input-hash",
    type: "agent",
    ...patch,
  };
}
export function event(id = "event", patch: Partial<EventInput> = {}): EventInput {
  return { id, runId: "run", type: "custom.event", ...patch };
}
export function link(id = "link", patch: Partial<LinkInput> = {}): LinkInput {
  return {
    id,
    childSessionId: child,
    path: "root/agent",
    role: "agent",
    status: "running",
    ...patch,
  };
}
type Table =
  | "session"
  | "workflow_definition"
  | "workflow_run"
  | "workflow_activity"
  | "workflow_event"
  | "session_task_link";
export async function workflowFixture(t: TestContext) {
  const clock = { value: 100, reads: 0 };
  t.mock.method(Date, "now", () => {
    clock.reads++;
    return clock.value;
  });
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  t.after(() => {
    if (db.isTransaction) db.exec("ROLLBACK");
    store.close();
  });
  for (const id of [parent, child, otherChild]) {
    await store.createSession({
      id,
      projectID: "workflow-project" as ProjectId,
      slug: id,
      directory: "/synthetic-workflow",
      title: id,
      version: "test",
      time: { created: 1, updated: 2 },
    });
  }
  for (const id of ["run", "other-run"]) {
    await store.createScriptWorkflowRun({
      id,
      name: id,
      cwd: "/synthetic-workflow",
      scriptHash: "script-hash",
      parentSessionId: parent,
    });
  }
  clock.reads = 0;
  const rows = (table: Table) =>
    db
      .prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => ({ ...row }));
  return { store, db, clock, rows };
}
