// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { SqliteSessionStore, SqliteSessionMigrationError } from "./session-bootstrap.target.js";

const FIXTURE_PARENT = resolve(tmpdir());
export const WORKSPACE = dirname(fileURLToPath(import.meta.url));
export const CATALOG = JSON.parse(
  readFileSync(join(WORKSPACE, "session-bootstrap-catalog.json"), "utf8"),
) as {
  index: number;
  id: string;
  appVersion: string;
  sqlTrimSha256: string;
}[];
export const LAST_ID = CATALOG.at(-1)!.id;

export function connection(store: SqliteSessionStore): DatabaseSync {
  // Inspection only: all startup work still enters through the public constructor/factory.
  return (store as unknown as { db: DatabaseSync }).db;
}

export function files(t: TestContext) {
  const root = mkdtempSync(join(FIXTURE_PARENT, "knorvia-storage-bootstrap-"));
  const handles: DatabaseSync[] = [];
  t.after(() => {
    for (const db of handles) if (db.isOpen) db.close();
    const absolute = resolve(root);
    assert.equal(dirname(absolute), FIXTURE_PARENT);
    assert.ok(absolute.startsWith(FIXTURE_PARENT + sep));
    assert.ok(absolute.startsWith(join(FIXTURE_PARENT, "knorvia-storage-bootstrap-")));
    rmSync(absolute, { recursive: true, force: true });
  });
  return {
    root,
    path: join(root, "sessions.sqlite"),
    open(path = join(root, "sessions.sqlite"), readOnly = false) {
      const db = new DatabaseSync(path, { readOnly });
      handles.push(db);
      return db;
    },
    track(store: SqliteSessionStore) {
      handles.push(connection(store));
      return store;
    },
    backups() {
      return readdirSync(root).filter((name) => name.includes(".pre-"));
    },
  };
}

export function memory(t: TestContext) {
  const db = new DatabaseSync(":memory:");
  t.after(() => {
    if (db.isOpen) db.close();
  });
  return db;
}

export function initialized(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  const db = connection(store);
  t.after(() => {
    if (db.isOpen) store.close();
  });
  return db;
}

export function ledger(db: DatabaseSync) {
  return db
    .prepare("SELECT id,checksum,app_version,time_applied FROM schema_migration ORDER BY rowid")
    .all()
    .map((row) => ({ ...row }));
}

export function hasLedger(db: DatabaseSync) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migration'").get();
}

export function createLedger(db: DatabaseSync) {
  db.exec(
    "CREATE TABLE schema_migration(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, app_version TEXT, time_applied INTEGER NOT NULL)",
  );
}

export function errorOf(error: unknown, kind: SqliteSessionMigrationError["kind"]) {
  assert.ok(error instanceof SqliteSessionMigrationError);
  assert.equal(error.kind, kind);
  return error;
}

export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  const result = await promise.then(
    () => ({ rejected: false, value: undefined }),
    (value: unknown) => ({ rejected: true, value }),
  );
  assert.equal(result.rejected, true, "expected rejection, including undefined/falsy reasons");
  return result.value;
}
