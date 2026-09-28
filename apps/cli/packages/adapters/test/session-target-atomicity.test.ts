// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import type { StatementSync } from "node:sqlite";
import {
  captureError,
  fixture,
  isTargetRead,
  observeStatements,
  rawState,
  seedTarget,
  touchTrigger,
  traceTransactions,
} from "./session-target.fixture.js";
import { operation, writes } from "./session-target-operations.fixture.js";
import { target } from "./session-target-test-api.js";

for (const kind of writes)
  test(`${kind}: native touch ABORT rolls back the entire owned write`, async (t) => {
    const f = await fixture(t);
    const write = operation(f, kind);
    const before = rawState(f.db);
    touchTrigger(f.db);
    const error = captureError(write) as Error & { code: string; errcode: number };
    assert.equal(error.message, "target touch native failure");
    assert.equal(error.code, "ERR_SQLITE_ERROR");
    assert.equal(error.errcode, 1811);
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(
      rawState(f.db),
      before,
      "failure must leave the entire original target/session state",
    );
  });

for (const kind of ["set", "create"] as const)
  test(`${kind}: injected read-back error retains its identity and rolls back`, async (t) => {
    const f = await fixture(t);
    const write = operation(f, kind);
    const before = rawState(f.db);
    const failure = { reason: "synthetic target read failed", original: true };
    let reads = 0;
    observeStatements(t, f.db, (statement, sql) => {
      if (!isTargetRead(sql)) return;
      const get = statement.get;
      statement.get = function (this: StatementSync, ...args) {
        if (reads === 0) {
          reads++;
          throw failure;
        }
        return Reflect.apply(get, this, args);
      } as typeof statement.get;
    });
    assert.strictEqual(captureError(write), failure);
    assert.equal(reads, 1, "the actual target read-back boundary was reached");
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(rawState(f.db), before);
  });

test("native touch side effect removing the target rolls back on must-read failure", async (t) => {
  const f = await fixture(t);
  const write = operation(f, "set");
  const before = rawState(f.db);
  f.db.exec(`CREATE TRIGGER remove_target_on_touch AFTER UPDATE OF time_updated ON session
    WHEN NEW.id='owner' BEGIN DELETE FROM session_target WHERE session_id='owner'; END;`);
  const error = captureError(write);
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Session target not found after write: owner");
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(rawState(f.db), before);
});

test("native automatic rollback preserves the original Error and does not clean it up again", async (t) => {
  const f = await fixture(t);
  const write = operation(f, "set");
  const before = rawState(f.db);
  touchTrigger(f.db, "ROLLBACK");
  const captured: unknown[] = [];
  observeStatements(t, f.db, (statement, sql) => {
    if (!/^\s*update\s+["`]?session\b/i.test(sql)) return;
    const run = statement.run;
    statement.run = function (this: StatementSync, ...args) {
      try {
        return Reflect.apply(run, this, args);
      } catch (error) {
        captured.push(error);
        throw error;
      }
    } as typeof statement.run;
  });
  const events = traceTransactions(t, f.db);
  const actual = captureError(write);
  assert.equal(captured.length, 1);
  assert.strictEqual(actual, captured[0]);
  assert.equal(events.filter((event) => event === "ROLLBACK").length, 0);
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(rawState(f.db), before);
});

test("native touch failure and injected cleanup failure preserve both exact causes", async (t) => {
  const f = await fixture(t);
  const write = operation(f, "set");
  touchTrigger(f.db);
  const captured: unknown[] = [];
  observeStatements(t, f.db, (statement, sql) => {
    if (!/^\s*update\s+["`]?session\b/i.test(sql)) return;
    const run = statement.run;
    statement.run = function (this: StatementSync, ...args) {
      try {
        return Reflect.apply(run, this, args);
      } catch (error) {
        captured.push(error);
        throw error;
      }
    } as typeof statement.run;
  });
  const cleanup = new Error("injected rollback failure");
  const exec = f.db.exec.bind(f.db);
  let attempts = 0;
  t.mock.method(f.db, "exec", (sql: string) => {
    if (/^\s*rollback\s*;?\s*$/i.test(sql)) {
      attempts++;
      throw cleanup;
    }
    return exec(sql);
  });
  const actual = captureError(write);
  assert.equal(captured.length, 1, "native touch failure arrived");
  assert.ok(actual instanceof AggregateError);
  assert.equal(attempts, 1);
  assert.strictEqual(actual.errors[0], captured[0]);
  assert.strictEqual(actual.errors[1], cleanup);
  assert.equal(actual.errors.length, 2);
  assert.equal(Object.hasOwn(actual, "cause"), true);
  assert.strictEqual(actual.cause, captured[0]);
  assert.equal(Object.getOwnPropertyDescriptor(actual, "cause")?.enumerable, false);
  assert.equal(
    f.db.isTransaction,
    true,
    "failed cleanup does not claim a committed or rolled-back state",
  );
});

for (const kind of ["finish", "recover"] as const)
  test(`${kind}: re-read inside the transaction after explicit post-read mutation`, async (t) => {
    const f = await fixture(t);
    seedTarget(f, {
      activeInputId: "input",
      activeRunStartedAtMs: 1000,
      activeRunLastSeenAtMs: 2000,
    });
    let injected = false;
    const readTransactions: boolean[] = [];
    observeStatements(t, f.db, (statement, sql) => {
      if (!isTargetRead(sql)) return;
      const get = statement.get;
      statement.get = function (this: StatementSync, ...args) {
        const value = Reflect.apply(get, this, args);
        readTransactions.push(f.db.isTransaction);
        if (!injected) {
          injected = true;
          // Explicit same-connection arrival injection, NOT a second-connection concurrency proof.
          if (kind === "finish")
            f.db
              .prepare(`UPDATE session_target SET
          active_run_started_at=2000,active_run_last_seen_at=4000 WHERE session_id='owner'`)
              .run();
          else
            f.db
              .prepare(`UPDATE session_target SET status='complete',active_run_last_seen_at=9000
          WHERE session_id='owner'`)
              .run();
        }
        return value;
      } as typeof statement.get;
    });
    const result =
      kind === "finish"
        ? target.finishSessionTargetRun(f.db, {
            sessionID: f.sessionID,
            targetID: "goal",
            inputID: "input",
            endedAtMs: 5000,
          })
        : target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID });
    assert.equal(
      injected,
      true,
      "mutation occurred on the old implementation too, without any BEGIN hook",
    );
    assert.ok(result);
    assert.equal(result.activeInputId, null);
    assert.equal(result.timeUsedSeconds, kind === "finish" ? 6 : 11);
    assert.equal(result.status, kind === "finish" ? "active" : "complete");
    assert.ok(
      readTransactions.slice(1).includes(true),
      "a later decisive read happened inside a transaction",
    );
  });
