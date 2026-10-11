// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：会话存储迁移与 barrel（B1–B17、B122–B124、B134）。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { load, repoRoot } from "./entry.mjs";

const migrationsModule = await load("storage/session-store/migrations");
const barrel = await load("storage/session-store");
const optionsModule = await load("storage/session-store/options");
const rowsModule = await load("storage/session-store/rows");
const migration0020 = await load("storage/session-store/migrations/0020-provider-model-selection");
const migration0021 = await load("storage/session-store/migrations/0021-official-glm-selection");
const migration0022 = await load(
  "storage/session-store/migrations/0022-backfilled-session-reasoning",
);

const fixtureDir = join(repoRoot, "specs/contracts/apps-cli-packages-01/fixtures/session-store");
const ledgerFixture = JSON.parse(await readFile(join(fixtureDir, "ledger-checksums.json"), "utf8"));
const oldWrite = JSON.parse(await readFile(join(fixtureDir, "old-write.json"), "utf8"));

const checksum = (sql) => createHash("sha256").update(sql.trim()).digest("hex");

async function tempDbPath(t) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-contract-session-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return join(directory, "sessions.sqlite");
}

test("B1/B2/B123 迁移账本是追加式、有序、按 checksum 记账的冻结文本", () => {
  const entries = migrationsModule.SQLITE_MIGRATIONS;
  assert.equal(entries.length, ledgerFixture.count);
  const ids = entries.map((entry) => entry.id);
  assert.deepEqual(
    ids,
    ledgerFixture.entries.map((entry) => entry.id),
  );
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^\d{4}_[a-z0-9_]+$/u);
  assert.deepEqual(ids.slice().sort(), ids);
  const sqlTexts = entries.map((entry) => entry.sql);
  assert.equal(new Set(sqlTexts).size, sqlTexts.length);
  for (const entry of entries) {
    assert.equal(typeof entry.appVersion, "string");
    assert.equal(entry.sql.trim().length > 0, true);
  }
  assert.deepEqual(
    entries.map((entry) => ({
      appVersion: entry.appVersion,
      checksum: checksum(entry.sql),
      id: entry.id,
    })),
    ledgerFixture.entries,
  );
});

test("B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）", () => {
  const byId = new Map(migrationsModule.SQLITE_MIGRATIONS.map((entry) => [entry.id, entry]));
  const base = byId.get("0001_base_session_store");
  assert.equal(base.sql.includes("create table if not exists session"), true);
  assert.equal(base.sql.includes("session_project_idx"), true);
  assert.equal(base.sql.includes("create index if not exists session_workspace_idx"), true);
  const localSetting = byId.get("0002_local_setting");
  assert.equal(localSetting.sql.includes("create table if not exists local_setting"), true);
  const dwf = byId.get("0019_dwf_journal");
  assert.equal(dwf.sql.includes("dwf_event"), true);
  assert.equal(dwf.sql.includes("dwf_event_artifact_idx"), true);
  assert.equal(byId.has("0004_session_target"), true);
  assert.equal(byId.has("0005_session_target_accounting"), true);
  assert.equal(byId.has("0014_message_part_sequence"), true);
  assert.equal(byId.has("0015_message_part_sequence_backfill_and_guard"), true);
  assert.equal(byId.has("0016_session_input_ledger"), true);
  assert.equal(byId.has("0017_session_input_start_now_delivery"), true);
  assert.equal(byId.has("0018_session_input_failed_status"), true);
});

test("B11/B12/B13 三条冻结迁移引用各自的常量", () => {
  const byId = new Map(migrationsModule.SQLITE_MIGRATIONS.map((entry) => [entry.id, entry]));
  assert.equal(
    byId.get("0020_provider_model_selection").sql,
    migration0020.PROVIDER_MODEL_SELECTION_MIGRATION_SQL,
  );
  assert.equal(
    byId.get("0021_official_glm_selection").sql,
    migration0021.OFFICIAL_GLM_SELECTION_MIGRATION_SQL,
  );
  assert.equal(
    byId.get("0022_backfilled_session_reasoning").sql,
    migration0022.BACKFILLED_SESSION_REASONING_MIGRATION_SQL,
  );
  for (const sql of [
    migration0020.PROVIDER_MODEL_SELECTION_MIGRATION_SQL,
    migration0021.OFFICIAL_GLM_SELECTION_MIGRATION_SQL,
    migration0022.BACKFILLED_SESSION_REASONING_MIGRATION_SQL,
  ]) {
    assert.equal(typeof sql, "string");
    assert.equal(sql.trim().length > 0, true);
  }
});

