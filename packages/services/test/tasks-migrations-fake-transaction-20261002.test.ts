import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mock, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import type { DatabaseMigrationFacts } from "@knorvia/shared";

interface Row {
  automation_id: string;
  model: string | null;
  provider: string | null;
  thought_level: string | null;
  model_selection: string | null;
  updated_at: number;
}
interface Log {
  operation: string;
  sql?: string;
  params?: unknown[];
}
class FakeDatabase {
  isTransaction = false;
  hasLedger = false;
  hasUserTables = false;
  locationPath = "";
  duplicateBindings = false;
  failSql: string | undefined;
  rollbackFailure = false;
  failure = new Error("synthetic SQL rejected");
  ledger = new Map<string, { checksum: string; time: number }>();
  columns = new Map<string, Set<string>>();
  rows: Row[] = [];
  logs: Log[] = [];
  before:
    | {
        ledger: Map<string, { checksum: string; time: number }>;
        columns: Map<string, Set<string>>;
        rows: Row[];
        hasLedger: boolean;
      }
    | undefined;

  location() {
    return this.locationPath;
  }
  exec(sql: string) {
    this.logs.push({ operation: "exec", sql });
    if (sql === this.failSql) throw this.failure;
    if (sql === "BEGIN IMMEDIATE") {
      this.before = {
        ledger: structuredClone(this.ledger),
        columns: structuredClone(this.columns),
        rows: structuredClone(this.rows),
        hasLedger: this.hasLedger,
      };
      this.isTransaction = true;
    } else if (sql === "COMMIT") {
      this.isTransaction = false;
    } else if (sql === "ROLLBACK") {
      if (this.rollbackFailure) throw new Error("synthetic rollback rejected");
      if (this.before) {
        this.ledger = this.before.ledger;
        this.columns = this.before.columns;
        this.rows = this.before.rows;
        this.hasLedger = this.before.hasLedger;
      }
      this.isTransaction = false;
    } else if (sql.startsWith("CREATE TABLE IF NOT EXISTS tasks_schema_migration")) {
      this.hasLedger = true;
    } else if (sql.startsWith("ALTER TABLE ")) {
      const words = sql.split(" ");
      const names = this.columns.get(words[2]!) ?? new Set<string>();
      names.add(words[5]!);
      this.columns.set(words[2]!, names);
    } else if (sql.startsWith("UPDATE automations SET model_selection='null'")) {
      for (const row of this.rows) {
        if (row.model_selection === null && !row.model?.trim()) row.model_selection = "null";
      }
    }
  }
  prepare(sql: string) {
    this.logs.push({ operation: "prepare", sql });
    return {
      get: (...params: unknown[]) => {
        this.logs.push({ operation: "get", sql, params });
        if (sql.includes("name='tasks_schema_migration'"))
          return this.hasLedger ? { exists: 1 } : undefined;
        if (sql.includes("name NOT IN")) return this.hasUserTables ? { exists: 1 } : undefined;
        if (sql.startsWith("SELECT checksum")) return this.ledger.get(String(params[0]));
        if (sql.startsWith("SELECT id") && sql.includes("ORDER BY")) {
          const id = [...this.ledger.keys()].sort().at(-1);
          return id ? { id } : undefined;
        }
        if (sql.includes("HAVING count(*)>1"))
          return this.duplicateBindings ? { exists: 1 } : undefined;
        throw new Error(`unexpected synthetic get: ${sql}`);
      },
      all: () => {
        this.logs.push({ operation: "all", sql });
        if (sql === "SELECT id FROM tasks_schema_migration")
          return [...this.ledger.keys()].map((id) => ({ id }));
        if (sql.startsWith("PRAGMA table_info("))
          return [...(this.columns.get(sql.slice(18, -1)) ?? [])].map((name) => ({ name }));
        if (sql.startsWith("SELECT automation_id"))
          return this.rows
            .filter((row) => row.model !== null)
            .map((row) => ({
              automation_id: row.automation_id,
              model: row.model,
              provider: row.provider,
              thought_level: row.thought_level,
            }));
        throw new Error(`unexpected synthetic all: ${sql}`);
      },
      run: (...params: unknown[]) => {
        this.logs.push({ operation: "run", sql, params });
        if (sql.startsWith("INSERT INTO tasks_schema_migration")) {
          this.ledger.set(String(params[0]), {
            checksum: String(params[1]),
            time: Number(params[2]),
          });
        } else if (sql.startsWith("UPDATE automations SET model_selection=NULL")) {
          const row = this.rows.find((row) => row.automation_id === params[0]);
          if (row) row.model_selection = null;
        } else if (sql.startsWith("UPDATE automations SET model_selection = ?")) {
          const row = this.rows.find((row) => row.automation_id === params[1]);
          if (
            row &&
            row.model === params[2] &&
            row.provider === params[3] &&
            row.thought_level === params[4]
          )
            row.model_selection = String(params[0]);
        } else throw new Error(`unexpected synthetic run: ${sql}`);
        return { changes: 1 };
      },
    };
  }
}
function port(fake: FakeDatabase): DatabaseSync {
  return fake as unknown as DatabaseSync;
}
let snapshotFailure: unknown;
mock.module(new URL("../src/session/tasksDatabase/sqliteSnapshot.ts", import.meta.url).href, {
  namedExports: {
    createSqliteSnapshot: (db: FakeDatabase, path: string, last: string) => {
      assert.equal(path, "/synthetic/database.sqlite");
      db.logs.push({ operation: "snapshot", params: [path, last] });
      if (snapshotFailure) throw snapshotFailure;
      return "/synthetic/snapshot.sqlite";
    },
  },
});
const owner = await import("../src/session/tasksDatabase/migrations.js");
const provider = await import("../src/session/tasksDatabase/provider-selection-v2.js");
const { TASK_INDEX_SCHEMA, AUTOMATION_SCHEMA, OFF_PEAK_SCHEMA } =
  await import("../src/session/tasksDatabase/schema-v1.js");
