import { CRON_DEFAULT_GROUP_ID } from "@knorvia/shared";
import type { KnorviaProvider } from "@knorvia/shared";
import type {
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewNode,
  KnorviaGroupedTaskViewQuery,
  KnorviaGroupedTaskViewStructure,
  KnorviaGroupedTaskViewStructureTopOrder,
  KnorviaTaskListItem,
} from "#src/session/taskListTypes.js";
import { bootstrap } from "./bootstrap.js";
import { entity, groupMeta, scopeKeys, taskNode, workspace } from "./model.js";
import type { GroupRow, MemberRow, OrderRow, TaskRow, TaskScope } from "./model.js";
import { Store } from "./store.js";
import { TaskQueries } from "./task-queries.js";
import { SQL, fill } from "./sql.js";
function itemKey(item: KnorviaTaskListItem): string {
  return entity(workspace(item), item.taskId);
}
function nodeKey(node: KnorviaGroupedTaskViewNode): string {
  return node.type === "group"
    ? "group:" + node.group.id
    : "task:" + taskNode(workspace(node.task), node.task.taskId);
}
export class GroupView {
  constructor(
    private store: Store,
    private tasks: TaskQueries,
  ) {}
  private visibleGroups(keys: Set<string>): GroupRow[] {
    const bootstraps = new Map(
      this.store
        .all<{ workspace_key: string; group_id: string }>(SQL.bootstrapGroups)
        .map((row) => [row.group_id, row.workspace_key]),
    );
    return this.store
      .all<GroupRow>(SQL.groups)
      .filter((row) => !bootstraps.has(row.group_id) || keys.has(bootstraps.get(row.group_id)!));
  }
  async structure(input: {
    workspaceScopes: Array<{ workspacePath: string; workspaceIdentity?: string }>;
  }): Promise<KnorviaGroupedTaskViewStructure> {
    await this.store.ready();
    const groups = this.visibleGroups(new Set(scopeKeys(input.workspaceScopes))).map(groupMeta);
    const members = this.store.all<MemberRow>(SQL.members).map((row) => ({
      groupId: row.group_id,
      workspaceKey: row.workspace_key,
      workspacePath: row.workspace_path,
      ...(row.workspace_identity ? { workspaceIdentity: row.workspace_identity } : {}),
      taskId: row.task_id,
      sortOrder: row.sort_order,
      addedAt: row.added_at,
    }));
    const topLevelOrders: KnorviaGroupedTaskViewStructureTopOrder[] = [];
    for (const row of this.store.all<OrderRow>(SQL.orders)) {
      if (row.node_type === "group") {
        topLevelOrders.push({ type: "group", groupId: row.node_key, sortOrder: row.sort_order });
        continue;
      }
      try {
        const ref: unknown = JSON.parse(row.node_key);
        if (Array.isArray(ref) && typeof ref[0] === "string" && typeof ref[1] === "string")
          topLevelOrders.push({
            type: "task",
            workspaceKey: ref[0],
            taskId: ref[1],
            sortOrder: row.sort_order,
          });
      } catch {
        /* Historical malformed task-order data is ignored by contract. */
      }
    }
    return { groups, members, topLevelOrders };
  }
  async query(
    input: KnorviaGroupedTaskViewQuery & { provider?: KnorviaProvider },
  ): Promise<KnorviaGroupedTaskView> {
    await this.store.ready();
    const all = input.includeAllWorkspaces === true,
      keys = scopeKeys(input.workspaceScopes);
    const where = ["deleted = 0", "archived = 0", "pinned = 0"],
      args: string[] = [];
    if (!all) {
      where.push(`workspace_key IN (${keys.map(() => "?").join(", ")})`);
      args.push(...keys);
    }
    if (input.provider) {
      where.push("provider = ?");
      args.push(input.provider);
    }
    const rows =
      !all && !keys.length
        ? []
        : this.store.all<TaskRow>(fill(SQL.active, where.join(" AND ")), ...args);
    const scopes: TaskScope[] = all
      ? rows.map((row) => ({
          workspacePath: row.workspace_path,
          workspaceIdentity: row.workspace_identity ?? undefined,
        }))
      : input.workspaceScopes;
    bootstrap(this.store, scopes, rows);
    const visible = new Set(all ? rows.map((row) => row.workspace_key) : keys),
      groups = this.visibleGroups(visible);
    const members = this.store.all<MemberRow>(SQL.members),
      orders = this.store.all<OrderRow>(SQL.orders);
    const membership = new Map<string, MemberRow>(),
      byGroup = new Map<string, MemberRow[]>();
    for (const member of members) {
      membership.set(entity(member.workspace_key, member.task_id), member);
      const bucket = byGroup.get(member.group_id) ?? [];
      bucket.push(member);
      byGroup.set(member.group_id, bucket);
    }
    const orderMap = new Map(
      orders.map((row) => [row.node_type + ":" + row.node_key, row.sort_order]),
    );
    const active = new Map(
      rows.map((row) => [entity(row.workspace_key, row.task_id), this.tasks.item(row)]),
    );
    const grouped = new Set<string>(),
      nodes: KnorviaGroupedTaskViewNode[] = [];
    for (const row of groups) {
      const tasks = (byGroup.get(row.group_id) ?? [])
        .map((member) => active.get(entity(member.workspace_key, member.task_id)))
        .filter((task): task is KnorviaTaskListItem => Boolean(task));
      if (row.group_id === CRON_DEFAULT_GROUP_ID)
        tasks.sort((a, b) => b.createdAt - a.createdAt || itemKey(b).localeCompare(itemKey(a)));
      else {
        this.normalizeMembers(row.group_id, tasks, membership);
        tasks.sort(
          (a, b) =>
            (membership.get(itemKey(a))?.sort_order ?? 0) -
              (membership.get(itemKey(b))?.sort_order ?? 0) || itemKey(a).localeCompare(itemKey(b)),
        );
      }
      for (const task of tasks) grouped.add(itemKey(task));
      const sortOrder = orderMap.get("group:" + row.group_id);
      nodes.push({
        type: "group",
        group: groupMeta(row),
        tasks,
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      });
    }
    for (const [key, task] of active) {
      if (membership.has(key) || grouped.has(key)) continue;
      const sortOrder = orderMap.get("task:" + taskNode(workspace(task), task.taskId));
      nodes.push({ type: "task", task, ...(sortOrder !== undefined ? { sortOrder } : {}) });
    }
    this.normalizeTop(nodes, orderMap);
    nodes.sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || nodeKey(a).localeCompare(nodeKey(b)),
    );
    return { nodes };
  }
  private normalizeMembers(
    groupId: string,
    tasks: KnorviaTaskListItem[],
    membership: Map<string, MemberRow>,
  ): void {
    const missing = tasks.filter((task) => membership.get(itemKey(task))?.sort_order === null);
    missing.sort(
      (a, b) =>
        (membership.get(itemKey(b))?.added_at ?? b.createdAt) -
          (membership.get(itemKey(a))?.added_at ?? a.createdAt) ||
        itemKey(a).localeCompare(itemKey(b)),
    );
    if (!missing.length) return;
    let maximum =
      this.store.get<{ max_sort_order: number | null }>(SQL.memberMaximum, groupId)
        ?.max_sort_order ?? 0;
    const now = Date.now(),
      update = this.store.database().prepare(SQL.normalizeMember);
    this.store.transaction(() => {
      for (const task of missing) {
        const member = membership.get(itemKey(task));
        if (!member) continue;
        maximum += 1000;
        update.run(maximum, now, member.workspace_key, member.task_id);
        member.sort_order = maximum;
        member.updated_at = now;
      }
    });
  }
  private normalizeTop(nodes: KnorviaGroupedTaskViewNode[], orders: Map<string, number>): void {
    const missing = nodes.filter((node) => !orders.has(nodeKey(node)));
    const created = (node: KnorviaGroupedTaskViewNode) =>
      node.type === "group" ? node.group.createdAt : node.task.createdAt;
    missing.sort((a, b) => created(b) - created(a) || nodeKey(a).localeCompare(nodeKey(b)));
    if (!missing.length) return;
    let maximum =
      this.store.get<{ max_sort_order: number | null }>(SQL.maximum)?.max_sort_order ?? 0;
    const now = Date.now(),
      insert = this.store.database().prepare(SQL.normalizeOrder);
    this.store.transaction(() => {
      for (const node of missing) {
        maximum += 1000;
        const key =
          node.type === "group" ? node.group.id : taskNode(workspace(node.task), node.task.taskId);
        insert.run(node.type, key, maximum, now, now);
        orders.set(nodeKey(node), maximum);
        node.sortOrder = maximum;
      }
    });
  }
}
