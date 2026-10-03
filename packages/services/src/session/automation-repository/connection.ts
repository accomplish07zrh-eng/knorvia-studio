import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { getTasksIndexDatabasePath } from "#src/paths.js";
import { isTasksStorageMigrated } from "#src/session/tasksDatabase/prepared.js";
import { runTasksDatabaseMigrations } from "#src/session/tasksDatabase/migrations.js";
import { sql } from "./sql.js";
import type { AutomationRow } from "./rows.js";

export class Connection {
  private db: DatabaseSync | null = null;
  private boundPath: string | null = null;
  private ready: Promise<void> | null = null;
  private readonly override: string | null;
  constructor(
    dbPath?: string,
    private readonly startupBusyTimeoutMs = 5000,
  ) {
    this.override = dbPath?.trim() || null;
  }
  async ensureReady(): Promise<void> {
    const path = this.override ?? getTasksIndexDatabasePath();
    if (this.boundPath && this.boundPath !== path) this.close();
    if (!this.ready) {
      this.ready = this.initialize(path).catch((error: unknown) => {
        this.close();
        throw error;
      });
    }
    await this.ready;
  }
  private async initialize(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (!this.db) {
      const { DatabaseSync: NativeDatabase } = createRequire(import.meta.url)("node:sqlite") as {
        DatabaseSync: new (filename: string) => DatabaseSync;
      };
      this.db = new NativeDatabase(path);
      this.boundPath = path;
      this.db.exec(`PRAGMA busy_timeout = ${this.startupBusyTimeoutMs}`);
    }
    if (!isTasksStorageMigrated(path, this.db)) runTasksDatabaseMigrations(this.db);
    this.db.exec(sql.wal);
    this.db.exec(sql.normal);
  }
  close(options?: { throwOnError?: boolean }): void {
    let closeError: unknown;
    try {
      this.db?.close();
    } catch (error) {
      closeError = error;
    } finally {
      this.db = null;
      this.boundPath = null;
      this.ready = null;
    }
    if (options?.throwOnError && closeError) throw closeError;
  }
  database(): DatabaseSync {
    if (!this.db) throw new Error("AutomationRepo 未初始化：请先 await ensureReady()");
    return this.db;
  }
}
export function readAutomation(
  db: DatabaseSync,
  id: string,
  workspaceKey?: string,
): AutomationRow | null {
  const row = db.prepare(sql.read).get({ id, workspace_key: workspaceKey ?? null });
  return row === undefined ? null : (row as AutomationRow);
}
export function transaction<T>(db: DatabaseSync, body: () => T): T {
  db.exec(sql.begin);
  try {
    const result = body();
    db.exec(sql.commit);
    return result;
  } catch (error) {
    db.exec(sql.rollback);
    throw error;
  }
}
