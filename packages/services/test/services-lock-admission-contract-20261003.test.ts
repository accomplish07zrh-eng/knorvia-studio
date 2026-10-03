import assert from "node:assert/strict";
import { test } from "node:test";

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

test("storage lock admission retains one budget, immediate attempts and primary failures", async (t) => {
  const operations: string[] = [];
  const phases: string[] = [];
  const busy = Object.assign(new Error("synthetic busy"), { errcode: 5 });
  let attempt: (operation: string) => void = () => {};
  let progress: (phase: string) => void = () => {};
  let migrationKind: "initialize" | "upgrade" = "initialize";
  class Database {
    constructor() {
      operations.push("open");
    }
    exec(command: string) {
      operations.push(command);
      attempt(command);
    }
    close() {
      operations.push("close");
    }
  }
  class TaskRepository {
    constructor(_path: string, timeout: number) {
      assert.equal(timeout, 3_600_000);
      operations.push("tasks.construct");
    }
    async ensureReady() {
      operations.push("tasks.ready");
    }
    close() {
      operations.push("tasks.close");
    }
  }
  class AutomationRepository {
    constructor(_path: string, timeout: number) {
      assert.equal(timeout, 3_600_000);
      operations.push("automation.construct");
    }
    async ensureReady() {
      operations.push("automation.ready");
    }
    close() {
      operations.push("automation.close");
    }
  }
  t.mock.module("node:module", {
    namedExports: {
      createRequire: () => (name: string) => {
        assert.equal(name, "node:sqlite");
        return { DatabaseSync: Database };
      },
    },
  });
  t.mock.module("node:fs/promises", {
    namedExports: {
      mkdir: async () => {
        operations.push("mkdir");
      },
    },
  });
  t.mock.module("../src/session/taskIndexRepo.js", {
    namedExports: { TaskIndexRepo: TaskRepository },
  });
  t.mock.module("../src/session/automationRepo.js", {
    namedExports: { AutomationRepo: AutomationRepository },
  });
  t.mock.module("../src/session/tasksDatabase/prepared.js", {
    namedExports: {
      markTasksStorageMigrated: () => operations.push("migrated"),
      markTasksStoragePrepared: () => operations.push("prepared"),
    },
  });
  t.mock.module("../src/session/tasksDatabase/migrations.js", {
    namedExports: {
      inspectTasksMigrationKind: () => {
        operations.push("inspect");
        attempt("inspect");
        return migrationKind;
      },
      createTasksDatabaseSnapshot: () => {
        operations.push("snapshot");
        attempt("snapshot");
      },
      runTasksDatabaseMigrations: () => {
        operations.push("migrate");
      },
    },
  });
  const { prepareTasksIndexStorage } = await import("../src/session/tasksDatabase/startup.js");
  function reset() {
    operations.length = phases.length = 0;
    attempt = () => {};
    progress = () => {};
    migrationKind = "initialize";
  }
  const start = () =>
    prepareTasksIndexStorage("synthetic/tasks.sqlite", (phase) => {
      phases.push(phase);
      progress(phase);
    });
  await t.test(
    "attempts are immediate, retry after 100 ms and announce once per acquisition",
    async (ct) => {
      reset();
      ct.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
      let inspections = 0;
      let wals = 0;
      attempt = (operation) => {
        if (operation === "inspect" && ++inspections < 3) throw busy;
        if (operation === "PRAGMA journal_mode = WAL" && ++wals === 1) throw busy;
      };
      const pending = start();
      await drain();
      assert.equal(inspections, 1);
      assert.equal(phases.filter((phase) => phase === "waiting_for_lock").length, 1);
      ct.mock.timers.tick(99);
      await drain();
      assert.equal(inspections, 1);
      ct.mock.timers.tick(1);
      await drain();
      assert.equal(inspections, 2);
      assert.equal(phases.filter((phase) => phase === "waiting_for_lock").length, 1);
      ct.mock.timers.tick(100);
      await drain();
      assert.equal(inspections, 3);
      assert.equal(wals, 1);
      assert.equal(phases.filter((phase) => phase === "waiting_for_lock").length, 2);
      ct.mock.timers.tick(100);
      await pending;
      assert.equal(wals, 2);
      assert.deepEqual(operations.slice(-9), [
        "close",
        "migrated",
        "tasks.construct",
        "automation.construct",
        "tasks.ready",
        "automation.ready",
        "tasks.close",
        "automation.close",
        "prepared",
      ]);
      assert.ok(operations.indexOf("BEGIN IMMEDIATE") < operations.indexOf("migrate"));
      assert.ok(operations.indexOf("migrate") < operations.indexOf("close"));
      assert.equal(phases.at(-1), "ready");
    },
  );
  await t.test(
    "upgrade snapshot completes under the same lock window before WAL or BEGIN",
    async (ct) => {
      reset();
      migrationKind = "upgrade";
      ct.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 15_000 });
      let snapshots = 0;
      attempt = (operation) => {
        if (operation === "snapshot" && ++snapshots === 1) throw busy;
      };
      const pending = start();
      await drain();
      assert.equal(snapshots, 1);
      assert.equal(operations.includes("PRAGMA journal_mode = WAL"), false);
      assert.equal(operations.includes("BEGIN IMMEDIATE"), false);
      ct.mock.timers.tick(100);
      await pending;
      assert.equal(snapshots, 2);
      assert.ok(
        operations.lastIndexOf("snapshot") < operations.indexOf("PRAGMA journal_mode = WAL"),
      );
      assert.equal(phases.filter((phase) => phase === "waiting_for_lock").length, 1);
    },
  );
  await t.test(
    "a later acquisition uses the original deadline and keeps the last BUSY cause",
    async (ct) => {
      reset();
      const epoch = 20_000;
      ct.mock.timers.enable({ apis: ["Date", "setTimeout"], now: epoch });
      let inspections = 0;
      attempt = (operation) => {
        if (operation === "inspect" && ++inspections === 1) {
          ct.mock.timers.setTime(epoch + 3_600_000 - 100);
          throw busy;
        }
        if (operation === "PRAGMA journal_mode = WAL") throw busy;
      };
      const pending = start();
      const rejected = assert.rejects(pending, (error: unknown) => {
        assert.equal((error as Error).cause, busy);
        assert.equal((error as { kind: string }).kind, "lock_timeout");
        assert.equal((error as Error).message, "Task storage lock wait expired");
        return true;
      });
      await drain();
      ct.mock.timers.tick(100);
      await rejected;
      assert.equal(inspections, 2);
      assert.equal(phases.filter((phase) => phase === "waiting_for_lock").length, 1);
      assert.equal(operations.at(-1), "close");
      assert.equal(operations.includes("migrated"), false);
      assert.equal(operations.includes("BEGIN IMMEDIATE"), false);
    },
  );
  for (const failure of [undefined, null, false, 0, { errcode: 6 }]) {
    await t.test(
      "non-BUSY failure is neither replaced nor retried: " + String(failure),
      async () => {
        reset();
        attempt = (operation) => {
          if (operation === "inspect") throw failure;
        };
        let caught = false;
        try {
          await start();
        } catch (error) {
          caught = true;
          assert.equal(error, failure);
        }
        assert.equal(caught, true);
        assert.equal(operations.filter((operation) => operation === "inspect").length, 1);
        assert.equal(phases.includes("waiting_for_lock"), false);
        assert.equal(operations.at(-1), "close");
      },
    );
  }
  await t.test("hostile errcode getter preserves the original thrown object", async () => {
    reset();
    const failure = Object.defineProperty({}, "errcode", {
      get() {
        throw new Error("probe failure");
      },
    });
    attempt = (operation) => {
      if (operation === "inspect") throw failure;
    };
    await assert.rejects(start(), (error) => error === failure);
    assert.equal(phases.includes("waiting_for_lock"), false);
    assert.equal(operations.at(-1), "close");
  });
  await t.test(
    "progress rejection schedules no retry and preserves its original failure",
    async (ct) => {
      reset();
      ct.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 30_000 });
      const failure = new Error("blocked progress failure");
      attempt = (operation) => {
        if (operation === "inspect") throw busy;
      };
      progress = (phase) => {
        if (phase === "waiting_for_lock") throw failure;
      };
      await assert.rejects(start(), (error) => error === failure);
      ct.mock.timers.tick(1_000);
      await drain();
      assert.equal(operations.filter((operation) => operation === "inspect").length, 1);
      assert.equal(operations.at(-1), "close");
    },
  );
});
