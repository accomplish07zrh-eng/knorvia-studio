import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { KnorviaTaskMeta } from "@knorvia/shared";

type Row = Record<string, unknown>;
const instances: FakeDatabase[] = [];
class FakeDatabase {
  rows = new Map<string, Row>();
  orders = new Map<string, Row>();
  calls: string[] = [];
  backup: { rows: Map<string, Row>; orders: Map<string, Row> } | undefined;
  failure: unknown;
  constructor(path: string) {
    assert.equal(path, "/synthetic/tasks.sqlite");
    instances.push(this);
  }
  close() {}
  exec(sql: string) {
    this.calls.push(sql);
    if (sql === "BEGIN IMMEDIATE")
      this.backup = { rows: structuredClone(this.rows), orders: structuredClone(this.orders) };
    if (sql === "ROLLBACK" && this.backup) {
      this.rows = this.backup.rows;
      this.orders = this.backup.orders;
    }
  }
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        this.calls.push(sql);
        if (sql.includes("FROM tasks") && sql.includes("workspace_key = ? AND task_id = ?"))
          return this.rows.get(String(args[0]) + "\0" + String(args[1]));
        if (sql.includes("MIN(sort_order)"))
          return { min_sort_order: this.orders.size ? 1000 : null };
        if (sql.includes("FROM task_group_members")) return undefined;
        if (sql.includes("FROM task_group_view_node_orders"))
          return this.orders.get(String(args[0]));
        throw new Error(`unexpected fake read: ${sql}`);
      },
      all: () => {
        this.calls.push(sql);
        if (sql.includes("FROM task_group_view_node_orders")) return [...this.orders.values()];
        if (
          sql.includes("FROM task_groups") ||
          sql.includes("FROM task_group_members") ||
          sql.includes("FROM task_group_workspace_bootstraps")
        )
          return [];
        throw new Error(`unexpected fake list: ${sql}`);
      },
      run: (...args: unknown[]) => {
        this.calls.push(sql);
        if (sql.startsWith("INSERT INTO tasks")) {
          if (this.failure) throw this.failure;
          const values = args[0] as Row;
          const key = String(values.workspace_key) + "\0" + String(values.task_id);
          const old = this.rows.get(key);
          this.rows.set(key, {
            ...values,
            unread_at: old && values.write_unread_at !== 1 ? old.unread_at : values.unread_at,
            last_unread_at: Math.max(
              Number(old?.last_unread_at ?? 0),
              Number(old?.unread_at ?? 0),
              Number(values.last_unread_at),
            ),
          });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO task_group_view_node_orders")) {
          const values: Row = {
            node_type: args[0],
            node_key: args[1],
            sort_order: args[2],
            created_at: args[3],
            updated_at: args[4],
          };
          assert.equal(typeof values.node_key, "string");
          const parsed: unknown = JSON.parse(String(values.node_key));
          assert.ok(Array.isArray(parsed));
          this.orders.set(String(values.node_key), { ...values });
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM task_group_members")) return { changes: 0 };
        if (sql.startsWith("DELETE FROM task_group_view_node_orders"))
          return { changes: this.orders.delete(String(args[0])) ? 1 : 0 };
        throw new Error(`unexpected fake write: ${sql}`);
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
      throw new Error("must not consult actual settings root");
    },
  },
});
mock.module(new URL("../src/session/tasksDatabase/prepared.ts", import.meta.url).href, {
  namedExports: {
    isTasksStoragePrepared: (path: string, db: FakeDatabase) => {
      assert.equal(path, "/synthetic/tasks.sqlite");
      assert.equal(db, instances.at(-1));
      return true;
    },
    isTasksStorageMigrated: (path: string, db: FakeDatabase) => {
      assert.equal(path, "/synthetic/tasks.sqlite");
      assert.equal(db, instances.at(-1));
      return true;
    },
  },
});
mock.module(new URL("../src/session/tasksDatabase/migrations.ts", import.meta.url).href, {
  namedExports: {
    runTasksDatabaseMigrations: () => {
      throw new Error("must not migrate");
    },
  },
});
mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
  namedExports: { createServiceLogger: () => ({ warn: () => {} }) },
});
const { TaskIndexRepo } = await import("../src/session/taskIndexRepo.js");

