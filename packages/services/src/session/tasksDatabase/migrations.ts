import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { databaseMigrationIdSchema, type DatabaseMigrationFacts } from "@knorvia/shared";
import {
  TASK_INDEX_SCHEMA,
  AUTOMATION_SCHEMA,
  OFF_PEAK_SCHEMA,
} from "#src/session/tasksDatabase/schema-v1.js";
import { importLegacyAutomationSelections } from "#src/session/tasksDatabase/provider-selection-v2.js";
import { OFFICIAL_GLM_SELECTION_MIGRATION_SQL } from "#src/session/tasksDatabase/official-glm-selection-v3.js";
import { AGENT_IDENTITY_MIGRATION_SQL } from "#src/session/tasksDatabase/agent-identity-v4.js";
import { createSqliteSnapshot } from "#src/session/tasksDatabase/sqliteSnapshot.js";

const historicalColumns = [
  ["tasks", "title_overridden", "INTEGER NOT NULL DEFAULT 0"],
  ["tasks", "last_unread_at", "INTEGER NOT NULL DEFAULT 0"],
  ["tasks", "searchable_text", "TEXT NOT NULL DEFAULT ''"],
  ["tasks", "cron_automation_id", "TEXT"],
  ["tasks", "off_peak_task_id", "TEXT"],
  ["automations", "target_task_id", "TEXT"],
  ["automations", "bot_delivery_target", "TEXT"],
  ["automations", "mode", "TEXT"],
  ["automations", "end_at", "INTEGER"],
  ["automations", "schedule_rule", "TEXT"],
  ["automations", "schedule_edited_by_user", "INTEGER NOT NULL DEFAULT 0"],
  ["automations", "thought_level", "TEXT"],
  ["automations", "model_selection", "TEXT"],
  ["automations", "scheduled_run_count", "INTEGER NOT NULL DEFAULT 0"],
  ["automation_runs", "model_selection", "TEXT"],
  ["off_peak_tasks", "thought_level", "TEXT"],
  ["off_peak_tasks", "model_selection", "TEXT"],
  ["off_peak_tasks", "history_deleted_at", "INTEGER"],
] as const;
const secondaryIndexesSql =
  "\n  CREATE INDEX IF NOT EXISTS idx_tasks_cron_automation ON tasks(cron_automation_id, updated_at DESC)\n    WHERE cron_automation_id IS NOT NULL AND deleted=0;\n  CREATE INDEX IF NOT EXISTS idx_tasks_off_peak_task ON tasks(off_peak_task_id, updated_at DESC)\n    WHERE off_peak_task_id IS NOT NULL AND deleted=0;\n  CREATE INDEX IF NOT EXISTS idx_automations_target_task ON automations(target_task_id) WHERE target_task_id IS NOT NULL;\n";
const uniqueBoundIndexSql =
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_off_peak_bound_active ON off_peak_tasks(workspace_key,session_id) WHERE session_id IS NOT NULL AND status NOT IN ('completed','failed','cancelled')";
const duplicateBindingsSql =
  "SELECT 1 FROM off_peak_tasks WHERE session_id IS NOT NULL AND status NOT IN ('completed','failed','cancelled')\n    GROUP BY workspace_key, session_id HAVING count(*)>1 LIMIT 1";
const scheduledCountBackfillSql = "UPDATE automations SET scheduled_run_count=run_count";
const workflowScheduleSql = "ALTER TABLE automations ADD COLUMN studio_workflow_id TEXT";
const ledgerExistsSql =
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks_schema_migration'";
const allIdsSql = "SELECT id FROM tasks_schema_migration";
const latestIdSql = "SELECT id FROM tasks_schema_migration ORDER BY id DESC LIMIT 1";
const checksumSql = "SELECT checksum FROM tasks_schema_migration WHERE id=?";
const userTablesSql =
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT IN ('tasks_schema_migration', 'sqlite_sequence') LIMIT 1";
const createLedgerSql =
  "CREATE TABLE IF NOT EXISTS tasks_schema_migration (\n      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, time_applied INTEGER NOT NULL\n    )";
const insertLedgerSql = "INSERT INTO tasks_schema_migration VALUES(?,?,?)";

function adoptSchema(db: DatabaseSync): void {
  db.exec(TASK_INDEX_SCHEMA + AUTOMATION_SCHEMA + OFF_PEAK_SCHEMA);
  for (const [table, column, declaration] of historicalColumns) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((entry) => entry.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    if (table === "automations" && column === "scheduled_run_count") {
      db.exec(scheduledCountBackfillSql);
    }
  }
  db.exec(secondaryIndexesSql);
  if (!db.prepare(duplicateBindingsSql).get()) db.exec(uniqueBoundIndexSql);
}

