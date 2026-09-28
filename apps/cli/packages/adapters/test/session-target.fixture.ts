// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { Store, type SessionGoal } from "./session-target-test-api.js";

export type Fixture = {
  store: InstanceType<typeof Store>;
  db: DatabaseSync;
  sessionID: SessionGoal["sessionID"];
};
export async function fixture(t: TestContext): Promise<Fixture> {
  let captured: DatabaseSync | undefined;
  function capture(connection: DatabaseSync) {
    captured ??= connection;
    assert.equal(captured, connection, "one native connection");
  }
  const originalPrepare = DatabaseSync.prototype.prepare;
  const originalExec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.prepare = function (...args) {
    capture(this);
    return Reflect.apply(originalPrepare, this, args);
  };
  DatabaseSync.prototype.exec = function (...args) {
    capture(this);
    return Reflect.apply(originalExec, this, args);
  };
  let store: InstanceType<typeof Store>;
  try {
    store = new Store({ dbPath: ":memory:" });
  } finally {
    DatabaseSync.prototype.prepare = originalPrepare;
    DatabaseSync.prototype.exec = originalExec;
  }
  assert.ok(captured);
  const db = captured;
  const nativeClose = DatabaseSync.prototype.close.bind(db);
  t.after(() => {
    if (!db.isOpen) return;
    try {
      if (db.isTransaction) Reflect.apply(originalExec, db, ["ROLLBACK"]);
    } finally {
      nativeClose();
    }
    assert.equal(db.isOpen, false);
  });
  const sessionID = "owner" as SessionGoal["sessionID"];
  const projectID = "synthetic" as Parameters<
    InstanceType<typeof Store>["createSession"]
  >[0]["projectID"];
  await store.createSession({
    id: sessionID,
    projectID,
    slug: "owner",
    directory: "/synthetic/target-tests",
    title: "Synthetic",
    version: "fixture",
    time: { created: 100, updated: 200 },
  });
  return { store, db, sessionID };
}

export function seedTarget(f: Fixture, extra: Partial<SessionGoal> = {}): SessionGoal {
  const goal: SessionGoal = {
    sessionID: f.sessionID,
    targetID: "goal",
    objective: "Seed",
    summaryTitle: "Seed summary",
    status: "active",
    tokenBudget: 10,
    tokensUsed: 2,
    timeUsedSeconds: 3,
    activeInputId: null,
    activeRunStartedAtMs: null,
    activeRunLastSeenAtMs: null,
    time: { created: 1000, updated: 2000 },
    ...extra,
  };
  f.db
    .prepare(`INSERT INTO session_target
    (session_id,target_id,objective,summary_title,status,token_budget,tokens_used,time_used_seconds,
     active_input_id,active_run_started_at,active_run_last_seen_at,time_created,time_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      goal.sessionID,
      goal.targetID,
      goal.objective,
      goal.summaryTitle,
      goal.status,
      goal.tokenBudget,
      goal.tokensUsed,
      goal.timeUsedSeconds,
      goal.activeInputId ?? null,
      goal.activeRunStartedAtMs ?? null,
      goal.activeRunLastSeenAtMs ?? null,
      goal.time.created,
      goal.time.updated,
    );
  return goal;
}

export function clock(t: TestContext, values: number[] | number) {
  let count = 0;
  const mock = t.mock.method(Date, "now", () => {
    const index = count++;
    if (typeof values === "number") return values;
    assert.ok(index < values.length, "unexpected Date.now call");
    return values[index]!;
  });
  t.after(() => mock.mock.restore());
  return { calls: () => count };
}

export function uuid(t: TestContext, value: string) {
  let count = 0;
  const mock = t.mock.method(crypto, "randomUUID", (() => {
    count++;
    return value;
  }) as typeof crypto.randomUUID);
  syncBuiltinESMExports();
  t.after(() => {
    mock.mock.restore();
    syncBuiltinESMExports();
  });
  return { calls: () => count };
}

export function rawState(db: DatabaseSync) {
  return {
    target: db.prepare("SELECT * FROM session_target ORDER BY session_id").all(),
    session: db.prepare("SELECT * FROM session ORDER BY id").all(),
  };
}

export function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail("expected a synchronous error");
}

export function traceTransactions(t: TestContext, db: DatabaseSync) {
  const events: string[] = [];
  const original = db.exec.bind(db);
  t.mock.method(db, "exec", (sql: string) => {
    const op = /^\s*(BEGIN(?:\s+IMMEDIATE)?|COMMIT|ROLLBACK)\b/i.exec(sql)?.[1];
    if (op) events.push(op.toUpperCase());
    return original(sql);
  });
  return events;
}

export function touchTrigger(db: DatabaseSync, action: "ABORT" | "ROLLBACK" = "ABORT") {
  db.exec(`CREATE TRIGGER target_touch_fault BEFORE UPDATE OF time_updated ON session
    WHEN NEW.id = 'owner' BEGIN SELECT RAISE(${action}, 'target touch native failure'); END;`);
}

// Bounded observation/arrival injection; native operations continue to use the real connection.
export function observeStatements(
  t: TestContext,
  db: DatabaseSync,
  wrap: (statement: StatementSync, sql: string) => void,
) {
  const prepare = db.prepare.bind(db);
  t.mock.method(db, "prepare", (sql: string) => {
    const statement = prepare(sql);
    wrap(statement, sql);
    return statement;
  });
}

export function isTargetRead(sql: string) {
  return /^\s*select\b/i.test(sql) && /\bfrom\s+["`]?session_target\b/i.test(sql);
}
