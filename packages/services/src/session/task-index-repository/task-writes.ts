import { CRON_DEFAULT_GROUP_ID } from "@knorvia/shared";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { AgentInput, StateInput, SyncInput, TaskRef } from "./model.js";
import { Store } from "./store.js";
import { Groups } from "./groups.js";
export class TaskWrites {
  constructor(
    private store: Store,
    private groups: Groups,
  ) {}
  sync(input: SyncInput): Promise<KnorviaTaskMeta> {
    return this.store.enqueue(input.meta, () => this.syncNow(input));
  }
  syncAtTop(
    input: SyncInput,
  ): Promise<{ meta: KnorviaTaskMeta; initializedGroupedOrder: boolean }> {
    return this.store.enqueue(input.meta, () =>
      this.store.transaction(() => {
        const meta = this.syncNow(input);
        return { meta, initializedGroupedOrder: this.groups.initializeTop(input.meta) };
      }),
    );
  }
  private syncNow(input: SyncInput): KnorviaTaskMeta {
    const row = this.store.read(input.meta);
    const old = row ? this.store.project(row) : undefined;
    const incoming = input.meta;
    const titleOverridden = input.titleOverridden ?? row?.title_overridden === 1;
    const terminal = old?.status === "completed" || old?.status === "error";
    const keepTerminal =
      terminal &&
      (!incoming.status || incoming.status === "running") &&
      (old?.updatedAt ?? 0) > incoming.updatedAt;
    const meta: KnorviaTaskMeta = {
      ...incoming,
      title: titleOverridden && old ? old.title : incoming.title,
      titleOverridden,
      status: keepTerminal ? old?.status : incoming.status,
      lastError: keepTerminal ? old?.lastError : incoming.lastError,
      target: Object.prototype.hasOwnProperty.call(incoming, "target")
        ? incoming.target
        : old?.target,
      migrationSource: incoming.migrationSource ?? old?.migrationSource,
      cronAutomationId: incoming.cronAutomationId ?? old?.cronAutomationId,
      offPeakTaskId: incoming.offPeakTaskId ?? old?.offPeakTaskId,
      updatedAt: Math.max(incoming.updatedAt, old?.updatedAt ?? 0),
      unreadAt: incoming.unreadAt ?? old?.unreadAt,
    };
    const saved = this.store.write(meta, {
      pinned: input.pinned ?? row?.pinned === 1,
      archived: input.archived ?? row?.archived === 1,
      deleted: input.deleted ?? row?.deleted === 1,
      titleOverridden,
      searchableText: input.searchableText,
    });
    if (meta.cronAutomationId && !old?.cronAutomationId)
      this.store.systemGroup(meta, CRON_DEFAULT_GROUP_ID, "cron", "blue");
    if (meta.offPeakTaskId && !old?.offPeakTaskId) this.store.offPeak(meta);
    return saved;
  }
  seed(meta: KnorviaTaskMeta): Promise<KnorviaTaskMeta> {
    return this.store.enqueue(meta, () => {
      const row = this.store.read(meta);
      return row
        ? this.store.project(row)
        : this.store.write(meta, {
            pinned: false,
            archived: false,
            deleted: false,
            titleOverridden: meta.titleOverridden ?? false,
          });
    });
  }
  clearUnread(
    input: TaskRef & { expectedUnreadAt: number },
  ): Promise<{ meta: KnorviaTaskMeta; cleared: boolean }> {
    return this.store.enqueue(input, () =>
      this.store.transaction(() => {
        const row = this.store.requireRow(input),
          current = this.store.project(row);
        if (current.unreadAt !== input.expectedUnreadAt) return { meta: current, cleared: false };
        const meta = this.store.write(
          { ...current, unreadAt: undefined },
          {
            pinned: row.pinned === 1,
            archived: row.archived === 1,
            deleted: false,
            titleOverridden: row.title_overridden === 1,
            writeUnread: true,
          },
        );
        return { meta, cleared: true };
      }),
    );
  }
  deleteArchived(input: TaskRef): Promise<KnorviaTaskMeta | null> {
    return this.store.enqueue(input, () =>
      this.store.transaction(() => {
        const row = this.store.read(input);
        if (!row || row.deleted === 1 || row.archived !== 1) return null;
        const saved = this.store.write(this.store.project(row), {
          pinned: row.pinned === 1,
          archived: true,
          deleted: true,
          titleOverridden: row.title_overridden === 1,
        });
        this.store.removeReferences(row.workspace_key, row.task_id);
        return saved;
      }),
    );
  }
  update(input: StateInput): Promise<KnorviaTaskMeta> {
    return this.store.enqueue(input, () => {
      const run = () => {
        const row = this.store.requireRow(input),
          old = this.store.project(row),
          patch = input.patch;
        const writesUnread = "unreadAt" in patch;
        const unreadAt =
          typeof patch.unreadAt === "number"
            ? Math.max(
                patch.unreadAt,
                Math.max(row.last_unread_at, row.unread_at ?? 0, old.unreadAt ?? 0) + 1,
              )
            : writesUnread
              ? undefined
              : old.unreadAt;
        const meta: KnorviaTaskMeta = {
          ...old,
          title: patch.title ?? old.title,
          titleOverridden: patch.titleOverridden ?? old.titleOverridden,
          model: patch.model ?? old.model,
          updatedAt: patch.updatedAt ?? old.updatedAt,
          status: patch.status ?? old.status,
          lastError: "lastError" in patch ? patch.lastError : old.lastError,
          target: "target" in patch ? patch.target : old.target,
          unreadAt,
        };
        const saved = this.store.write(meta, {
          pinned: patch.pinned ?? row.pinned === 1,
          archived: patch.archived ?? row.archived === 1,
          deleted: patch.deleted ?? row.deleted === 1,
          titleOverridden: patch.titleOverridden ?? row.title_overridden === 1,
          writeUnread: writesUnread,
        });
        if (patch.deleted === true) this.store.removeReferences(row.workspace_key, row.task_id);
        return saved;
      };
      return input.patch.deleted === true || "unreadAt" in input.patch
        ? this.store.transaction(run)
        : run();
    });
  }
  agent(input: AgentInput): Promise<KnorviaTaskMeta | null> {
    return this.store.enqueue(input, () => {
      const row = this.store.read(input);
      if (!row || row.deleted === 1) return null;
      const old = this.store.project(row),
        patch = input.patch;
      return this.store.write(
        {
          ...old,
          title: row.title_overridden !== 1 && patch.title ? patch.title : old.title,
          titleOverridden: row.title_overridden === 1,
          updatedAt: patch.updatedAt ?? old.updatedAt,
          status: patch.status ?? old.status,
          lastError: "lastError" in patch ? patch.lastError : old.lastError,
          target: "target" in patch ? patch.target : old.target,
        },
        {
          pinned: row.pinned === 1,
          archived: row.archived === 1,
          deleted: row.deleted === 1,
          titleOverridden: row.title_overridden === 1,
        },
      );
    });
  }
}
