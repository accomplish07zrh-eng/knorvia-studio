import { resolveWorkspaceKey } from "@knorvia/shared";
import type { KnorviaProvider, KnorviaTaskMeta } from "@knorvia/shared";
import type {
  KnorviaGroupedTaskRef,
  KnorviaTaskListWorkspaceScope,
  KnorviaTaskGroup,
  KnorviaTaskGroupColor,
} from "#src/session/taskListTypes.js";
export type TaskRef = KnorviaGroupedTaskRef;
export type TaskScope = KnorviaTaskListWorkspaceScope;
export type SyncInput = {
  meta: KnorviaTaskMeta;
  pinned?: boolean;
  archived?: boolean;
  deleted?: boolean;
  titleOverridden?: boolean;
  searchableText?: string;
};
export type StatePatch = {
  pinned?: boolean;
  archived?: boolean;
  deleted?: boolean;
  title?: string;
  titleOverridden?: boolean;
  unreadAt?: number;
  model?: string;
  status?: KnorviaTaskMeta["status"];
  lastError?: KnorviaTaskMeta["lastError"];
  target?: KnorviaTaskMeta["target"];
  updatedAt?: number;
};
export type StateInput = TaskRef & { patch: StatePatch };
export type AgentInput = TaskRef & {
  patch: Pick<StatePatch, "title" | "status" | "lastError" | "target" | "updatedAt">;
};
export type ListInput = {
  workspacePath?: string;
  workspaceIdentity?: string;
  provider?: KnorviaProvider;
  pinned?: boolean;
  archived?: boolean;
  includeDeleted?: boolean;
};
export type ArchiveInput = {
  workspacePath: string;
  workspaceIdentity?: string;
  olderThanDays: number;
  provider?: KnorviaProvider;
};
export type TaskRow = {
  workspace_key: string;
  workspace_path: string;
  workspace_identity: string | null;
  task_id: string;
  title: string;
  task_status: KnorviaTaskMeta["status"] | null;
  provider: string | null;
  mode: string;
  model: string | null;
  migration_source: KnorviaTaskMeta["migrationSource"] | null;
  forked_from_task_id: string | null;
  cron_automation_id: string | null;
  off_peak_task_id?: string | null;
  created_at: number;
  updated_at: number;
  unread_at: number | null;
  last_unread_at: number;
  pinned: number;
  archived: number;
  deleted: number;
  title_overridden: number;
  searchable_text: string;
  meta_json: string;
};
export type MemberRow = {
  group_id: string;
  workspace_key: string;
  workspace_path: string;
  workspace_identity: string | null;
  task_id: string;
  sort_order: number | null;
  added_at: number;
  created_at: number;
  updated_at: number;
};
export type GroupRow = {
  group_id: string;
  title: string;
  color: string;
  created_at: number;
  updated_at: number;
};
export type OrderRow = {
  node_type: string;
  node_key: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};
export const BOOTSTRAP_ONCE = "__knorvia_internal_grouped_workspace_bootstrap_once__";
export const colors: readonly KnorviaTaskGroupColor[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];
export function color(value: string): KnorviaTaskGroupColor {
  return colors.find((item) => item === value) ?? "gray";
}
export function groupMeta(row: GroupRow): KnorviaTaskGroup {
  return {
    id: row.group_id,
    title: row.title,
    color: color(row.color),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function workspace(ref: { workspacePath: string; workspaceIdentity?: string }): string {
  return resolveWorkspaceKey(ref);
}
export function entity(workspaceKey: string, taskId: string): string {
  return workspaceKey + "\u0000" + taskId;
}
export function taskNode(workspaceKey: string, taskId: string): string {
  return JSON.stringify([workspaceKey, taskId]);
}
export function scopeKeys(scopes: TaskScope[]): string[] {
  return [...new Set(scopes.map(workspace).filter((key) => key.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}
export function bootstrapScopes(scopes: TaskScope[]): TaskScope[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = workspace(scope);
    if (scope.workspacePurpose === "conversation" || !key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