test("B14/B15 类型模块与 barrel 的兼容面", async (t) => {
  // options.ts / rows.ts 是纯类型模块（运行时零导出）：没有可被桩替换破坏的运行时行为，
  // 这两条是唯一「桩替换后形状断言仍成立」的条目，已在 known-differences.md 记录；同一测试
  // 里的账本与 barrel 断言在桩替换下必定失败，因此本文件仍然贡献失败用例。
  assert.deepEqual(Object.keys(optionsModule), []);
  assert.deepEqual(Object.keys(rowsModule), []);
  assert.equal(migrationsModule.SQLITE_MIGRATIONS.length > 0, true);
  assert.deepEqual(Object.keys(barrel).sort(), [
    "SqliteSessionMigrationError",
    "SqliteSessionStore",
    "createDwfJournalStore",
    "createSqliteSessionStore",
    "getDefaultSessionDbPath",
    "openStartupSqliteSessionStore",
  ]);
  assert.equal(typeof barrel.SqliteSessionStore, "function");
  assert.equal(typeof barrel.createSqliteSessionStore, "function");
  assert.equal(typeof barrel.openStartupSqliteSessionStore, "function");
  assert.equal(typeof barrel.getDefaultSessionDbPath, "function");
  assert.equal(typeof barrel.createDwfJournalStore, "function");
  assert.equal(barrel.SQLITE_MIGRATIONS, undefined);
  const dbPath = await tempDbPath(t);
  const store = new barrel.SqliteSessionStore({ dbPath });
  try {
    assert.equal(store.getDatabasePath(), dbPath);
  } finally {
    store.close();
  }
});

test("B122 夹具脱敏：只含合成占位值", async () => {
  const names = (await readdir(fixtureDir)).sort();
  assert.deepEqual(names, ["ledger-checksums.json", "old-write.json"]);
  const files = await Promise.all(names.map((name) => readFile(join(fixtureDir, name), "utf8")));
  const joined = files.join("\n");
  for (const forbidden of [
    "Bearer ",
    "password\u003a",
    "api_key",
    "secret",
    "https://",
    "http://",
    "C:\\Users\\",
    "/home/",
    "@gmail",
  ]) {
    assert.equal(joined.includes(forbidden), false, `夹具不得出现 ${forbidden}`);
  }
  assert.equal(ledgerFixture.synthetic, true);
  assert.equal(oldWrite.synthetic, true);
  assert.equal(oldWrite.localSetting.scopeId, "fixture-project");
  assert.equal(migrationsModule.SQLITE_MIGRATIONS.length, ledgerFixture.count);
});

