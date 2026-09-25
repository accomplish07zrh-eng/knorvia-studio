import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { runTasksDatabaseMigrations } from "../../src/session/tasksDatabase/migrations.js";

/**
 * 上一版本本地数据的脱敏夹具生成器（见 specs/knorvia-upgrade-protection.md）。
 * 夹具内容与真实历史形状一致，但不含任何真实用户数据：
 * - Studio 主库：直接按冻结的 v1 表结构写入，user_version=1；
 * - 任务索引：先用当前冻结算本建库，再退回上一版本状态（掉掉 0005 新增列、删掉 0003/0004/0005 账本行），
 *   因为 0003/0004 只改数据、0005 只加一列，所以这个形状与真实的 0001+0002 版本一致。
 * 夹具是可复现的派生数据，不入库二进制文件；调用方必须写到临时目录，避免改动夹具源。
 */

interface StudioEntityRow {
  kind: string;
  id: string;
  scope: string;
  sequence: number;
  value: unknown;
}

interface PreviousReleaseFixture {
  studio: { userVersion: number; meta: Record<string, string>; entities: StudioEntityRow[] };
  tasksIndex: {
    pendingFrom: string[];
    tasks: Array<Record<string, FixtureValue>>;
    automations: Array<Record<string, FixtureValue>>;
    automationRuns: Array<Record<string, FixtureValue>>;
    offPeakTasks: Array<Record<string, FixtureValue>>;
  };
}

type FixtureValue = string | number | null;

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "previous-release-data.json");

export function readPreviousReleaseFixture(): PreviousReleaseFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as PreviousReleaseFixture;
}

/** 冻结的 v1 表结构：新版构造器在其上做 1→2 迁移，夹具不自带新版索引。 */
const STUDIO_V1_SCHEMA = `
  CREATE TABLE studio_entities (
    kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
    value TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(kind,id)
  );
  CREATE TABLE studio_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function writeStudioPreviousReleaseFixture(path: string): void {
  const { studio } = readPreviousReleaseFixture();
  const db = new DatabaseSync(path);
  try {
    db.exec(STUDIO_V1_SCHEMA);
    const insertEntity = db.prepare("INSERT INTO studio_entities VALUES (?,?,?,?,?)");
    for (const entity of studio.entities)
      insertEntity.run(
        entity.kind,
        entity.id,
        entity.scope,
        JSON.stringify(entity.value),
        entity.sequence,
      );
    const insertMeta = db.prepare("INSERT INTO studio_meta VALUES (?,?)");
    for (const [key, value] of Object.entries(studio.meta)) insertMeta.run(key, value);
    db.exec(`PRAGMA user_version=${studio.userVersion}`);
  } finally {
    db.close();
  }
}

function insertRows(
  db: DatabaseSync,
  table: string,
  rows: Array<Record<string, FixtureValue>>,
): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    ).run(...columns.map((column) => row[column]));
  }
}

export function writeTasksIndexPreviousReleaseFixture(path: string): void {
  const { tasksIndex } = readPreviousReleaseFixture();
  const db = new DatabaseSync(path);
  try {
    runTasksDatabaseMigrations(db);
    db.exec("ALTER TABLE automations DROP COLUMN studio_workflow_id");
    const removeLedgerRow = db.prepare("DELETE FROM tasks_schema_migration WHERE id=?");
    for (const id of tasksIndex.pendingFrom) removeLedgerRow.run(id);
    insertRows(db, "tasks", tasksIndex.tasks);
    insertRows(db, "automations", tasksIndex.automations);
    insertRows(db, "automation_runs", tasksIndex.automationRuns);
    insertRows(db, "off_peak_tasks", tasksIndex.offPeakTasks);
  } finally {
    db.close();
  }
}

export function generatePreviousReleaseFixtures(targetDirectory: string): {
  studio: string;
  tasksIndex: string;
} {
  mkdirSync(targetDirectory, { recursive: true });
  const studio = join(targetDirectory, "studio-previous-release.sqlite");
  const tasksIndex = join(targetDirectory, "tasks-index-previous-release.sqlite");
  writeStudioPreviousReleaseFixture(studio);
  writeTasksIndexPreviousReleaseFixture(tasksIndex);
  return { studio, tasksIndex };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fixturePath), "out");
  const fixtures = generatePreviousReleaseFixtures(target);
  process.stdout.write(`studio fixture: ${fixtures.studio}\n`);
  process.stdout.write(`tasks index fixture: ${fixtures.tasksIndex}\n`);
}
