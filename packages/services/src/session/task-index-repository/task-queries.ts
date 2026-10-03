import type { KnorviaProvider, KnorviaTaskMeta } from "@knorvia/shared";
import type {
  KnorviaTaskListItem,
  KnorviaTaskListQuery,
  KnorviaTaskListResult,
} from "#src/session/taskListTypes.js";
import { workspace, scopeKeys } from "./model.js";
import type { ArchiveInput, ListInput, TaskRef, TaskRow } from "./model.js";
import { SQL, fill } from "./sql.js";
import { Store } from "./store.js";
function snippets(text: string, search?: string): string[] {
  if (!search || !text.trim()) return [];
  const needle = search.toLocaleLowerCase(),
    haystack = text.toLocaleLowerCase();
  const found: string[] = [],
    windows: Array<[number, number]> = [];
  let cursor = 0;
  while (found.length < 4) {
    const match = haystack.indexOf(needle, cursor);
    if (match < 0) break;
    cursor = match + search.length;
    const start = Math.max(0, match - 20),
      end = Math.min(text.length, match + needle.length + 72);
    if (windows.some(([a, b]) => Math.min(b, end) - Math.max(a, start) > 0)) continue;
    const value = (
      (start > 0 ? "..." : "") +
      text.slice(start, end) +
      (end < text.length ? "..." : "")
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    if (value) {
      found.push(value);
      windows.push([start, end]);
    }
  }
  if (!found.length) {
    const fallback = text.replace(/\s+/g, " ").trim().slice(0, 140);
    if (fallback) found.push(fallback);
  }
  return found;
}
export class TaskQueries {
  constructor(private store: Store) {}
  item(row: TaskRow, search?: string): KnorviaTaskListItem {
    const meta = this.store.project(row),
      matches = snippets(row.searchable_text, search);
    return matches.length ? { ...meta, searchSnippet: matches[0], searchSnippets: matches } : meta;
  }
  async get(ref: TaskRef): Promise<KnorviaTaskMeta | null> {
    await this.store.ready();
    const row = this.store.read(ref);
    return !row || row.deleted === 1 ? null : this.store.project(row);
  }
  async list(input: ListInput): Promise<KnorviaTaskMeta[]> {
    await this.store.ready();
    const rows = this.store
      .database()
      .prepare(SQL.list)
      .all({
        workspace_key: input.workspacePath
          ? workspace({
              workspacePath: input.workspacePath,
              workspaceIdentity: input.workspaceIdentity,
            })
          : null,
        include_deleted: input.includeDeleted ? 1 : 0,
        provider: input.provider ?? null,
        pinned: typeof input.pinned === "boolean" ? (input.pinned ? 1 : 0) : null,
        archived: typeof input.archived === "boolean" ? (input.archived ? 1 : 0) : null,
      }) as TaskRow[];
    return rows.map((row) => this.store.project(row));
  }
  async deleted(input: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
  }): Promise<string[]> {
    await this.store.ready();
    const rows = this.store
      .database()
      .prepare(SQL.deletedIds)
      .all({ workspace_key: workspace(input), provider: input.provider ?? null }) as Array<{
      task_id: string;
    }>;
    return rows.map((row) => row.task_id);
  }
  async automation(id: string): Promise<KnorviaTaskMeta[]> {
    await this.store.ready();
    return (
      this.store.database().prepare(SQL.automation).all({ automation_id: id }) as TaskRow[]
    ).map((row) => this.store.project(row));
  }
  async query(
    input: KnorviaTaskListQuery & { provider?: KnorviaProvider },
  ): Promise<KnorviaTaskListResult> {
    await this.store.ready();
    const keys = scopeKeys(input.workspaceScopes);
    if (!keys.length) return { items: [], total: 0, hasMore: false };
    const where = ["deleted = 0", `workspace_key IN (${keys.map(() => "?").join(", ")})`];
    const args: Array<string | number> = [...keys];
    if (input.provider) {
      where.push("provider = ?");
      args.push(input.provider);
    }
    if (input.kind === "pinned") where.push("pinned = 1", "archived = 0");
    else if (input.kind === "archived") where.push("archived = 1");
    else where.push("pinned = 0", "archived = 0");
    const search = input.search?.trim();
    if (search) {
      where.push("(LOWER(title) LIKE ? OR LOWER(searchable_text) LIKE ?)");
      const like = "%" + search.toLocaleLowerCase() + "%";
      args.push(like, like);
    }
    const condition = where.join(" AND ");
    const total =
      this.store.get<{ total: number }>(fill(SQL.count, condition), ...args)?.total ?? 0;
    const order =
      input.sortBy === "created"
        ? "created_at DESC, updated_at DESC, task_id DESC"
        : "updated_at DESC, created_at DESC, task_id DESC";
    const limit =
      typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
        ? Math.floor(input.limit)
        : null;
    const rows = this.store.all<TaskRow>(
      fill(SQL.query, condition, order, limit === null ? "" : " LIMIT ?"),
      ...args,
      ...(limit === null ? [] : [limit]),
    );
    const purposes = new Map(
      input.workspaceScopes
        .filter((scope) => scope.workspacePurpose)
        .map((scope) => [workspace(scope), scope.workspacePurpose]),
    );
    const items = rows.map((row) => {
      const item = this.item(row, search),
        purpose = purposes.get(row.workspace_key);
      return purpose ? { ...item, workspacePurpose: purpose } : item;
    });
    return { items, total, hasMore: total > rows.length };
  }
  async archive(input: ArchiveInput): Promise<KnorviaTaskMeta[]> {
    await this.store.ready();
    const cutoff = Date.now() - Math.max(1, Math.floor(input.olderThanDays)) * 86400000;
    const where = [
      "workspace_key = ?",
      "deleted = 0",
      "archived = 0",
      "pinned = 0",
      "unread_at IS NULL",
      "updated_at < ?",
      "task_status = 'completed'",
    ];
    const args: Array<string | number> = [workspace(input), cutoff];
    if (input.provider) {
      where.push("provider = ?");
      args.push(input.provider);
    }
    const rows = this.store.all<TaskRow>(fill(SQL.stale, where.join(" AND ")), ...args);
    if (!rows.length) return [];
    const update = this.store.database().prepare(SQL.archive);
    this.store.transaction(() => {
      for (const row of rows) update.run(row.workspace_key, row.task_id);
    });
    return rows.map((row) => this.store.project(row));
  }
}
