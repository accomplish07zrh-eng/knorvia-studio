// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  SqliteSessionStore,
  SqliteSessionMigrationError,
  runSqliteSessionMigrations,
  runSqliteSessionMigrationsAsync,
  type SqliteMigrationProgress,
} from "./session-bootstrap.target.js";
import {
  CATALOG,
  createLedger,
  errorOf,
  files,
  hasLedger,
  initialized,
  ledger,
  memory,
  rejection,
} from "./session-bootstrap.fixture.js";

for (const stopAt of ["checking-1", "checking-2", "migrating", "committing", "ready"] as const) {
  test(`callback rejection at ${stopAt} keeps original reason and correct commit boundary`, async (t) => {
    const db = memory(t);
    const reason = stopAt === "migrating" ? undefined : { sentinel: stopAt };
    const phases: string[] = [];
    let checks = 0;
    let insideTransaction: boolean | undefined;
    const value = await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async (p) => {
          phases.push(p.phase);
          const stage = p.phase === "checking" ? `checking-${++checks}` : p.phase;
          if (stage === stopAt) {
            insideTransaction = db.isTransaction;
            throw reason;
          }
        },
      }),
    );
    assert.equal(value, reason);
    assert.equal(insideTransaction, stopAt === "migrating" || stopAt === "committing");
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
    assert.equal(
      phases.includes("failed"),
      false,
      "transport failure is not a fabricated database failure notification",
    );
    assert.equal(hasLedger(db), stopAt === "ready");
    if (stopAt === "ready") assert.equal(ledger(db).length, 22);
    assert.equal(phases.at(-1), stopAt.startsWith("checking") ? "checking" : stopAt);
  });
}

test("native automatic rollback happens before failed progress and rejected failed notification preserves SQL cause", async (t) => {
  const db = memory(t);
  createLedger(db);
  db.exec(
    "CREATE TRIGGER fixture_reject BEFORE INSERT ON schema_migration BEGIN SELECT RAISE(ROLLBACK,'fixture ledger rejection'); END",
  );
  const observed: SqliteMigrationProgress[] = [];
  let failedState: { inTransaction: boolean; ledgerRows: ReturnType<typeof ledger> } | undefined;
  const value = await rejection(
    runSqliteSessionMigrationsAsync(db, ":memory:", {
      onProgress: async (p) => {
        observed.push(p);
        if (p.phase === "failed") {
          failedState = { inTransaction: db.isTransaction, ledgerRows: ledger(db) };
          throw new Error("fixture transport cannot replace native SQL failure");
        }
      },
    }),
  );
  const error = errorOf(value, "sql_failed");
  assert.deepEqual(failedState, { inTransaction: false, ledgerRows: [] });
  assert.equal(error.message, `SQLite migration ${CATALOG[0]!.id} failed for :memory:`);
  assert.equal(error.migrationId, CATALOG[0]!.id);
  assert.ok(error.cause instanceof Error);
  assert.match(error.cause.message, /fixture ledger rejection/);
  assert.equal((error.cause as { errcode?: number }).errcode! & 0xff, 19);
  assert.equal(observed.at(-1)?.errorCode, "sql_failed");
  assert.equal(observed.at(-1)?.migration?.executedCount, 1);
  assert.equal(observed.at(-1)?.migration?.committedCount, 0);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='session'").get(), undefined);
});

for (const asynchronous of [false, true]) {
  test(`${asynchronous ? "async" : "sync"} runner rejects nested BEGIN without rolling back caller work`, async (t) => {
    const db = initialized(t);
    db.exec(
      "CREATE TABLE fixture_owned(value TEXT); BEGIN IMMEDIATE; INSERT INTO fixture_owned VALUES('caller uncommitted')",
    );
    const before = ledger(db);
    let value: unknown;
    if (asynchronous) value = await rejection(runSqliteSessionMigrationsAsync(db, ":memory:"));
    else {
      try {
        runSqliteSessionMigrations(db, ":memory:");
        assert.fail("nested runner must fail");
      } catch (error) {
        value = error;
      }
    }
    const error = errorOf(value, "sql_failed");
    assert.equal(error.message, "SQLite migration initialization failed for :memory:");
    assert.ok(error.cause instanceof Error);
    assert.equal(db.isTransaction, true);
    assert.equal(db.prepare("SELECT value FROM fixture_owned").get()?.value, "caller uncommitted");
    assert.deepEqual(ledger(db), before);
    db.exec("COMMIT");
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare("SELECT value FROM fixture_owned").get()?.value, "caller uncommitted");
  });
}