const versions = [
  {
    id: "0001_adopt_task_schema",
    inputs: [
      TASK_INDEX_SCHEMA,
      AUTOMATION_SCHEMA,
      OFF_PEAK_SCHEMA,
      historicalColumns,
      secondaryIndexesSql,
      uniqueBoundIndexSql,
      "scheduled-count-backfill-v1",
    ],
    apply: adoptSchema,
  },
  {
    id: "0002_provider_selection",
    inputs: ["legacy-automation-selection-v1", "no-provider-for-legacy-off-peak-v1"],
    apply: importLegacyAutomationSelections,
  },
  {
    id: "0003_official_glm_selection",
    inputs: [OFFICIAL_GLM_SELECTION_MIGRATION_SQL],
    apply: (db: DatabaseSync) => db.exec(OFFICIAL_GLM_SELECTION_MIGRATION_SQL),
  },
  {
    id: "0004_agent_identity",
    inputs: [AGENT_IDENTITY_MIGRATION_SQL],
    apply: (db: DatabaseSync) => db.exec(AGENT_IDENTITY_MIGRATION_SQL),
  },
  {
    id: "0005_studio_workflow_schedule",
    inputs: [workflowScheduleSql],
    apply: (db: DatabaseSync) => db.exec(workflowScheduleSql),
  },
] as const;

function checksumFor(version: (typeof versions)[number]): string {
  return createHash("sha256").update(JSON.stringify(version.inputs)).digest("hex");
}

function verifyKnownVersions(db: DatabaseSync): void {
  if (!db.prepare(ledgerExistsSql).get()) return;
  const knownIds = new Set<string>(versions.map((version) => version.id));
  for (const row of db.prepare(allIdsSql).all()) {
    if (!knownIds.has(String(row.id))) {
      throw Object.assign(new Error("任务数据库版本较新，请使用兼容的较新版本打开。"), {
        kind: "newer_database",
      });
    }
  }
}

function checksumMismatch(id: string): Error & { kind: string } {
  return Object.assign(new Error(`Task database migration checksum mismatch: ${id}`), {
    kind: "checksum_mismatch",
  });
}

export function inspectTasksMigrationKind(db: DatabaseSync): DatabaseMigrationFacts["kind"] {
  verifyKnownVersions(db);
  const ledgerExists = !!db.prepare(ledgerExistsSql).get();
  let pending = false;
  for (const version of versions) {
    const row = ledgerExists ? db.prepare(checksumSql).get(version.id) : undefined;
    if (!row) {
      pending = true;
    } else if (row.checksum !== checksumFor(version)) {
      throw Object.assign(checksumMismatch(version.id), { migrationId: version.id });
    }
  }
  if (!pending) return "none";
  return db.prepare(userTablesSql).get() ? "upgrade" : "initialize";
}

export function areTasksDatabaseMigrationsApplied(db: DatabaseSync): boolean {
  verifyKnownVersions(db);
  if (!db.prepare(ledgerExistsSql).get()) return false;
  for (const version of versions) {
    const row = db.prepare(checksumSql).get(version.id);
    if (!row) return false;
    if (row.checksum !== checksumFor(version)) throw checksumMismatch(version.id);
  }
  return true;
}

export function lastAppliedTasksMigrationId(db: DatabaseSync): string | null {
  if (!db.prepare(ledgerExistsSql).get()) return null;
  const row = db.prepare(latestIdSql).get();
  return row ? String(row.id) : null;
}

export function createTasksDatabaseSnapshot(db: DatabaseSync): string | undefined {
  const path = db.location();
  if (!path) return undefined;
  return createSqliteSnapshot(db, path, lastAppliedTasksMigrationId(db) ?? "unversioned");
}

export function runTasksDatabaseMigrations(
  db: DatabaseSync,
  options: {
    transactionOpen?: boolean;
    migration?: DatabaseMigrationFacts;
    onProgress?: (phase: "migrating" | "committing", migration: DatabaseMigrationFacts) => void;
  } = {},
): void {
  if (!options.transactionOpen) {
    if (inspectTasksMigrationKind(db) === "upgrade") createTasksDatabaseSnapshot(db);
    db.exec("BEGIN IMMEDIATE");
  }
  const facts: DatabaseMigrationFacts = options.migration ?? {
    kind: "none",
    executedCount: 0,
    committedCount: 0,
  };
  let currentMigrationId: string | undefined;
  try {
    const kind = inspectTasksMigrationKind(db);
    if (!options.migration) facts.kind = kind;
    db.exec(createLedgerSql);
    const latest = db.prepare(latestIdSql).get();
    facts.lastAppliedMigrationId = latest
      ? databaseMigrationIdSchema.safeParse(latest.id).data
      : null;
    for (const version of versions) {
      currentMigrationId = version.id;
      const checksum = checksumFor(version);
      const row = db.prepare(checksumSql).get(version.id);
      if (row) {
        if (row.checksum !== checksum) throw checksumMismatch(version.id);
        continue;
      }
      if (facts.kind === "none") facts.kind = "upgrade";
      options.onProgress?.("migrating", { ...facts });
      version.apply(db);
      facts.executedCount++;
      db.prepare(insertLedgerSql).run(version.id, checksum, Date.now());
    }
    options.onProgress?.("committing", { ...facts });
    db.exec("COMMIT");
    facts.committedCount = facts.executedCount;
  } catch (error) {
    try {
      if (db.isTransaction) db.exec("ROLLBACK");
    } catch {
      // Preserve the migration failure if rollback also fails.
    }
    if (error && typeof error === "object" && currentMigrationId) {
      Object.assign(error, { migrationId: currentMigrationId });
    }
    throw error;
  }
}