const { OFFICIAL_GLM_SELECTION_MIGRATION_SQL } =
  await import("../src/session/tasksDatabase/official-glm-selection-v3.js");
const { AGENT_IDENTITY_MIGRATION_SQL } =
  await import("../src/session/tasksDatabase/agent-identity-v4.js");

test("synthetic migration ports preserve transaction/order/checksum/idempotency/rollback identity", () => {
  const clock = mock.method(Date, "now", () => 123);
  try {
    const fake = new FakeDatabase();
    fake.hasUserTables = true;
    fake.locationPath = "/synthetic/database.sqlite";
    const facts: DatabaseMigrationFacts = { kind: "upgrade", executedCount: 0, committedCount: 0 };
    const progress: Array<{ phase: string; facts: DatabaseMigrationFacts }> = [];
    owner.runTasksDatabaseMigrations(port(fake), {
      migration: facts,
      onProgress: (phase, value) => {
        progress.push({ phase, facts: { ...value } });
        assert.notEqual(value, facts);
        value.executedCount = 999;
      },
    });
    assert.deepEqual(facts, {
      kind: "upgrade",
      executedCount: 5,
      committedCount: 5,
      lastAppliedMigrationId: null,
    });
    assert.deepEqual(
      progress.map((row) => [row.phase, row.facts.executedCount, row.facts.committedCount]),
      [
        ["migrating", 0, 0],
        ["migrating", 1, 0],
        ["migrating", 2, 0],
        ["migrating", 3, 0],
        ["migrating", 4, 0],
        ["committing", 5, 0],
      ],
    );
    const snapshotAt = fake.logs.findIndex((row) => row.operation === "snapshot");
    const beginAt = fake.logs.findIndex((row) => row.sql === "BEGIN IMMEDIATE");
    assert.ok(snapshotAt >= 0 && snapshotAt < beginAt);
    assert.deepEqual(fake.logs[snapshotAt]!.params, ["/synthetic/database.sqlite", "unversioned"]);
    assert.equal(fake.logs.at(-1)!.sql, "COMMIT");
    const ids = [
      "0001_adopt_task_schema",
      "0002_provider_selection",
      "0003_official_glm_selection",
      "0004_agent_identity",
      "0005_studio_workflow_schedule",
    ];
    assert.deepEqual([...fake.ledger.keys()], ids);
    assert.equal(
      fake.ledger.get(ids[0]!)!.checksum,
      "3e8337b015d94b05dd31a6003f3acc649e821794cfa288bc0af3022698bd4d17",
    );
    const versions = [
      ["legacy-automation-selection-v1", "no-provider-for-legacy-off-peak-v1"],
      [OFFICIAL_GLM_SELECTION_MIGRATION_SQL],
      [AGENT_IDENTITY_MIGRATION_SQL],
      ["ALTER TABLE automations ADD COLUMN studio_workflow_id TEXT"],
    ];
    for (let i = 1; i < ids.length; i++)
      assert.equal(
        fake.ledger.get(ids[i]!)!.checksum,
        createHash("sha256")
          .update(JSON.stringify(versions[i - 1]))
          .digest("hex"),
      );
    assert.ok(
      fake.logs.some((row) => row.sql === TASK_INDEX_SCHEMA + AUTOMATION_SCHEMA + OFF_PEAK_SCHEMA),
    );
    assert.equal(
      fake.logs.filter((row) => row.sql === "UPDATE automations SET scheduled_run_count=run_count")
        .length,
      1,
    );
    const frozenLedger = structuredClone(fake.ledger);
    fake.logs.length = 0;
    assert.equal(owner.inspectTasksMigrationKind(port(fake)), "none");
    assert.equal(owner.areTasksDatabaseMigrationsApplied(port(fake)), true);
    owner.runTasksDatabaseMigrations(port(fake));
    assert.deepEqual(fake.ledger, frozenLedger);
    assert.equal(
      fake.logs.filter((row) => row.operation === "snapshot" || row.operation === "run").length,
      0,
    );
    assert.equal(fake.logs.filter((row) => row.operation === "exec").length, 3);

    const broken = new FakeDatabase();
    broken.failSql = OFFICIAL_GLM_SELECTION_MIGRATION_SQL;
    const failedFacts: DatabaseMigrationFacts = {
      kind: "initialize",
      executedCount: 0,
      committedCount: 0,
    };
    assert.throws(
      () => owner.runTasksDatabaseMigrations(port(broken), { migration: failedFacts }),
      (error) => error === broken.failure,
    );
    assert.equal(Reflect.get(broken.failure, "migrationId"), "0003_official_glm_selection");
    assert.equal(failedFacts.executedCount, 2);
    assert.equal(failedFacts.committedCount, 0);
    assert.equal(broken.hasLedger, false);
    assert.equal(broken.ledger.size, 0);
    assert.equal(broken.logs.at(-1)!.sql, "ROLLBACK");
    const rollback = new FakeDatabase();
    rollback.failSql = OFFICIAL_GLM_SELECTION_MIGRATION_SQL;
    rollback.rollbackFailure = true;
    assert.throws(
      () => owner.runTasksDatabaseMigrations(port(rollback)),
      (error) => error === rollback.failure,
    );

    const held = new FakeDatabase();
    held.exec("BEGIN IMMEDIATE");
    held.logs.length = 0;
    held.duplicateBindings = true;
    owner.runTasksDatabaseMigrations(port(held), { transactionOpen: true });
    assert.equal(
      held.logs.filter((row) => row.sql === "BEGIN IMMEDIATE" || row.operation === "snapshot")
        .length,
      0,
    );
    assert.equal(
      held.logs.filter((row) =>
        row.sql?.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS idx_off_peak_bound_active"),
      ).length,
      0,
    );
    assert.equal(held.logs.at(-1)!.sql, "COMMIT");
    const newer = new FakeDatabase();
    newer.hasLedger = true;
    newer.ledger.set("0000_unknown", { checksum: "fake", time: 0 });
    assert.throws(() => owner.runTasksDatabaseMigrations(port(newer)), {
      message: "任务数据库版本较新，请使用兼容的较新版本打开。",
      kind: "newer_database",
    });
    assert.equal(newer.logs.filter((row) => row.operation === "exec").length, 0);
    const mismatch = new FakeDatabase();
    mismatch.hasLedger = true;
    mismatch.ledger.set(ids[0]!, { checksum: "wrong", time: 0 });
    assert.throws(() => owner.inspectTasksMigrationKind(port(mismatch)), {
      kind: "checksum_mismatch",
      migrationId: ids[0],
    });
    assert.throws(
      () => owner.areTasksDatabaseMigrationsApplied(port(mismatch)),
      (error) =>
        error instanceof Error &&
        Reflect.get(error, "kind") === "checksum_mismatch" &&
        !Reflect.has(error, "migrationId"),
    );
    const snapshotDenied = new FakeDatabase();
    snapshotDenied.locationPath = "/synthetic/database.sqlite";
    snapshotDenied.hasUserTables = true;
    snapshotFailure = new Error("synthetic snapshot rejected");
    assert.throws(
      () => owner.runTasksDatabaseMigrations(port(snapshotDenied)),
      (error) => error === snapshotFailure,
    );
    assert.equal(snapshotDenied.logs.filter((row) => row.operation === "exec").length, 0);
  } finally {
    snapshotFailure = undefined;
    clock.mock.restore();
  }
});

