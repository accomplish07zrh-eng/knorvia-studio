import { copyFileSync, existsSync, rmSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

/**
 * 迁移前快照。两个 Studio 本地库（Studio 主库、任务索引）共用同一套规则：
 * 先落一份一致快照，再进入写事务；快照写不出就停止迁移。
 * 详见 specs/knorvia-upgrade-protection.md。
 */
export type SqliteSnapshotFailure = Error & {
  kind: "backup_failed";
  databasePath: string;
  snapshotPath: string;
};

/** 备份名可预测，便于人工恢复：<库文件>.pre-<起点标识>.<UTC 时间戳>.bak。 */
export function sqliteSnapshotPath(databasePath: string, label: string, now: number): string {
  // 时间戳去掉 Windows 文件名不允许的冒号；仍保持 UTC 且按名字可排序。
  const stamp = new Date(now).toISOString().replace(/[-:.]/gu, "");
  return `${databasePath}.pre-${label}.${stamp}.bak`;
}

/** 已存在的备份一律不覆盖：同毫秒重复调用顺延编号；被非文件占用则交给 SQLite 报错。 */
function availableSnapshotPath(base: string): string {
  let target = base;
  for (let attempt = 1; attempt <= 100; attempt++) {
    const entry = statSync(target, { throwIfNoEntry: false });
    if (!entry || !entry.isFile()) return target;
    target = `${base}-${attempt}`;
  }
  return target;
}

/**
 * 用 VACUUM INTO 写出一致快照后返回备份路径。
 * 不能用复制主库文件代替：WAL 生效时 .sqlite 单文件不是最新已提交状态。
 */
export function createSqliteSnapshot(
  db: DatabaseSync,
  databasePath: string,
  label: string,
  now: number = Date.now(),
): string {
  const snapshotPath = availableSnapshotPath(sqliteSnapshotPath(databasePath, label, now));
  try {
    db.prepare("VACUUM INTO ?").run(snapshotPath);
    if (!existsSync(snapshotPath)) throw new Error("快照文件未生成");
  } catch (error) {
    // 备份失败必须停机：不删除原库、不改版本、不继续迁移，交由调用方放弃本次启动。
    const failure: SqliteSnapshotFailure = Object.assign(
      new Error(`迁移前备份失败，已停止升级：无法写出 ${snapshotPath}`, { cause: error }),
      { kind: "backup_failed" as const, databasePath, snapshotPath },
    );
    throw failure;
  }
  return snapshotPath;
}

/** 恢复流程：调用前必须关闭所有连接；先清掉旧 WAL/SHM，避免旧快照与残留 WAL 混用。 */
export function restoreSqliteSnapshot(snapshotPath: string, databasePath: string): void {
  if (!existsSync(snapshotPath)) throw new Error(`备份不存在，无法恢复：${snapshotPath}`);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  copyFileSync(snapshotPath, databasePath);
}
