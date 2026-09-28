// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type { ProjectId, RecordInputHistoryInput, SessionId } from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import * as history from "../src/storage/session-store/repositories/input-history.js";

export { history };
export const project = "history-project" as ProjectId;
export const otherProject = "history-other" as ProjectId;
export const session = "history-session" as SessionId;
export const fixtureUuid = "10000000-0000-4000-8000-000000000001";
export function historyInput(
  patch: Partial<RecordInputHistoryInput> = {},
): RecordInputHistoryInput {
  return { projectID: project, text: "Fixture", kind: "prompt", ...patch };
}
export function historyFixture(t: TestContext, dbPath = ":memory:") {
  const store = new SqliteSessionStore({ dbPath });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const rows = () =>
    db
      .prepare("SELECT rowid,* FROM input_history ORDER BY time_created DESC,id DESC")
      .all()
      .map((row) => ({ ...row }));
  const seed = (
    id: string,
    patch: {
      projectID?: string;
      sessionID?: string | null;
      text?: string;
      attachments?: string | null;
      kind?: string;
      created?: number;
    } = {},
  ) => {
    db.prepare(
      "INSERT INTO input_history(id,project_id,session_id,text,attachments,kind,time_created) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id,
      patch.projectID ?? project,
      patch.sessionID ?? null,
      patch.text ?? "Seed",
      patch.attachments ?? null,
      patch.kind ?? "prompt",
      patch.created ?? 20,
    );
  };
  return {
    db,
    store,
    rows,
    seed,
    record: (patch: Partial<RecordInputHistoryInput> = {}) =>
      history.recordInputHistory(db, historyInput(patch)),
    recall: (skip?: number) => history.recallPreviousInputHistory(db, { projectID: project, skip }),
  };
}