test("synthetic provider migration preserves legacy cells, guarded selection writes and NULL intent", () => {
  const fake = new FakeDatabase();
  const cases: Array<[string | null, string | null, string | null, unknown]> = [
    [
      "custom:builtin:bigmodel:alpha%3Abeta",
      "old",
      " high ",
      { providerId: "bigmodel-api", modelId: "alpha:beta", options: { reasoningLevel: "high" } },
    ],
    [
      "custom:account%3Atest:model%2Fname",
      "old",
      null,
      { providerId: "account:test", modelId: "model/name" },
    ],
    ["custom:p%ZZ:m%ZZ", "old", null, { providerId: "p%ZZ", modelId: "m%ZZ" }],
    [
      " glm/model$high ",
      "knorvia",
      "low",
      { providerId: "glm", modelId: "model", options: { reasoningLevel: "high" } },
    ],
    [
      "p/m$",
      null,
      "medium",
      { providerId: "p", modelId: "m$", options: { reasoningLevel: "medium" } },
    ],
    ["p/$m", null, null, { providerId: "p", modelId: "$m" }],
    ["p/m$  ", null, "low", { providerId: "p", modelId: "m$", options: { reasoningLevel: "low" } }],
    ["model", "glm", null, null],
    ["custom:missing", "p", null, null],
    ["custom:builtin:unknown:model", "p", null, null],
    ["  model  ", " supplier ", " ", { providerId: "supplier", modelId: "model" }],
    ["", "p", null, "null"],
    ["   ", "p", null, "null"],
    [null, null, null, "null"],
  ];
  fake.rows = cases.map(([model, provider, thought_level], index) => ({
    automation_id: `synthetic-${index}`,
    model,
    provider,
    thought_level,
    model_selection: index >= 11 ? null : "unpublished",
    updated_at: 77,
  }));
  const originals = fake.rows.map(({ model_selection: _selection, ...legacy }) => legacy);
  provider.importLegacyAutomationSelections(port(fake));
  assert.deepEqual(
    fake.rows.map(({ model_selection: _selection, ...legacy }) => legacy),
    originals,
  );
  assert.deepEqual(
    fake.rows.map((row) => row.model_selection),
    cases.map((row) => (row[3] === null || row[3] === "null" ? row[3] : JSON.stringify(row[3]))),
  );
  for (const call of fake.logs.filter(
    (row) =>
      row.operation === "run" && row.sql?.startsWith("UPDATE automations SET model_selection = ?"),
  )) {
    const row = fake.rows.find((row) => row.automation_id === call.params![1])!;
    assert.deepEqual(call.params!.slice(2), [row.model, row.provider, row.thought_level]);
  }
  const first = fake.rows.map((row) => row.model_selection);
  provider.importLegacyAutomationSelections(port(fake));
  assert.deepEqual(
    fake.rows.map((row) => row.model_selection),
    first,
  );
  assert.equal(
    fake.logs.filter(
      (row) =>
        row.sql?.includes("off_peak") || row.sql === "BEGIN IMMEDIATE" || row.sql === "COMMIT",
    ).length,
    0,
  );
  assert.ok(fake.logs.at(-1)!.sql?.startsWith("UPDATE automations SET model_selection='null'"));
});
