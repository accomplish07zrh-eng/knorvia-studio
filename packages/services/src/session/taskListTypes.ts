import type { WorkspacePurpose, KnorviaTaskMeta } from "@knorvia/shared";

export type KnorviaTaskListKind = "pinned" | "archived" | "timeline" | "active";
export type KnorviaTaskListSortBy = "created" | "updated";

export interface KnorviaTaskListWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: WorkspacePurpose;
}

export interface KnorviaTaskListQuery {
  kind: KnorviaTaskListKind;
  workspaceScopes: KnorviaTaskListWorkspaceScope[];
  sortBy: KnorviaTaskListSortBy;
  search?: string;
  limit?: number;
}

export type KnorviaTaskListItem = KnorviaTaskMeta & {
  searchSnippet?: string;
  searchSnippets?: string[];
};

export interface KnorviaTaskListResult {
  items: KnorviaTaskListItem[];
  total: number;
  hasMore: boolean;
}

export type KnorviaTaskGroupColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface KnorviaTaskGroup {
  id: string;
  title: string;
  color: KnorviaTaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

export interface KnorviaGroupedTaskRef {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export type KnorviaGroupedTaskViewTopLevelNodeRef =
  | { type: "group"; groupId: string }
  | { type: "task"; task: KnorviaGroupedTaskRef };

export type KnorviaGroupedTaskViewNode =
  | {
      type: "group";
      group: KnorviaTaskGroup;
      tasks: KnorviaTaskListItem[];
      sortOrder?: number;
    }
  | {
      type: "task";
      task: KnorviaTaskListItem;
      sortOrder?: number;
    };

export interface KnorviaGroupedTaskView {
  nodes: KnorviaGroupedTaskViewNode[];
}

export interface KnorviaGroupedTaskViewQuery {
  workspaceScopes: KnorviaTaskListWorkspaceScope[];
  includeAllWorkspaces?: boolean;
}

// ── grouped 原始结构（不 join tasks 表）──
// grouped 视图的任务数据源迁到 sessions-index 后，服务端只提供分组结构
// （task_groups / task_group_members / task_group_view_node_orders），
// 由客户端与 sessions-index 会话做 join。

/** 组成员引用（不含任务 meta；task 内容由 sessions-index 提供）。 */
export interface KnorviaGroupedTaskViewStructureMember {
  groupId: string;
  /** 服务端口径 workspaceKey（resolveWorkspaceKey：identity ?? path），join 匹配键。 */
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  /** null = 尚未落 sort_order（新加入组）；客户端按 addedAt 降序补内存序。 */
  sortOrder: number | null;
  addedAt: number;
}

/** 顶层节点排序（task_group_view_node_orders，node_key 已解析为结构化引用）。 */
export type KnorviaGroupedTaskViewStructureTopOrder =
  | { type: "group"; groupId: string; sortOrder: number }
  | { type: "task"; workspaceKey: string; taskId: string; sortOrder: number };

export interface KnorviaGroupedTaskViewStructure {
  /** 已按 workspaceScopes 可见性过滤的 group（bootstrap workspace group 只在其 workspace 可见）。 */
  groups: KnorviaTaskGroup[];
  /** 全量组成员（含不可见 group 的成员——顶层排除规则需要全量判断）。 */
  members: KnorviaGroupedTaskViewStructureMember[];
  topLevelOrders: KnorviaGroupedTaskViewStructureTopOrder[];
}

export interface KnorviaGroupedTaskViewOrderInput {
  workspaceScopes: KnorviaTaskListWorkspaceScope[];
  topLevelNodes: KnorviaGroupedTaskViewTopLevelNodeRef[];
  groups: Array<{
    groupId: string;
    taskRefs: KnorviaGroupedTaskRef[];
  }>;
}

export interface KnorviaWorkspaceEventSubscriptionParams {
  workspacePath: string;
  workspaceIdentity?: string;
}
