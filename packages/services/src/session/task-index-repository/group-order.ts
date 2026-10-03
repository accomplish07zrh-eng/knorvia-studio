import type { KnorviaProvider } from "@knorvia/shared";
import type {
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewOrderInput,
  KnorviaGroupedTaskViewTopLevelNodeRef,
} from "#src/session/taskListTypes.js";
import { BOOTSTRAP_ONCE, entity, scopeKeys, taskNode, workspace } from "./model.js";
import type { TaskRef, TaskRow } from "./model.js";
import { GroupView } from "./group-view.js";
import { Store } from "./store.js";
import { SQL, fill } from "./sql.js";
export class GroupOrder {
  constructor(
    private store: Store,
    private view: GroupView,
  ) {}
  async apply(
    input: KnorviaGroupedTaskViewOrderInput & { provider?: KnorviaProvider },
  ): Promise<KnorviaGroupedTaskView> {
    await this.store.ready();
    const keys = scopeKeys(input.workspaceScopes),
      scope = new Set(keys),
      now = Date.now();
    const groupIds = new Set(
      this.store.all<{ group_id: string }>(SQL.groupIds).map((row) => row.group_id),
    );
    const requireGroup = (id: string) => {
      if (!groupIds.has(id)) throw new Error("Grouped task order 包含不存在的 group");
    };
    const validate = (ref: TaskRef): TaskRow | null => {
      if (!scope.has(workspace(ref)))
        throw new Error("Grouped task order 包含当前 scope 外的 task");
      const row = this.store.read(ref);
      if (!row || row.deleted === 1 || row.archived === 1 || row.pinned === 1)
        throw new Error("Grouped task order 包含不可见 task");
      return input.provider && row.provider !== input.provider ? null : row;
    };
    const top: KnorviaGroupedTaskViewTopLevelNodeRef[] = [],
      topTasks = new Set<string>();
    for (const node of input.topLevelNodes) {
      if (node.type === "group") {
        requireGroup(node.groupId);
        top.push(node);
      } else {
        const row = validate(node.task);
        if (!row) continue;
        topTasks.add(entity(workspace(node.task), node.task.taskId));
        top.push(node);
      }
    }
    const grouped = new Set<string>(),
      groups: Array<{ id: string; tasks: TaskRow[] }> = [];
    for (const group of input.groups) {
      requireGroup(group.groupId);
      const tasks: TaskRow[] = [];
      for (const ref of group.taskRefs) {
        const row = validate(ref);
        if (!row) continue;
        const key = entity(workspace(ref), ref.taskId);
        if (grouped.has(key))
          throw new Error("Grouped task order 不能让同一个 task 进入多个 group");
        grouped.add(key);
        tasks.push(row);
      }
      groups.push({ id: group.groupId, tasks });
    }
    const scopedTasks = keys.length
      ? this.store.all<{ workspace_key: string; task_id: string }>(
          fill(SQL.scopeTasks, keys.map(() => "?").join(", ")),
          ...keys,
        )
      : [];
    this.store.transaction(() => {
      this.store.database().prepare(SQL.orderMarker).run(BOOTSTRAP_ONCE, now, now);
      const remove = this.store.database().prepare(SQL.removeMember),
        member = this.store.database().prepare(SQL.orderMember);
      for (const key of topTasks) {
        const [workspaceKey, taskId] = key.split("\u0000");
        if (!workspaceKey || !taskId) throw new Error("Grouped task order 顶层 task key 非法");
        remove.run(workspaceKey, taskId);
      }
      for (const group of groups)
        group.tasks.forEach((row, index) => {
          member.run(
            group.id,
            row.workspace_key,
            row.workspace_path,
            row.workspace_identity ?? null,
            row.task_id,
            (index + 1) * 1000,
            now,
            now,
            now,
          );
        });
      this.store.exec(SQL.removeAllGroupOrders);
      const deleteOrder = this.store.database().prepare(SQL.removeTaskOrder);
      for (const row of scopedTasks) {
        const [workspaceKey, taskId] = entity(row.workspace_key, row.task_id).split("\u0000");
        if (!workspaceKey || !taskId) continue;
        deleteOrder.run(taskNode(workspaceKey, taskId), workspaceKey);
      }
      const insert = this.store.database().prepare(SQL.insertOrder);
      top.forEach((node, index) => {
        const key =
          node.type === "group" ? node.groupId : taskNode(workspace(node.task), node.task.taskId);
        insert.run(node.type, key, (index + 1) * 1000, now, now);
      });
    });
    return await this.view.query({
      workspaceScopes: input.workspaceScopes,
      provider: input.provider,
    });
  }
}
