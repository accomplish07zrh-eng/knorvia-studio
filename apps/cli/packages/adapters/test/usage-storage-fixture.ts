// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type {
  ModelUsageRecord,
  ProjectId,
  SessionId,
  ToolUsageRecord,
  TurnId,
  TurnUsageRecord,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import * as usage from "../src/storage/session-store/repositories/usage.js";

export { usage };
export const day = 86_400_000;
export const now = 60 * day;
export const session = "usage-session" as SessionId;
export const project = "usage-project" as ProjectId;
export const turn = "usage-turn" as TurnId;
export type UsageTable = "model_usage" | "turn_usage" | "tool_usage";
export const tables: UsageTable[] = ["model_usage", "turn_usage", "tool_usage"];
export function modelInput(patch: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    id: "usage-model",
    logicalRequestId: "logical",
    sessionID: session,
    querySource: "main_turn",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    status: "completed",
    startedAt: now,
    ...patch,
  };
}
export function turnInput(patch: Partial<TurnUsageRecord> = {}): TurnUsageRecord {
  return { sessionID: session, turnID: turn, status: "completed", startedAt: now, ...patch };
}
export function toolInput(patch: Partial<ToolUsageRecord> = {}): ToolUsageRecord {
  return {
    id: "usage-tool",
    sessionID: session,
    toolCallID: "fixture-call",
    toolName: "Read",
    status: "completed",
    startedAt: now,
    ...patch,
  };
}
export async function usageFixture(t: TestContext) {
  t.mock.method(Date, "now", () => now);
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  await store.createSession({
    id: session,
    projectID: project,
    slug: "usage",
    directory: "/fixture/project",
    title: "Usage fixture",
    version: "test",
    time: { created: now, updated: now },
  });
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const rows = (table: UsageTable) =>
    db
      .prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => ({ ...row }));
  const snapshot = () => Object.fromEntries(tables.map((table) => [table, rows(table)]));
  const seedExpired = () => {
    db.prepare(
      "INSERT INTO model_usage(id,logical_request_id,session_id,query_source,provider_id,model_id,status,started_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      "expired-model",
      "expired-logical",
      session,
      "main_turn",
      "fixture-provider",
      "fixture-model",
      "completed",
      0,
    );
    db.prepare("INSERT INTO turn_usage(session_id,turn_id,status,started_at) VALUES(?,?,?,?)").run(
      session,
      "expired-turn",
      "completed",
      0,
    );
    db.prepare(
      "INSERT INTO tool_usage(id,session_id,tool_call_id,tool_name,status,started_at) VALUES(?,?,?,?,?,?)",
    ).run("expired-tool", session, "expired-call", "Read", "completed", 0);
  };
  return { db, store, rows, snapshot, seedExpired };
}
