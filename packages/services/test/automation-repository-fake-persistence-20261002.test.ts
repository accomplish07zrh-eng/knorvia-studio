import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Stored = Record<string, unknown>;
const instances: FakeDatabase[] = [];
let preparedFailure: unknown;
let rollbackFailure: unknown;
class FakeDatabase {
  definitions = new Map<string, Stored>();
  runs = new Map<string, Stored>();
  calls: Array<{ sql: string; values?: Stored }> = [];
  backup: { definitions: Map<string, Stored>; runs: Map<string, Stored> } | undefined;
  writeFailure: unknown;
  closeFailure: unknown;
  closed = 0;
  constructor(readonly path: string) {
    assert.equal(path, "/synthetic/automation.sqlite");
    instances.push(this);
  }
  exec(sql: string) {
    this.calls.push({ sql });
    if (sql === "BEGIN IMMEDIATE")
      this.backup = {
        definitions: structuredClone(this.definitions),
        runs: structuredClone(this.runs),
      };
    if (sql === "ROLLBACK") {
      if (rollbackFailure) throw rollbackFailure;
      if (this.backup) {
        this.definitions = this.backup.definitions;
        this.runs = this.backup.runs;
      }
    }
  }
  close() {
    this.closed++;
    if (this.closeFailure) throw this.closeFailure;
  }
  prepare(sql: string) {
    return {
      get: (values: Stored = {}) => {
        this.calls.push({ sql, values });
        if (sql.startsWith("SELECT COUNT(*)")) return { count: this.definitions.size };
        if (sql.includes("FROM automations") && sql.includes("automation_id = @id")) {
          const row = this.definitions.get(String(values.id));
          return row && (values.workspace_key == null || values.workspace_key === row.workspace_key)
            ? { ...row }
            : undefined;
        }
        if (sql.includes("FROM automation_runs")) {
          const row = this.runs.get(String(values.run_id));
          return row && (!sql.includes("trigger = 'manual'") || row.trigger === "manual")
            ? { ...row }
            : undefined;
        }
        throw new Error(`unexpected synthetic query: ${sql}`);
      },
      all: (values: Stored = {}) => {
        this.calls.push({ sql, values });
        assert.ok(sql.includes("FROM automations"));
        return [...this.definitions.values()]
          .filter(
            (row) => values.workspace_key == null || row.workspace_key === values.workspace_key,
          )
          .map((row) => ({ ...row }));
      },
      run: (values: Stored) => {
        this.calls.push({ sql, values });
        if (this.writeFailure) throw this.writeFailure;
        if (sql.startsWith("INSERT INTO automations")) {
          this.definitions.set(String(values.automation_id), {
            ...values,
            location_kind: "local",
            schedule_edited_by_user: 0,
            run_count: 0,
            scheduled_run_count: 0,
            running: 0,
            claimed_at: null,
            last_run_at: null,
            dispatch_status: "idle",
            dispatch_attempts: 0,
            retry_at: null,
            last_error: null,
          });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO automation_runs")) {
          const id = String(values.run_id);
          const old = this.runs.get(id);
          if (old && sql.includes("DO NOTHING")) return { changes: 0 };
          this.runs.set(
            id,
            old
              ? {
                  ...old,
                  dispatch_status: "claimed",
                  model_selection: old.model_selection ?? values.model_selection,
                  outcome: null,
                  error: null,
                  attempts: Number(old.attempts) + 1,
                  updated_at: values.now,
                }
              : {
                  ...values,
                  model_selection: values.model_selection ?? null,
                  dispatch_status: "claimed",
                  attempts: 0,
                  outcome: null,
                  error: null,
                  session_id: null,
                  created_at: values.now,
                  updated_at: values.now,
                },
          );
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE automation_runs")) {
          const row = this.runs.get(String(values.run_id));
          if (!row) return { changes: 0 };
          if (sql.includes("COALESCE(model_selection"))
            row.model_selection ??= values.model_selection;
          if (sql.includes("dispatch_status = 'dispatched'")) {
            row.dispatch_status = "dispatched";
            row.session_id = values.session_id ?? row.session_id;
            row.error = null;
          }
          row.updated_at = values.now;
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE automations")) {
          const row = this.definitions.get(String(values.automation_id ?? values.id));
          if (!row || (values.workspace_key != null && row.workspace_key !== values.workspace_key))
            return { changes: 0 };
          if (sql.includes("run_count = run_count + 1")) {
            row.run_count = Number(row.run_count) + 1;
            row.last_run_at = values.dispatched_at;
            row.updated_at = values.now;
          } else Object.assign(row, values);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM automations")) {
          const row = this.definitions.get(String(values.id));
          if (!row || (values.workspace_key != null && row.workspace_key !== values.workspace_key))
            return { changes: 0 };
          return { changes: this.definitions.delete(String(values.id)) ? 1 : 0 };
        }
        throw new Error(`unexpected synthetic write: ${sql}`);
      },
    };
  }
}
mock.module("node:module", {
  namedExports: {
    createRequire: () => (name: string) => {
      assert.equal(name, "node:sqlite");
      return { DatabaseSync: FakeDatabase };
    },
  },
});
mock.module("node:fs/promises", {
  namedExports: {
    mkdir: async (path: string, options: unknown) => {
      assert.equal(path, "/synthetic");
      assert.deepEqual(options, { recursive: true });
    },
  },
});
mock.module(new URL("../src/paths.ts", import.meta.url).href, {
  namedExports: {
    getTasksIndexDatabasePath: () => {
      throw new Error("default data root must not be consulted");
    },
  },
});
mock.module(new URL("../src/session/tasksDatabase/prepared.ts", import.meta.url).href, {
  namedExports: {
    isTasksStorageMigrated: () => {
      if (preparedFailure) throw preparedFailure;
      return true;
    },
  },
});
mock.module(new URL("../src/session/tasksDatabase/migrations.ts", import.meta.url).href, {
  namedExports: {
    runTasksDatabaseMigrations: () => {
      throw new Error("migration must not run");
    },
  },
});
const { AutomationRepo, AutomationCreateLimitError, computeRetryAt } =
  await import("../src/session/automationRepo.js");

