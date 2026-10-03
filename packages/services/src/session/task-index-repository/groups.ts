import { randomUUID } from "node:crypto";
import type { KnorviaTaskGroup, KnorviaTaskGroupColor } from "#src/session/taskListTypes.js";
import { colors, groupMeta, taskNode, workspace } from "./model.js";
import type { GroupRow, TaskRef } from "./model.js";
import { SQL } from "./sql.js";
import { Store } from "./store.js";
export class Groups {
  constructor(private store: Store) {}
  initializeTop(ref: TaskRef): boolean {
    const row = this.store.read(ref);
    if (!row || row.deleted === 1 || row.archived === 1 || row.pinned === 1) return false;
    const key = workspace(ref),
      node = taskNode(key, ref.taskId);
    const member = this.store.get(SQL.hasMember, key, ref.taskId);
    const order = this.store.get(SQL.hasTaskOrder, node);
    if (member || order) return false;
    const now = Date.now();
    this.store
      .database()
      .prepare(SQL.upsertOrder)
      .run("task", node, this.store.nextTop(), now, now);
    return true;
  }
  async initialize(ref: TaskRef): Promise<boolean> {
    await this.store.ready();
    return this.initializeTop(ref);
  }
  async create(input?: {
    title?: string;
    color?: KnorviaTaskGroupColor;
  }): Promise<KnorviaTaskGroup> {
    await this.store.ready();
    const now = Date.now(),
      id = "task-group-" + randomUUID();
    const title = input?.title?.trim() || "New Group",
      color = input?.color ?? "gray";
    this.store.database().prepare(SQL.createGroup).run(id, title, color, now, now);
    this.store.database().prepare(SQL.upsertOrder).run("group", id, this.store.nextTop(), now, now);
    return { id, title, color, createdAt: now, updatedAt: now };
  }
  async rename(input: { groupId: string; title: string }): Promise<KnorviaTaskGroup> {
    await this.store.ready();
    const title = input.title.trim() || "New Group",
      now = Date.now();
    const result = this.store.database().prepare(SQL.renameGroup).run(title, now, input.groupId);
    if (result.changes === 0) throw new Error("Task group 不存在，无法重命名");
    const row = this.store.get<GroupRow>(SQL.group, input.groupId);
    if (!row) throw new Error("Task group 重命名后读取失败");
    return groupMeta(row);
  }
  async recolor(input: {
    groupId: string;
    color: KnorviaTaskGroupColor;
  }): Promise<KnorviaTaskGroup> {
    await this.store.ready();
    if (!colors.includes(input.color)) throw new Error("Task group 颜色无效");
    const now = Date.now(),
      result = this.store.database().prepare(SQL.colorGroup).run(input.color, now, input.groupId);
    if (result.changes === 0) throw new Error("Task group 不存在，无法更新颜色");
    const row = this.store.get<GroupRow>(SQL.group, input.groupId);
    if (!row) throw new Error("Task group 更新颜色后读取失败");
    return groupMeta(row);
  }
  async delete(input: { groupId: string }): Promise<void> {
    await this.store.ready();
    this.store.transaction(() => {
      const result = this.store.database().prepare(SQL.deleteGroup).run(input.groupId);
      if (result.changes === 0) throw new Error("Task group 不存在，无法删除");
      this.store.database().prepare(SQL.deleteGroupOrder).run(input.groupId);
    });
  }
}
