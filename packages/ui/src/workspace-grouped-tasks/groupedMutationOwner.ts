// SPDX-License-Identifier: Apache-2.0
// Source-exposed operation owner; source review and verification pending.
import type {
  IKnorviaTaskService,
  KnorviaGroupedTaskView,
  KnorviaTaskGroup,
  KnorviaTaskGroupColor,
} from "@knorvia/services";
import {
  collectViewWorkspaceScopes,
  expandGroupedMembers,
  prependTaskGroupToView,
  projectGroupedMetadata,
  viewToOrderInput,
} from "./groupedMutationProjection.js";

type Service = Pick<
  IKnorviaTaskService,
  | "createTaskGroup"
  | "renameTaskGroup"
  | "updateTaskGroupColor"
  | "applyGroupedTaskViewOrder"
  | "deleteTaskGroup"
>;
type ViewUpdate =
  | KnorviaGroupedTaskView
  | ((current: KnorviaGroupedTaskView) => KnorviaGroupedTaskView);
type Operation = "create" | "rename" | "color" | "order" | "ungroup";
const failures: Record<Operation, string> = {
  create: "[useGroupedTaskView] 创建 task group 失败",
  rename: "[useGroupedTaskView] 重命名 task group 失败",
  color: "[useGroupedTaskView] 更新 task group 颜色失败",
  order: "[useGroupedTaskView] 保存 grouped task 顺序失败",
  ungroup: "[useGroupedTaskView] 取消 task group 分组失败",
};
type Ports = {
  setView: (update: ViewUpdate) => void;
  setSaving: (saving: boolean) => void;
  invalidate: () => void;
  refreshCurrent: (canPublish?: () => boolean) => Promise<void>;
  log: (message: string, error: unknown) => void;
};

/** Captures the intended view/host write; permission gates only writes back to this UI scope. */
export class GroupedTaskMutationOwner {
  private scope: object | null = null;

  constructor(private readonly ports: Ports) {}

  activate(): () => void {
    const scope = {};
    this.scope = scope;
    this.ports.setSaving(false);
    return () => {
      if (this.scope === scope) this.scope = null;
    };
  }

  private async save<T>(
    scope: object,
    operation: Operation,
    action: (accepts: () => boolean) => Promise<T>,
  ): Promise<T> {
    const accepts = () => this.scope === scope;
    this.ports.setSaving(true);
    try {
      return await action(accepts);
    } catch (error) {
      this.ports.log(failures[operation], error);
      throw error;
    } finally {
      if (accepts()) this.ports.setSaving(false);
    }
  }

  async create(service: Service, refresh: () => Promise<void>): Promise<KnorviaTaskGroup> {
    const scope = this.scope;
    if (!scope) throw new Error("Grouped task view is inactive");
    return this.save(scope, "create", async (accepts) => {
      const group = await service.createTaskGroup();
      if (accepts()) {
        this.ports.setView((current) => prependTaskGroupToView(current, group));
        this.ports.invalidate();
        await refresh();
      }
      return group;
    });
  }

  async edit(
    previous: KnorviaGroupedTaskView,
    groupId: string,
    change: { title: string } | { color: KnorviaTaskGroupColor },
    service: Service,
  ): Promise<void> {
    const scope = this.scope;
    const node = previous.nodes.find(
      (candidate) => candidate.type === "group" && candidate.group.id === groupId,
    );
    if (!scope || node?.type !== "group") return;
    const patch = "title" in change ? { title: change.title.trim() || node.group.title } : change;
    if ("title" in patch ? node.group.title === patch.title : node.group.color === patch.color)
      return;
    const optimistic = projectGroupedMetadata(previous, groupId, (group) => ({
      ...group,
      ...patch,
      updatedAt: Date.now(),
    }));
    this.ports.setView(optimistic);
    await this.save(scope, "title" in patch ? "rename" : "color", async (accepts) => {
      try {
        const workspaceScopes = collectViewWorkspaceScopes(optimistic);
        const updated =
          "title" in patch
            ? await service.renameTaskGroup({ groupId, title: patch.title, workspaceScopes })
            : await service.updateTaskGroupColor({ groupId, color: patch.color, workspaceScopes });
        if (accepts()) {
          this.ports.invalidate();
          this.ports.setView(projectGroupedMetadata(optimistic, groupId, () => updated));
        }
      } catch (error) {
        if (accepts()) this.ports.setView(previous);
        throw error;
      }
    });
  }

  async order(
    previous: KnorviaGroupedTaskView,
    next: KnorviaGroupedTaskView,
    service: Service,
    refresh: (canPublish?: () => boolean) => Promise<void>,
    canPublish = () => true,
  ): Promise<void> {
    const scope = this.scope;
    if (!scope) return;
    await this.applyOrder(scope, previous, next, service, refresh, canPublish);
  }

  private async applyOrder(
    scope: object,
    previous: KnorviaGroupedTaskView,
    next: KnorviaGroupedTaskView,
    service: Service,
    refresh: (canPublish?: () => boolean) => Promise<void>,
    canPublish = () => true,
  ): Promise<void> {
    this.ports.setView(next);
    await this.save(scope, "order", async (accepts) => {
      try {
        await service.applyGroupedTaskViewOrder(viewToOrderInput({ view: next }));
        if (accepts()) {
          this.ports.invalidate();
          // 新拖拽会撤销旧排序回写许可；已开始的 refresh 回包也必须读取同一许可。
          if (canPublish()) await this.ports.refreshCurrent(canPublish);
        }
      } catch (error) {
        if (accepts() && canPublish()) {
          this.ports.setView(previous);
          void refresh(canPublish);
        }
        throw error;
      }
    });
  }

  async ungroup(
    previous: KnorviaGroupedTaskView,
    groupId: string,
    service: Service,
    refresh: () => Promise<void>,
  ): Promise<void> {
    const scope = this.scope;
    if (
      !scope ||
      !previous.nodes.some((node) => node.type === "group" && node.group.id === groupId)
    )
      return;
    const next = expandGroupedMembers(previous, groupId);
    await this.save(scope, "ungroup", async (accepts) => {
      await this.applyOrder(scope, previous, next, service, refresh);
      await service.deleteTaskGroup({ groupId, workspaceScopes: collectViewWorkspaceScopes(next) });
      if (accepts()) {
        this.ports.invalidate();
        await refresh();
      }
    });
  }
}
