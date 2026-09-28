// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type { PermissionRuleset, ProjectId } from "@knorvia/contracts";
import { SQLITE_MIGRATIONS } from "../src/storage/session-store/migrations.js";

export const projectID = "permission-fixture" as ProjectId;
export function initializePermissionTables(db: DatabaseSync): void {
  for (const migration of SQLITE_MIGRATIONS.slice(0, 2)) db.exec(migration.sql);
}
export function memoryPermissions(t: TestContext): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializePermissionTables(db);
  t.after(() => {
    if (db.isOpen) db.close();
  });
  return db;
}
export async function diskPermissions(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-permission-atomic-"));
  const path = join(root, "fixture.sqlite");
  const db = new DatabaseSync(path);
  initializePermissionTables(db);
  db.exec("PRAGMA journal_mode=WAL");
  const releases: (() => Promise<void>)[] = [];
  t.after(async () => {
    for (const release of releases.reverse()) await release();
    if (db.isOpen) db.close();
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("knorvia-permission-atomic-"));
    await rm(root, { recursive: true, force: true });
  });
  return { db, path, beforeCleanup: (release: () => Promise<void>) => releases.push(release) };
}
export function rules(...names: string[]): PermissionRuleset {
  return { version: 1, allow: names.map((toolName) => ({ toolName })) };
}
export function localRow(db: DatabaseSync) {
  return db
    .prepare(
      "SELECT * FROM local_setting WHERE scope='project' AND scope_id=? AND namespace='permission' AND key='ruleset'",
    )
    .get(projectID);
}
export function writeLegacy(db: DatabaseSync, value: unknown): void {
  db.prepare("INSERT INTO permission VALUES (?, 1, 1, ?)").run(projectID, JSON.stringify(value));
}
export function writeLocal(db: DatabaseSync, value: string): void {
  db.prepare(
    "INSERT INTO local_setting VALUES ('project', ?, 'permission', 'ruleset', ?, 1, 1, 1)",
  ).run(projectID, value);
}
