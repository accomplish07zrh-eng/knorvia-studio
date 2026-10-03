import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  isRemoteWorkspaceIdentity,
  KNORVIA_AGENT_PROVIDER,
  knorviaTaskMetaSchema,
  OFF_PEAK_DEFAULT_GROUP_ID,
} from "@knorvia/shared";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { getTasksIndexDatabasePath } from "#src/paths.js";
import {
  isTasksStorageMigrated,
  isTasksStoragePrepared,
} from "#src/session/tasksDatabase/prepared.js";
import { runTasksDatabaseMigrations } from "#src/session/tasksDatabase/migrations.js";
import { entity, taskNode, workspace } from "./model.js";
import type { TaskRef, TaskRow } from "./model.js";
import { SQL, fill } from "./sql.js";
const { DatabaseSync: OpenDatabase } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};
const logger = createServiceLogger("task-index-repo");
type Flags = {
  pinned: boolean;
  archived: boolean;
  deleted: boolean;
  titleOverridden: boolean;
  writeUnread?: boolean;
  searchableText?: string;
};
export class Store {
  private db?: DatabaseSync;
  private boundPath?: string;
  private initializing?: Promise<void>;
  private writes = new Map<string, Promise<void>>();
  constructor(
    private startupPath?: string,
    private timeout = 5000,
  ) {}
  async ready(): Promise<void> {
    const path = this.startupPath ?? getTasksIndexDatabasePath();
    if (this.boundPath && this.boundPath !== path) this.close();
    if (!this.initializing) {
      this.initializing = this.initialize(path).catch((error) => {
        this.close();
        throw error;
      });
    }
    await this.initializing;
  }
  close(options?: { throwOnError?: boolean }): void {
    let failure: unknown;
    try {
      this.db?.close();
    } catch (error) {
      failure = error;
    }
    this.db = undefined;
    this.boundPath = undefined;
    this.initializing = undefined;
    this.writes.clear();
    if (options?.throwOnError && failure) throw failure;
  }
  database(): DatabaseSync {
    if (!this.db) throw new Error("task index sqlite 尚未初始化");
    return this.db;
  }
  get<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
    return this.database()
      .prepare(sql)
      .get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]): T[] {
    return this.database()
      .prepare(sql)
      .all(...args) as T[];
  }
  exec(sql: string): void {
    this.database().exec(sql);
  }
  transaction<T>(operation: () => T): T {
    this.exec(SQL.begin);
    try {
      const value = operation();
      this.exec(SQL.commit);
      return value;
    } catch (error) {
      this.exec(SQL.rollback);
      throw error;
    }
  }
  async enqueue<T>(ref: TaskRef, operation: () => T): Promise<T> {
    await this.ready();
    const key = entity(workspace(ref), ref.taskId);
    const previous = this.writes.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );
    this.writes.set(key, completion);
    void completion.then(() => {
      if (this.writes.get(key) === completion) this.writes.delete(key);
    });
    return result;
  }
  read(ref: TaskRef): TaskRow | undefined {
    return this.get<TaskRow>(SQL.task, workspace(ref), ref.taskId);
  }
  requireRow(ref: TaskRef): TaskRow {
    const row = this.read(ref);
    if (!row || row.deleted === 1) throw new Error(`task index 中不存在 task: ${ref.taskId}`);
    return row;
  }
  project(row: TaskRow): KnorviaTaskMeta {
    const identity = row.workspace_identity?.trim();
    const workspaceIdentity =
      identity === row.workspace_key
        ? identity
        : isRemoteWorkspaceIdentity(row.workspace_key)
          ? row.workspace_key
          : undefined;
    try {
      const parsed = knorviaTaskMetaSchema.safeParse(JSON.parse(row.meta_json));
      if (parsed.success)
        return {
          ...parsed.data,
          taskId: row.task_id,
          workspacePath: row.workspace_path,
          workspaceIdentity,
          unreadAt: row.unread_at ?? undefined,
          cronAutomationId: parsed.data.cronAutomationId ?? row.cron_automation_id ?? undefined,
          offPeakTaskId: parsed.data.offPeakTaskId ?? row.off_peak_task_id ?? undefined,
          titleOverridden: row.title_overridden === 1,
        };
      logger.warn(
        undefined,
        `读取 task index meta_json 非法 taskId=${row.task_id}`,
        parsed.error.flatten(),
      );
    } catch (error) {
      logger.warn(undefined, `读取 task index meta_json 失败 taskId=${row.task_id}`, error);
    }
    return {
      taskId: row.task_id,
      traceId: "knorvia-" + row.task_id,
      title: row.title,
      titleOverridden: row.title_overridden === 1,
      workspacePath: row.workspace_path,
      workspaceIdentity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mode: row.mode as KnorviaTaskMeta["mode"],
      model: row.model ?? undefined,
      provider: row.provider === KNORVIA_AGENT_PROVIDER ? KNORVIA_AGENT_PROVIDER : undefined,
      migrationSource: row.migration_source ?? undefined,
      forkedFromTaskId: row.forked_from_task_id ?? undefined,
      cronAutomationId: row.cron_automation_id ?? undefined,
      offPeakTaskId: row.off_peak_task_id ?? undefined,
      unreadAt: row.unread_at ?? undefined,
      status: row.task_status ?? undefined,
    };
  }
  write(meta: KnorviaTaskMeta, flags: Flags): KnorviaTaskMeta {
    const searchableText =
      flags.searchableText !== undefined
        ? flags.searchableText.slice(0, 200000)
        : (this.read(meta)?.searchable_text ?? "");
    this.database()
      .prepare(SQL.writeTask)
      .run({
        workspace_key: workspace(meta),
        workspace_path: meta.workspacePath,
        workspace_identity: meta.workspaceIdentity ?? null,
        task_id: meta.taskId,
        title: meta.title,
        task_status: meta.status ?? null,
        provider: meta.provider ?? null,
        mode: meta.mode,
        model: meta.model ?? null,
        migration_source: meta.migrationSource ?? null,
        forked_from_task_id: meta.forkedFromTaskId ?? null,
        cron_automation_id: meta.cronAutomationId ?? null,
        off_peak_task_id: meta.offPeakTaskId ?? null,
        created_at: meta.createdAt,
        updated_at: meta.updatedAt,
        unread_at: meta.unreadAt ?? null,
        last_unread_at: meta.unreadAt ?? 0,
        pinned: flags.pinned ? 1 : 0,
        archived: flags.archived ? 1 : 0,
        deleted: flags.deleted ? 1 : 0,
        title_overridden: flags.titleOverridden ? 1 : 0,
        write_unread_at: flags.writeUnread ? 1 : 0,
        searchable_text: searchableText,
        meta_json: JSON.stringify(meta),
      });
    const saved = this.read(meta);
    if (!saved) throw new Error(`task index 写入后缺少 task: ${meta.taskId}`);
    return this.project(saved);
  }
  removeReferences(key: string, id: string): void {
    this.database().prepare(SQL.removeMember).run(key, id);
    this.database().prepare(SQL.removeTaskOrder).run(taskNode(key, id), key);
  }
  nextTop(): number {
    return (
      (this.get<{ min_sort_order: number | null }>(SQL.minimum)?.min_sort_order ?? 2000) - 1000
    );
  }
  systemGroup(ref: TaskRef, id: string, title: string, color: string): void {
    const now = Date.now();
    this.database().prepare(SQL.systemGroup).run(id, title, color, now, now);
    this.database().prepare(SQL.systemOrder).run(id, this.nextTop(), now, now);
    this.database()
      .prepare(SQL.systemMember)
      .run(
        id,
        workspace(ref),
        ref.workspacePath,
        ref.workspaceIdentity ?? null,
        ref.taskId,
        now,
        now,
        now,
      );
  }
  offPeak(ref: TaskRef): void {
    if (ref.workspaceIdentity && isRemoteWorkspaceIdentity(ref.workspaceIdentity)) return;
    this.systemGroup(ref, OFF_PEAK_DEFAULT_GROUP_ID, "off-peak", "purple");
  }
  private async initialize(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (!this.db) {
      this.db = new OpenDatabase(path);
      this.boundPath = path;
    }
    this.exec(fill(SQL.busy, String(this.timeout)));
    this.exec(SQL.foreign);
    const prepared = isTasksStoragePrepared(path, this.database());
    if (!isTasksStorageMigrated(path, this.database())) runTasksDatabaseMigrations(this.database());
    this.exec(SQL.wal);
    this.exec(SQL.normal);
    if (prepared) return;
    if (this.get(SQL.legacyExists)) this.exec(SQL.legacyBackfill);
    for (const row of this.all<
      Pick<TaskRow, "workspace_key" | "workspace_path" | "workspace_identity" | "task_id">
    >(SQL.offPeakRows)) {
      if (isRemoteWorkspaceIdentity(row.workspace_key)) continue;
      this.offPeak({
        workspacePath: row.workspace_path,
        workspaceIdentity: row.workspace_identity ?? undefined,
        taskId: row.task_id,
      });
    }
    const deleted = this.all<Pick<TaskRow, "workspace_key" | "task_id">>(SQL.deletedRows);
    if (deleted.length)
      this.transaction(() => {
        for (const row of deleted) this.removeReferences(row.workspace_key, row.task_id);
      });
  }
}