test("B17/B124 旧写 → 新读 → 新写 → 旧读 往返", async (t) => {
  const dbPath = await tempDbPath(t);
  const entries = migrationsModule.SQLITE_MIGRATIONS;
  const upToIndex = entries.findIndex((entry) => entry.id === oldWrite.upToMigrationId);
  assert.equal(upToIndex >= 0, true);
  const oldEntries = entries.slice(0, upToIndex + 1);

  // 1) 旧写：手写旧版 schema（只到冻结切片）+ 一行旧数据，全部是合成占位值。
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(
    "CREATE TABLE IF NOT EXISTS schema_migration (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, app_version TEXT, time_applied INTEGER NOT NULL)",
  );
  for (const entry of oldEntries) {
    legacy.exec(entry.sql);
    legacy
      .prepare(
        "INSERT INTO schema_migration (id, checksum, app_version, time_applied) VALUES (?, ?, ?, ?)",
      )
      .run(entry.id, checksum(entry.sql), entry.appVersion, 1);
  }
  const setting = oldWrite.localSetting;
  legacy
    .prepare(
      "INSERT INTO local_setting (scope, scope_id, namespace, key, value, schema_version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      setting.scope,
      setting.scopeId,
      setting.namespace,
      setting.key,
      setting.valueJson,
      setting.schemaVersion,
      setting.timeCreated,
      setting.timeUpdated,
    );
  const oldSessionColumns = legacy
    .prepare("PRAGMA table_info(session)")
    .all()
    .map((row) => row.name);
  legacy.close();

  // 2) 新读：用公开入口打开旧库，只补跑剩余迁移。
  const store = new barrel.SqliteSessionStore({ dbPath });
  try {
    assert.equal(await store.getProjectPermissionMode(setting.scopeId), setting.value);
    const reader = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(
        reader.prepare("SELECT count(*) AS total FROM schema_migration").get().total,
        entries.length,
      );
      assert.deepEqual(
        reader
          .prepare("SELECT id FROM schema_migration ORDER BY id")
          .all()
          .map((row) => row.id),
        entries.map((entry) => entry.id),
      );
      const newSessionColumns = reader
        .prepare("PRAGMA table_info(session)")
        .all()
        .map((row) => row.name);
      for (const column of oldSessionColumns)
        assert.equal(newSessionColumns.includes(column), true, `旧列 ${column} 必须保留`);
      const triggers = reader
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all();
      assert.equal(triggers.length > 0, true);
    } finally {
      reader.close();
    }

    // 3) 新写：同一公开入口写一条新数据。
    assert.equal(
      await store.saveProjectPermissionMode({
        projectID: oldWrite.newWriteProjectId,
        mode: oldWrite.newWriteMode,
      }),
      oldWrite.newWriteMode,
    );
  } finally {
    store.close();
  }

  // 4) 旧读：关掉 store 后用 node:sqlite 直接读原始表，旧行未变、新行可读、旧列仍在。
  const reader = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const oldRow = reader
      .prepare(
        "SELECT value FROM local_setting WHERE scope = ? AND scope_id = ? AND namespace = ? AND key = ?",
      )
      .get(setting.scope, setting.scopeId, setting.namespace, setting.key);
    assert.equal(oldRow.value, setting.valueJson);
    const newRow = reader
      .prepare(
        "SELECT value FROM local_setting WHERE scope = ? AND scope_id = ? AND namespace = ? AND key = ?",
      )
      .get(setting.scope, oldWrite.newWriteProjectId, setting.namespace, setting.key);
    assert.equal(newRow.value, JSON.stringify({ mode: oldWrite.newWriteMode }));
    const columns = reader
      .prepare("PRAGMA table_info(local_setting)")
      .all()
      .map((row) => row.name);
    for (const column of [
      "scope",
      "scope_id",
      "namespace",
      "key",
      "value",
      "schema_version",
      "time_created",
      "time_updated",
    ]) {
      assert.equal(columns.includes(column), true);
    }
  } finally {
    reader.close();
  }

  // 再打开一次：迁移已完成，账本不变（幂等）。
  const reopened = new barrel.SqliteSessionStore({ dbPath });
  try {
    const checker = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(
        checker.prepare("SELECT count(*) AS total FROM schema_migration").get().total,
        entries.length,
      );
    } finally {
      checker.close();
    }
  } finally {
    reopened.close();
  }
});

test("B16/B134 会话存储 barrel 的兼容面", async (t) => {
  assert.deepEqual(Object.keys(barrel).sort(), [
    "SqliteSessionMigrationError",
    "SqliteSessionStore",
    "createDwfJournalStore",
    "createSqliteSessionStore",
    "getDefaultSessionDbPath",
    "openStartupSqliteSessionStore",
  ]);
  assert.equal(typeof barrel.SqliteSessionStore, "function");
  assert.equal(typeof barrel.createSqliteSessionStore, "function");
  assert.equal(typeof barrel.openStartupSqliteSessionStore, "function");
  assert.equal(typeof barrel.getDefaultSessionDbPath, "function");
  assert.equal(typeof barrel.createDwfJournalStore, "function");
  assert.equal(barrel.SQLITE_MIGRATIONS, undefined);
  const dbPath = await tempDbPath(t);
  const store = new barrel.SqliteSessionStore({ dbPath });
  try {
    assert.equal(store.getDatabasePath(), dbPath);
  } finally {
    store.close();
  }
});

test("B122 夹具目录不进入契约测试的临时状态", async (t) => {
  const dbPath = await tempDbPath(t);
  const store = new barrel.SqliteSessionStore({ dbPath });
  try {
    assert.equal(store.getDatabasePath(), dbPath);
  } finally {
    store.close();
  }
  await assert.rejects(
    () =>
      readFile(
        join(
          repoRoot,
          "specs/contracts/apps-cli-packages-01/fixtures/session-store/real-user-db.sqlite",
        ),
      ),
    (error) => error.code === "ENOENT",
  );
});