test("injected preexisting migration error keeps identity through normalization and failed callback", async (t) => {
  const db = memory(t);
  const original = db.exec.bind(db);
  const sentinel = new SqliteSessionMigrationError("fixture existing error", {
    dbPath: ":memory:",
    kind: "io_error",
    cause: new Error("root"),
  });
  t.mock.method(db, "exec", (sql: string) => {
    if (/foreign_keys/i.test(sql)) throw sentinel;
    original(sql);
  });
  let seen = "";
  const value = await rejection(
    runSqliteSessionMigrationsAsync(db, ":memory:", {
      onProgress: async (p) => {
        if (p.phase === "failed") {
          seen = p.errorCode!;
          throw 0;
        }
      },
    }),
  );
  assert.equal(value, sentinel);
  assert.equal(seen, "io_error");
  assert.equal(db.isTransaction, false);
});

test("injected extended BUSY retries within each acquisition stage and reports each stage only once", async (t) => {
  const db = memory(t);
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const busy = Object.assign(new Error("injected extended BUSY"), {
    errcode: 517,
    code: "ERR_SQLITE_ERROR",
  });
  const nativePrepare = db.prepare.bind(db);
  const nativeExec = db.exec.bind(db);
  let inspections = 0;
  let begins = 0;
  t.mock.method(db, "prepare", ((sql: string) => {
    if (++inspections <= 2) throw busy;
    return nativePrepare(sql);
  }) as typeof db.prepare);
  t.mock.method(db, "exec", (sql: string) => {
    if (/^begin immediate$/i.test(sql) && ++begins <= 2) throw busy;
    nativeExec(sql);
  });
  const phases: string[] = [];
  await runSqliteSessionMigrationsAsync(db, ":memory:", {
    lockWaitTimeoutMs: 1000,
    onProgress: async (p) => {
      phases.push(p.phase);
    },
  });
  assert.equal(begins, 3);
  assert.deepEqual(phases.slice(0, 4), [
    "checking",
    "waiting_for_lock",
    "checking",
    "waiting_for_lock",
  ]);
  assert.equal(phases.filter((p) => p === "waiting_for_lock").length, 2);
  assert.equal(ledger(db).length, 22);
});

test("native LOCKED reused at an injected acquisition boundary fails once instead of being retried as BUSY", async (t) => {
  const db = memory(t);
  db.exec("CREATE TABLE fixture_locked(value TEXT); INSERT INTO fixture_locked VALUES('held')");
  const iterator = db.prepare("SELECT value FROM fixture_locked").iterate();
  iterator.next();
  let nativeLocked: unknown;
  try {
    db.exec("DROP TABLE fixture_locked");
  } catch (error) {
    nativeLocked = error;
  } finally {
    iterator.return?.();
  }
  assert.ok(nativeLocked instanceof Error);
  assert.equal((nativeLocked as { errcode?: number }).errcode! & 0xff, 6);
  const nativeExec = db.exec.bind(db);
  let attempts = 0;
  t.mock.method(db, "exec", (sql: string) => {
    if (/^begin immediate$/i.test(sql)) {
      attempts++;
      throw nativeLocked;
    }
    nativeExec(sql);
  });
  const phases: string[] = [];
  const error = errorOf(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async (p) => {
          phases.push(p.phase);
        },
      }),
    ),
    "sql_failed",
  );
  assert.equal(error.cause, nativeLocked);
  assert.equal(attempts, 1);
  assert.deepEqual(phases, ["checking", "checking", "failed"]);
});

