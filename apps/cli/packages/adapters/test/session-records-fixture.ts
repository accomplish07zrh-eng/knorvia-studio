// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type {
  CreateSessionInput,
  MessageId,
  ProjectId,
  SessionId,
  WorkspaceId,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import * as sessions from "../src/storage/session-store/repositories/sessions.js";

export { sessions };
export const id = "records-main" as SessionId;
export const project = "records-project" as ProjectId;
export const workspace = "records-workspace" as WorkspaceId;
export const message = "records-message" as MessageId;
export const sid = (value: string) => value as SessionId;
export const wid = (value: string) => value as WorkspaceId;
export const pid = (value: string) => value as ProjectId;
export const permission = { version: 1 as const, allow: [{ toolName: "Read" }] };
export const revert = { messageID: message, snapshot: "fixture" };

export function input(patch: Partial<CreateSessionInput> = {}): CreateSessionInput {
  return {
    id,
    projectID: project,
    slug: "fixture",
    directory: "/work/root",
    title: "Original",
    version: "1",
    time: { created: 10, updated: 20 },
    ...patch,
  };
}

export function recordsFixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const row = (key = id) => ({ ...db.prepare("SELECT rowid,* FROM session WHERE id=?").get(key)! });
  return {
    db,
    store,
    row,
    create: (patch: Partial<CreateSessionInput> = {}) => sessions.createSession(db, input(patch)),
  };
}
