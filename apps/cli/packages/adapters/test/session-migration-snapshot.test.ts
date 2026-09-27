import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { createSessionMigrationSnapshot } from "../src/storage/session-store/migration-snapshot.js";
import { SqliteSessionMigrationError } from "../src/storage/session-store/errors.js";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "knorvia-session-snapshot-"));
  const path = join(root, "sessions.sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES('history')");
  t.after(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, path, db };
}

test("Agent same-millisecond snapshots cannot overwrite earlier files or occupied directories", (t) => {
  const { db, path } = fixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-02T03:04:05.678Z") });
  const base = `${path}.pre-unversioned.20260102T030405678Z.bak`;
  createSessionMigrationSnapshot(db, path);
  const original = readFileSync(base);
  db.exec("UPDATE retained SET value='later history'");
  createSessionMigrationSnapshot(db, path);
  assert.deepEqual(readFileSync(base), original);
  const latest = new DatabaseSync(`${base}-1`, { readOnly: true });
  try {
    assert.equal(latest.prepare("SELECT value FROM retained").get()?.value, "later history");
  } finally {
    latest.close();
  }
  mkdirSync(`${base}-2`);
  writeFileSync(join(`${base}-2`, "keep"), "not owned by snapshot");
  assert.throws(
    () => createSessionMigrationSnapshot(db, path),
    (error: unknown) =>
      error instanceof SqliteSessionMigrationError && error.kind === "backup_failed",
  );
  assert.equal(readFileSync(join(`${base}-2`, "keep"), "utf8"), "not owned by snapshot");
  assert.deepEqual(readFileSync(base), original);
});

test("Agent snapshot failure removes only its own partial file and preserves first cause", (t) => {
  const { db, path, root } = fixture(t);
  const before = readFileSync(path);
  const old = `${path}.pre-previous.bak`;
  writeFileSync(old, "previous recovery point");
  const prepare = db.prepare.bind(db);
  const cause = Object.assign(new Error("fixture full disk after partial write"), {
    code: "ENOSPC",
  });
  t.mock.method(db, "prepare", ((sql: string) => {
    if (sql === "VACUUM INTO ?")
      return {
        run: (target: string) => {
          writeFileSync(target, "incomplete snapshot");
          throw cause;
        },
      };
    return prepare(sql);
  }) as typeof db.prepare);
  assert.throws(
    () => createSessionMigrationSnapshot(db, path),
    (error: unknown) =>
      error instanceof SqliteSessionMigrationError &&
      error.kind === "backup_failed" &&
      error.cause === cause,
  );
  assert.deepEqual(readdirSync(root).sort(), [
    "sessions.sqlite",
    "sessions.sqlite.pre-previous.bak",
  ]);
  assert.deepEqual(readFileSync(path), before);
  assert.equal(readFileSync(old, "utf8"), "previous recovery point");
});
