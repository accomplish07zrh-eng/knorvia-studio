import { AutomationRepo } from "#src/session/automationRepo.js";
import { TaskIndexRepo } from "#src/session/taskIndexRepo.js";
import {
  createTasksDatabaseSnapshot,
  inspectTasksMigrationKind,
  runTasksDatabaseMigrations,
} from "#src/session/tasksDatabase/migrations.js";
import {
  markTasksStorageMigrated,
  markTasksStoragePrepared,
} from "#src/session/tasksDatabase/prepared.js";
import type { DatabaseMigrationFacts } from "@knorvia/shared";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

// Repo 使用相同原生入口，避免构建器把 node:sqlite 改写成 npm 包。
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

type TasksStoragePhase =
  | "checking"
  | "waiting_for_lock"
  | "migrating"
  | "maintaining"
  | "committing"
  | "ready";
const LOCK_WAIT_MS = 60 * 60_000;

class StartupFailure {
  private first: { error: unknown } | undefined;

  remember(error: unknown, migration?: DatabaseMigrationFacts): void {
    if (this.first) return;
    // 用记录是否存在区分成功和失败，不能按异常值的真假丢失首因。
    this.first = { error };
    if (!migration || !error || typeof error !== "object") return;
    try {
      Object.assign(error, { startupMigration: { ...migration } });
    } catch {
      // 冻结异常的附加事实失败不改变原异常身份。
    }
  }

  close(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.remember(error);
    }
  }

  raise(): void {
    if (this.first) throw this.first.error;
  }
}

function isBusyFailure(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  try {
    const code = (error as { errcode?: unknown }).errcode;
    return typeof code === "number" && (code & 0xff) === 5;
  } catch {
    // 读取 errcode 不能用探测异常覆盖原失败，只有确切 BUSY 才能重试。
    return false;
  }
}

type StorageLockAttempt = { kind: "acquired" } | { kind: "busy"; cause: unknown };

function attemptStorageLock(operation: () => void): StorageLockAttempt {
  try {
    operation();
    return { kind: "acquired" };
  } catch (cause) {
    if (!isBusyFailure(cause)) throw cause;
    return { kind: "busy", cause };
  }
}

class StorageLockWindow {
  private readonly expiresAt = Date.now() + LOCK_WAIT_MS;

  constructor(private readonly blocked: () => void) {}

  acquire(operation: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let announced = false;
      const attempt = (): void => {
        try {
          const verdict = attemptStorageLock(operation);
          if (verdict.kind === "acquired") {
            resolve();
            return;
          }
          if (Date.now() >= this.expiresAt) {
            throw Object.assign(
              new Error("Task storage lock wait expired", { cause: verdict.cause }),
              { kind: "lock_timeout" },
            );
          }
          if (!announced) {
            announced = true;
            this.blocked();
          }
          // 每个请求只安排下一次尝试；成功或失败不再排队，共享截止时间不在这里重置。
          setTimeout(attempt, 100);
        } catch (error) {
          reject(error);
        }
      };
      attempt();
    });
  }
}

/** Host 的唯一存储准备入口；迁移和修复仍由现有数据库/Repo 所有者执行。 */
export async function prepareTasksIndexStorage(
  path: string,
  onProgress: (phase: TasksStoragePhase, migration?: DatabaseMigrationFacts) => void,
): Promise<void> {
  const report = (phase: TasksStoragePhase, facts?: DatabaseMigrationFacts) =>
    onProgress(phase, facts ? { ...facts } : undefined);
  report("checking");
  await mkdir(dirname(path), { recursive: true });

  const database = new DatabaseSync(path);
  const databaseFailure = new StartupFailure();
  let migration: DatabaseMigrationFacts | undefined;
  try {
    database.exec("PRAGMA busy_timeout = 25");
    database.exec("PRAGMA foreign_keys = ON");
    const locks = new StorageLockWindow(() => report("waiting_for_lock", migration));
    await locks.acquire(() => {
      migration = {
        kind: inspectTasksMigrationKind(database),
        executedCount: 0,
        committedCount: 0,
      };
    });
    report("checking", migration);
    if (migration?.kind === "upgrade") {
      // 规格要求升级快照先于 WAL/写事务；失败不能继续进入迁移。
      await locks.acquire(() => createTasksDatabaseSnapshot(database));
    }
    await locks.acquire(() => database.exec("PRAGMA journal_mode = WAL"));
    database.exec("PRAGMA synchronous = NORMAL");
    await locks.acquire(() => database.exec("BEGIN IMMEDIATE"));
    runTasksDatabaseMigrations(database, {
      transactionOpen: true,
      migration,
      onProgress: report,
    });
    report("maintaining", migration);
  } catch (error) {
    databaseFailure.remember(error, migration);
  } finally {
    databaseFailure.close(() => database.close());
  }
  databaseFailure.raise();

  markTasksStorageMigrated(path);
  const repositories = [
    new TaskIndexRepo(path, LOCK_WAIT_MS),
    new AutomationRepo(path, LOCK_WAIT_MS),
  ];
  const repositoryFailure = new StartupFailure();
  try {
    for (const repository of repositories) await repository.ensureReady();
  } catch (error) {
    repositoryFailure.remember(error);
  } finally {
    for (const repository of repositories) {
      repositoryFailure.close(() => repository.close({ throwOnError: true }));
    }
  }
  repositoryFailure.raise();
  markTasksStoragePrepared(path);
  report("ready", migration);
}
