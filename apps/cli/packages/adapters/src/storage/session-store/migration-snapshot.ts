// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { closeSync, openSync, statSync, unlinkSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { SqliteSessionMigrationError } from "./errors.js";
import { isSqliteBusy } from "./migration-native-error.js";

const MAX_SNAPSHOT_SUFFIX = 100;
const SNAPSHOT_FILE_MODE = 0o600;

export function createSessionMigrationSnapshot(db: DatabaseSync, dbPath: string): void {
  if (!db.location()) return;
  const hasLedger =
    db
      .prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'
  `)
      .get() !== undefined;
  const baseline = hasLedger
    ? db.prepare("SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1").get()
    : undefined;
  const migrationId = String(baseline?.id ?? "unversioned");
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const basePath = `${dbPath}.pre-${migrationId}.${timestamp}.bak`;
  let snapshotPath = basePath;
  let ownsTarget = false;

  try {
    for (let suffix = 0; suffix <= MAX_SNAPSHOT_SUFFIX; suffix++) {
      snapshotPath = suffix === 0 ? basePath : `${basePath}-${suffix}`;
      const existing = statSync(snapshotPath, { throwIfNoEntry: false });
      if (existing !== undefined) {
        if (!existing.isFile()) throw new Error("Snapshot destination is not a file");
      }
      let descriptor: number;
      try {
        descriptor = openSync(snapshotPath, "wx", SNAPSHOT_FILE_MODE);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: unknown }).code === "EEXIST"
        )
          continue;
        throw error;
      }
      ownsTarget = true;
      closeSync(descriptor);
      db.prepare("VACUUM INTO ?").run(snapshotPath);
      return;
    }
    throw new Error("Snapshot name limit reached");
  } catch (cause) {
    // 只有独占创建成功的目标属于本次调用；关闭失败也不能清理其他快照。
    if (ownsTarget) {
      try {
        unlinkSync(snapshotPath);
      } catch {
        /* 保留预留或复制的首因。 */
      }
    }
    if (isSqliteBusy(cause)) throw cause;
    throw new SqliteSessionMigrationError(
      `Session migration backup failed; upgrade stopped: ${snapshotPath}`,
      { cause, dbPath, kind: "backup_failed", snapshotPath },
    );
  }
}