test("fake task persistence preserves entity authority, unread CAS, admission idempotency and failure recovery", async () => {
  const repo = new TaskIndexRepo("/synthetic/tasks.sqlite", 19);
  const meta: KnorviaTaskMeta = {
    taskId: "synthetic-task",
    traceId: "synthetic-trace",
    title: "initial",
    workspacePath: "/synthetic/project",
    workspaceIdentity: "synthetic-identity",
    mode: "build",
    createdAt: 10,
    updatedAt: 20,
    status: "running",
  };
  const scope = {
    workspacePath: meta.workspacePath,
    workspaceIdentity: meta.workspaceIdentity,
    taskId: meta.taskId,
  };
  try {
    await Promise.all([repo.ensureReady(), repo.ensureReady()]);
    assert.equal(instances.length, 1);
    const db = instances[0]!;
    assert.deepEqual(db.calls.slice(0, 4), [
      "PRAGMA busy_timeout = 19",
      "PRAGMA foreign_keys = ON",
      "PRAGMA journal_mode = WAL",
      "PRAGMA synchronous = NORMAL",
    ]);
    await repo.syncTaskMeta({ meta, searchableText: "synthetic searchable content" });
    assert.equal((await repo.getTaskMeta(scope))?.title, "initial");
    assert.equal(await repo.getTaskMeta({ ...scope, workspaceIdentity: "other-identity" }), null);
    const manual = await repo.updateTaskState({
      ...scope,
      patch: { title: "manual", titleOverridden: true, status: "completed", updatedAt: 50 },
    });
    assert.equal(manual.title, "manual");
    const merged = await repo.syncTaskMeta({ meta: { ...meta, title: "agent", updatedAt: 25 } });
    assert.equal(merged.title, "manual");
    assert.equal(merged.status, "completed");
    assert.equal(
      db.rows.get("synthetic-identity\0synthetic-task")?.searchable_text,
      "synthetic searchable content",
    );
    const admissionCalls = db.calls.length;
    await assert.rejects(
      repo.applyGroupedTaskViewOrder({
        workspaceScopes: [scope],
        topLevelNodes: [{ type: "task", task: { ...scope, workspaceIdentity: "outside" } }],
        groups: [],
      }),
      /当前 scope 外/,
    );
    assert.equal(db.calls.slice(admissionCalls).includes("BEGIN IMMEDIATE"), false);
    const first = await repo.updateTaskState({ ...scope, patch: { unreadAt: 100 } });
    assert.equal(first.unreadAt, 100);
    assert.equal(
      (await repo.clearTaskUnreadIfMatches({ ...scope, expectedUnreadAt: 99 })).cleared,
      false,
    );
    assert.equal(
      (await repo.clearTaskUnreadIfMatches({ ...scope, expectedUnreadAt: 100 })).cleared,
      true,
    );
    const second = await repo.updateTaskState({ ...scope, patch: { unreadAt: 10 } });
    assert.equal(second.unreadAt, 101);
    assert.equal(
      (await repo.clearTaskUnreadIfMatches({ ...scope, expectedUnreadAt: 100 })).cleared,
      false,
    );
    const top = await repo.syncTaskMetaAtGroupedTop({ meta });
    assert.equal(top.initializedGroupedOrder, true);
    assert.equal((await repo.syncTaskMetaAtGroupedTop({ meta })).initializedGroupedOrder, false);
    assert.deepEqual(
      [...db.orders.keys()],
      [JSON.stringify(["synthetic-identity", "synthetic-task"])],
    );
    assert.equal(
      (await repo.queryGroupedTaskViewStructure({ workspaceScopes: [scope] })).topLevelOrders
        .length,
      1,
    );
    const sameFailure = new Error("synthetic write failure");
    db.failure = sameFailure;
    await assert.rejects(
      repo.syncTaskMetaAtGroupedTop({ meta: { ...meta, taskId: "failed" } }),
      (error) => error === sameFailure,
    );
    assert.equal(db.rows.has("synthetic-identity\0failed"), false);
    assert.equal(db.calls.at(-1), "ROLLBACK");
    db.failure = undefined;
    assert.equal(
      (await repo.syncTaskMetaAtGroupedTop({ meta: { ...meta, taskId: "failed" } })).meta.taskId,
      "failed",
    );
    await repo.updateTaskState({ ...scope, patch: { deleted: true } });
    assert.equal(
      (await repo.seedTaskMetaIfMissing({ ...meta, title: "must not resurrect" })).title,
      "manual",
    );
    assert.equal(await repo.getTaskMeta(scope), null);
  } finally {
    repo.close();
  }
});
