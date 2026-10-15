// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 升级前的库快照：用 VACUUM INTO 写出一份 .bak，供回滚使用。
//
// 命名与占用：
// 一、文件名形如 `<库路径>.pre-<migrationId>-<时间戳>.bak`；时间戳去掉分隔符便于排序。
// 二、同名冲突时按 -1、-2 … 顺序试到 MAX_SNAPSHOT_SUFFIX，仍不行即放弃升级。
// 三、目标必须由本次调用以 wx 独占创建成功，才允许在失败时清理它。
//
// 失败语义：
// 四、SQLITE_BUSY 原样上抛（调用方要识别「忙」并重试），其余包成迁移错误并带上库路径。
// 五、清理失败不覆盖原始错因；其它调用已占用的快照不会被本函数删除。

import { closeSync, openSync, statSync, unlinkSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { SqliteSessionMigrationError } from "./errors.js";
import { isSqliteBusy } from "./migration-native-error.js";

const MAX_SNAPSHOT_SUFFIX = 100;
const SNAPSHOT_FILE_MODE = 0o600;
const LEDGER_PROBE_SQL = `
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'
  `;
const LEDGER_TAIL_SQL = "SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1";
const EEXIST_CODE = "EEXIST";

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false;
  return typeof value === "object";
}

function isAlreadyExists(cause: unknown): boolean {
  return isRecord(cause) && (cause as { code?: unknown }).code === EEXIST_CODE;
}

/** 独占创建目标：EEXIST 返回 undefined（换下一个后缀），其它错误照抛。 */
function reserveSnapshotFile(snapshotPath: string): number | undefined {
  try {
    return openSync(snapshotPath, "wx", SNAPSHOT_FILE_MODE);
  } catch (cause) {
    if (isAlreadyExists(cause)) return undefined;
    throw cause;
  }
}

/** 复用同名后缀前的检查：目标存在但不是常规文件时必须停下，避免覆盖目录等对象。 */
function assertFreeOrFile(snapshotPath: string): void {
  const existing = statSync(snapshotPath, { throwIfNoEntry: false });
  if (existing === undefined) return;
  if (!existing.isFile()) throw new Error("Snapshot destination is not a file");
}

/** 当前库的迁移位点；没有台账表时记作 unversioned。 */
function currentMigrationId(db: DatabaseSync): string {
  const hasLedger = db.prepare(LEDGER_PROBE_SQL).get() !== undefined;
  const baseline = hasLedger ? db.prepare(LEDGER_TAIL_SQL).get() : undefined;
  return String(baseline?.id ?? "unversioned");
}

function cleanupOwnedSnapshot(snapshotPath: string): void {
  try {
    unlinkSync(snapshotPath);
  } catch {
    /* 保留预留或复制的首因。 */
  }
}

export function createSessionMigrationSnapshot(db: DatabaseSync, dbPath: string): void {
  if (!db.location()) return;
  const migrationId = currentMigrationId(db);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const basePath = `${dbPath}.pre-${migrationId}.${stamp}.bak`;
  let snapshotPath = basePath;
  let ownsTarget = false;

  try {
    for (let suffix = 0; suffix <= MAX_SNAPSHOT_SUFFIX; suffix++) {
      snapshotPath = suffix === 0 ? basePath : `${basePath}-${suffix}`;
      assertFreeOrFile(snapshotPath);
      const handle = reserveSnapshotFile(snapshotPath);
      if (handle === undefined) continue;
      ownsTarget = true;
      closeSync(handle);
      db.prepare("VACUUM INTO ?").run(snapshotPath);
      return;
    }
    throw new Error("Snapshot name limit reached");
  } catch (cause) {
    // 只有独占创建成功的目标属于本次调用；关闭失败也不能清理其他快照。
    if (ownsTarget) cleanupOwnedSnapshot(snapshotPath);
    if (isSqliteBusy(cause)) throw cause;
    throw new SqliteSessionMigrationError(
      `Session migration backup failed; upgrade stopped: ${snapshotPath}`,
      { cause, dbPath, kind: "backup_failed", snapshotPath },
    );
  }
}
