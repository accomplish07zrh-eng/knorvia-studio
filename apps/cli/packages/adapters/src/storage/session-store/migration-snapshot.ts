import { closeSync, openSync, rmSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { SqliteSessionMigrationError } from "./errors.js";

const MAX_SNAPSHOT_NAME_ATTEMPTS = 100;

/** Adapter owns file IO. SQLite includes committed WAL data; copying only the main file cannot. */
export function createSessionMigrationSnapshot(db: DatabaseSync, dbPath: string): void {
  if (!db.location()) return;
  const hasLedger = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
    .get();
  const baseline = hasLedger
    ? db.prepare("SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1").get()
    : undefined;
  // 调用方已验证全部编号属于冻结定义，不能把任意数据库内容拼到文件路径中。
  const label = baseline?.id ?? "unversioned";
  const stamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const base = `${dbPath}.pre-${label}.${stamp}.bak`;
  let snapshotPath = base;
  let reserved = false;
  try {
    for (let attempt = 0; ; attempt++) {
      const entry = statSync(snapshotPath, { throwIfNoEntry: false });
      if (entry && !entry.isFile()) throw new Error("Snapshot destination is not a file");
      try {
        // 独占预留零字节目标，VACUUM INTO 可写空文件；避免两个进程同毫秒覆盖回退点。
        const fd = openSync(snapshotPath, "wx", 0o600);
        reserved = true;
        closeSync(fd);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (attempt >= MAX_SNAPSHOT_NAME_ATTEMPTS) throw new Error("Snapshot name limit reached");
      snapshotPath = `${base}-${attempt + 1}`;
    }
    db.prepare("VACUUM INTO ?").run(snapshotPath);
  } catch (cause) {
    if (reserved) {
      try {
        // 只清理本次独占创建的未完成快照；失败文件不能冒充可恢复的备份。
        rmSync(snapshotPath);
      } catch {
        /* 清理失败不能掩盖导致备份失败的首因，原库仍不迁移。 */
      }
    }
    // BUSY 仍由 runner 的已有锁等待预算处理；其余失败不得切 WAL 或执行迁移。
    const code = (cause as { errcode?: number } | null)?.errcode;
    if (typeof code === "number" && (code & 0xff) === 5) throw cause;
    throw new SqliteSessionMigrationError(
      `Session migration backup failed; upgrade stopped: ${snapshotPath}`,
      { cause, dbPath, snapshotPath, kind: "backup_failed" },
    );
  }
}