test("zero lock budget preserves explicit zero and returns exact BUSY cause without waiting", async (t) => {
  const db = memory(t);
  const busy = Object.assign(new Error("injected BUSY"), { errcode: 5 });
  let attempts = 0;
  t.mock.method(db, "prepare", (() => {
    attempts++;
    throw busy;
  }) as typeof db.prepare);
  const phases: SqliteMigrationProgress[] = [];
  const error = errorOf(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        lockWaitTimeoutMs: 0,
        onProgress: async (p) => {
          phases.push(p);
        },
      }),
    ),
    "lock_timeout",
  );
  assert.equal(error.message, "Timed out waiting for SQLite migration lock at :memory:");
  assert.equal(error.cause, busy);
  assert.equal(attempts, 1);
  assert.deepEqual(
    phases.map((p) => p.phase),
    ["checking", "failed"],
  );
  assert.equal(phases.at(-1)?.sqliteCode, 5);
});

test("one retry deadline includes progress time and checks expiry after the next BUSY, not as startup timeout", async (t) => {
  const db = memory(t);
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const busy = Object.assign(new Error("injected acquisition BUSY"), { errcode: 261 });
  let attempts = 0;
  t.mock.method(db, "prepare", (() => {
    attempts++;
    throw busy;
  }) as typeof db.prepare);
  const phases: SqliteMigrationProgress[] = [];
  const error = errorOf(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        lockWaitTimeoutMs: 50,
        onProgress: async (p) => {
          phases.push(p);
          if (p.phase === "checking") t.mock.timers.setTime(1040);
          if (p.phase === "waiting_for_lock") t.mock.timers.setTime(1060);
        },
      }),
    ),
    "lock_timeout",
  );
  assert.equal(error.cause, busy);
  assert.equal(attempts, 2, "a retry already scheduled before waiting callback is still attempted");
  assert.deepEqual(
    phases.map((p) => p.phase),
    ["checking", "waiting_for_lock", "failed"],
  );
  assert.equal(phases.at(-1)?.elapsedMs, 60);
});

test("successful acquisition beyond a zero budget is allowed and ledger timestamps use current clock", async (t) => {
  const db = memory(t);
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  let checking = 0;
  await runSqliteSessionMigrationsAsync(db, ":memory:", {
    lockWaitTimeoutMs: 0,
    onProgress: async (p) => {
      if (p.phase === "checking" && ++checking === 2) t.mock.timers.setTime(2000);
    },
  });
  assert.equal(ledger(db).length, 22);
  assert.ok(ledger(db).every((row) => row.time_applied === 2000));
  assert.equal(db.isTransaction, false);
});

test("public async ready rejection closes the unpublished connection after durable commit", async (t) => {
  const f = files(t);
  const reason = { sentinel: "ready transport" };
  const nativeClose = DatabaseSync.prototype.close;
  const closed: DatabaseSync[] = [];
  t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    closed.push(this);
    return nativeClose.call(this);
  });
  assert.equal(
    await rejection(
      SqliteSessionStore.openStartup(
        { dbPath: f.path },
        {
          onProgress: async (p) => {
            if (p.phase === "ready") throw reason;
          },
        },
      ),
    ),
    reason,
  );
  assert.equal(closed.length, 1);
  assert.equal(closed[0]?.isOpen, false);
  assert.equal(ledger(f.open()).length, 22);
});

test("injected initial busy-timeout failure occurs before progress and retains its native identity", async (t) => {
  const db = memory(t);
  const cause = Object.assign(new Error("fixture initial pragma failed"), { errcode: 10 });
  let execs = 0;
  let notifications = 0;
  t.mock.method(db, "exec", () => {
    execs++;
    throw cause;
  });
  assert.equal(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async () => {
          notifications++;
        },
      }),
    ),
    cause,
  );
  assert.equal(execs, 1);
  assert.equal(notifications, 0);
});

test("injected timeout-reset failure does not replace an undefined original progress rejection", async (t) => {
  const db = memory(t);
  const nativeExec = db.exec.bind(db);
  t.mock.method(db, "exec", (sql: string) => {
    if (/busy_timeout\s*=\s*5000/i.test(sql)) throw new Error("fixture reset failure");
    nativeExec(sql);
  });
  assert.equal(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async (p) => {
          if (p.phase === "migrating") throw undefined;
        },
      }),
    ),
    undefined,
  );
  assert.equal(db.isTransaction, false);
  assert.equal(hasLedger(db), false);
});