test("fake automation DB preserves scoped writes, frozen run identity, idempotency and rollback failures", async () => {
  const clock = mock.method(Date, "now", () => 100);
  const repo = new AutomationRepo(" /synthetic/automation.sqlite ", 17);
  try {
    await Promise.all([repo.ensureReady(), repo.ensureReady()]);
    assert.equal(instances.length, 1);
    const db = instances[0]!;
    assert.deepEqual(
      db.calls.slice(0, 3).map((row) => row.sql),
      ["PRAGMA busy_timeout = 17", "PRAGMA journal_mode = WAL", "PRAGMA synchronous = NORMAL"],
    );
    const selection = {
      providerId: "synthetic-provider",
      modelId: "model-a",
      options: { reasoningLevel: "high" },
    };
    const item = await repo.create(
      {
        title: "fake",
        cronExpr: "fake-cron",
        prompt: "synthetic",
        recurring: false,
        workspacePath: "/fake/workspace",
        workspaceIdentity: "synthetic-identity",
        modelSelection: selection,
      },
      { nextRunAt: 50 },
    );
    assert.equal(item.workspaceKey, "synthetic-identity");
    assert.deepEqual(item.modelSelection, selection);
    assert.equal(await repo.get(item.automationId, "other-identity"), null);
    assert.equal(await repo.delete(item.automationId, "other-identity"), false);
    assert.equal(
      (await repo.list({ workspacePath: "/fake/workspace", workspaceIdentity: "other-identity" }))
        .length,
      0,
    );
    const stored = db.definitions.get(item.automationId)!;
    stored.model = "old-model";
    stored.provider = "old-provider";
    stored.thought_level = "old-level";
    await repo.update(item.automationId, { title: "renamed" });
    assert.equal(stored.model, "old-model");
    assert.equal(stored.provider, "old-provider");
    assert.equal(stored.thought_level, "old-level");
    stored.model_selection = "broken";
    await assert.rejects(
      repo.getModelSelectionForDispatch(item.automationId, item.workspaceKey),
      /模型选择不可用/,
    );
    stored.model_selection = "null";
    assert.equal(
      await repo.getModelSelectionForDispatch(item.automationId, item.workspaceKey),
      undefined,
    );
    const run = {
      runId: "synthetic-run",
      automationId: item.automationId,
      workspaceKey: item.workspaceKey,
      scheduledAt: 50,
      trigger: "manual" as const,
    };
    await repo.ensureRunClaimed(run);
    await repo.ensureRunClaimed(run);
    assert.equal(db.runs.size, 1);
    assert.equal((await repo.getRun(run.runId))?.attempts, 0);
    assert.deepEqual(await repo.fixRunModelSelection(run.runId, selection), selection);
    assert.deepEqual(
      await repo.fixRunModelSelection(run.runId, { providerId: "other", modelId: "other" }),
      selection,
    );
    assert.equal(await repo.markManualRunDispatched({ runId: run.runId, dispatchedAt: 200 }), true);
    assert.equal(
      await repo.markManualRunDispatched({ runId: run.runId, dispatchedAt: 300 }),
      false,
    );
    assert.equal((await repo.get(item.automationId))?.runCount, 1);
    assert.equal(await repo.getScheduledRunCount(item.automationId), 0);
    assert.equal((await repo.get(item.automationId))?.nextRunAt, 50);
    assert.equal(computeRetryAt(100, 1), 30100);
    assert.equal(computeRetryAt(100, 99), 900100);
    for (let i = 1; i < 20; i++)
      db.definitions.set(`fake-${i}`, { ...stored, automation_id: `fake-${i}` });
    await assert.rejects(
      repo.create(
        {
          title: "over limit",
          cronExpr: "fake",
          prompt: "fake",
          recurring: true,
          workspacePath: "/fake",
        },
        { nextRunAt: null },
      ),
      AutomationCreateLimitError,
    );
    assert.equal(db.definitions.size, 20);
    assert.equal(db.calls.at(-1)!.sql, "ROLLBACK");
    const before = db.calls.length;
    await assert.rejects(
      repo.create(
        {
          title: "invalid",
          cronExpr: "fake",
          prompt: "fake",
          recurring: true,
          workspacePath: "/fake",
          mode: "bad" as never,
        },
        { nextRunAt: null },
      ),
      /Invalid automation mode: bad/,
    );
    assert.equal(db.calls.length, before);
    db.definitions.clear();
    const denied = new Error("synthetic DB write rejected");
    db.writeFailure = denied;
    await assert.rejects(
      repo.create(
        {
          title: "denied",
          cronExpr: "fake",
          prompt: "fake",
          recurring: true,
          workspacePath: "/fake",
        },
        { nextRunAt: null },
      ),
      (error) => error === denied,
    );
    rollbackFailure = new Error("synthetic rollback rejected");
    await assert.rejects(
      repo.create(
        {
          title: "denied",
          cronExpr: "fake",
          prompt: "fake",
          recurring: true,
          workspacePath: "/fake",
        },
        { nextRunAt: null },
      ),
      (error) => error === rollbackFailure,
    );
    rollbackFailure = undefined;
    db.closeFailure = denied;
    assert.throws(
      () => repo.close({ throwOnError: true }),
      (error) => error === denied,
    );
    assert.equal(db.closed, 1);
    preparedFailure = denied;
    await assert.rejects(repo.ensureReady(), (error) => error === denied);
    assert.equal(instances[1]!.closed, 1);
  } finally {
    rollbackFailure = undefined;
    preparedFailure = undefined;
    repo.close();
    clock.mock.restore();
  }
});
