// SPDX-License-Identifier: Apache-2.0
// Source-exposed section command/permission candidate; source and runtime review pending.
import type { IKnorviaTaskService, KnorviaGroupedTaskView, KnorviaTaskGroupColor } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { GroupedDraftTaskPlacement } from "@/store/sessionStoreTypes.js";
import { taskKey } from "./ids.js";
import { findTaskInGroupedView, moveTaskByMenu, moveTaskToTopByMenu, resolveGroupedDraftTaskPlacementForTask } from "./view.js";

type TaskCommands = Pick<IKnorviaTaskService, "renameTask" | "setTaskUnread" | "archiveTask">;
type DraftContext = {
  activeTaskId: string | null;
  activeWorkspacePath: string;
  activeWorkspaceIdentity?: string;
  placement?: GroupedDraftTaskPlacement;
  view: KnorviaGroupedTaskView;
};
type Snapshot = {
  archiving: ReadonlySet<string>;
  renamingTaskKey: string | null;
  renameDraft: string;
  newGroupSetupId: string | null;
};
export type GroupedSectionInteractionPorts = {
  authoritative: () => KnorviaGroupedTaskView;
  displayed: () => KnorviaGroupedTaskView;
  draft: () => DraftContext;
  taskService: (task: KnorviaTaskMeta) => TaskCommands | undefined;
  setCollapsed: (update: (current: Set<string>) => Set<string>) => void;
  createDraft: (placement: GroupedDraftTaskPlacement) => void;
  closeDraft: (path: string, identity?: string) => void;
  createGroup: () => Promise<{ id: string }>;
  renameGroup: (id: string, title: string) => Promise<void>;
  colorGroup: (id: string, color: KnorviaTaskGroupColor) => Promise<void>;
  ungroup: (id: string) => Promise<void>;
  order: (view: KnorviaGroupedTaskView, canPublish: () => boolean) => Promise<void>;
  commitMetadata: (kind: "rename" | "unread", previous: KnorviaTaskMeta, next: KnorviaTaskMeta, canWriteView: () => boolean) => void;
  commitArchive: (previous: KnorviaTaskMeta, next: KnorviaTaskMeta) => void;
  notify: (id: string) => void;
};
type ArchiveLease = { task: KnorviaTaskMeta; service: TaskCommands; failed?: boolean };

/** Owns transient section UI only; host writes, accepted view and persisted drafts stay at their existing owners. */
export class GroupedSectionInteractionOwner {
  private snapshot: Snapshot = { archiving: new Set(), renamingTaskKey: null, renameDraft: "", newGroupSetupId: null };
  private readonly listeners = new Set<() => void>();
  private scope: object | null = null;
  private edit: object = {};
  private renameSubmission: object | null = null;
  private order: object | null = null;
  private readonly taskWrites = new Map<string, object>();
  private readonly archives = new Map<string, ArchiveLease>();

  constructor(private readonly ports: () => GroupedSectionInteractionPorts) {}
  read = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(patch: Partial<Snapshot>): void {
    if (Object.entries(patch).every(([key, value]) => Object.is(this.snapshot[key as keyof Snapshot], value))) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  activate(): () => void {
    const scope = {};
    this.scope = scope;
    this.edit = {};
    this.taskWrites.clear();
    this.invalidateOrder();
    this.reconcileArchiveServices();
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.taskWrites.clear();
      this.invalidateOrder();
    };
  }
  invalidateOrder = (): void => { this.order = null; };
  permitOrder = (): (() => boolean) => {
    const scope = this.scope, order = {};
    this.order = order;
    return () => scope !== null && this.scope === scope && this.order === order;
  };
  private hide(key: string, hidden: boolean): void {
    if (this.snapshot.archiving.has(key) === hidden) return;
    const next = new Set(this.snapshot.archiving);
    if (hidden) next.add(key); else next.delete(key);
    this.publish({ archiving: next });
  }
  reconcileArchiveServices(): void {
    if (!this.scope) return;
    // Pending visibility belongs to a task/service lease. Effect replay may resume the same lease.
    for (const [key, lease] of this.archives) {
      if (!lease.failed && this.ports().taskService(lease.task) === lease.service) continue;
      this.archives.delete(key);
      this.hide(key, false);
    }
  }
  reconcileArchives(view: KnorviaGroupedTaskView): void {
    if (!this.scope || this.snapshot.archiving.size === 0) return;
    const removed: string[] = [];
    for (const key of this.snapshot.archiving) if (!findTaskInGroupedView(view, key)) removed.push(key);
    if (!removed.length) return;
    const next = new Set(this.snapshot.archiving);
    for (const key of removed) { next.delete(key); this.archives.delete(key); }
    this.publish({ archiving: next });
  }

  private createAt(placement: GroupedDraftTaskPlacement): void {
    if (!this.scope) return;
    const ports = this.ports();
    if (placement.type === "group") ports.setCollapsed((current) => {
      if (!current.has(placement.groupId)) return current;
      const next = new Set(current);
      next.delete(placement.groupId);
      return next;
    });
    ports.createDraft(placement);
  }
  createTopDraft = (): void => this.createAt({ type: "top" });
  createGroupDraft = (groupId: string): void => this.createAt({ type: "group", groupId });
  createContextualDraft = (): void => {
    if (!this.scope) return;
    const context = this.ports().draft();
    const key = context.activeTaskId ? taskKey({ taskId: context.activeTaskId, workspacePath: context.activeWorkspacePath, workspaceIdentity: context.activeWorkspaceIdentity }) : null;
    this.createAt(key ? resolveGroupedDraftTaskPlacementForTask(context.view, key) : context.placement ?? { type: "top" });
  };
  closeDraft = (): void => {
    if (!this.scope) return;
    const ports = this.ports(), context = ports.draft();
    // No cleanup path clears a store-backed draft; only this explicit user command does.
    ports.closeDraft(context.activeWorkspacePath, context.activeWorkspaceIdentity);
  };
  toggleCollapsed = (id: string): void => {
    if (!this.scope) return;
    this.ports().setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  createGroup = (): void => {
    const scope = this.scope;
    if (!scope) return;
    const ports = this.ports();
    void ports.createGroup().then((group) => {
      if (this.scope === scope) this.publish({ newGroupSetupId: group.id });
    }).catch(() => ports.notify("taskGroup.createFailed"));
  };
  acknowledgeSetup = (id: string): void => {
    if (this.scope && this.snapshot.newGroupSetupId === id) this.publish({ newGroupSetupId: null });
  };
  private groupCommand(action: (ports: GroupedSectionInteractionPorts) => Promise<void>, failure: string): void {
    if (!this.scope) return;
    const ports = this.ports();
    void action(ports).catch(() => ports.notify(failure));
  }
  renameGroup = (id: string, title: string): void => this.groupCommand((ports) => ports.renameGroup(id, title), "taskGroup.renameFailed");
  colorGroup = (id: string, color: KnorviaTaskGroupColor): void => this.groupCommand((ports) => ports.colorGroup(id, color), "taskGroup.colorFailed");
  ungroup = (id: string): void => this.groupCommand((ports) => ports.ungroup(id), "taskGroup.ungroupFailed");
  private move(project: (view: KnorviaGroupedTaskView) => KnorviaGroupedTaskView): void {
    if (!this.scope) return;
    const ports = this.ports(), previous = ports.authoritative(), next = project(previous);
    if (next === previous) return;
    void ports.order(next, this.permitOrder()).catch(() => ports.notify("taskGroup.updateFailed"));
  }
  moveToGroup = (task: KnorviaTaskMeta, id: string | null): void => this.move((view) => moveTaskByMenu(view, task, id));
  moveToTop = (task: KnorviaTaskMeta): void => this.move((view) => moveTaskToTopByMenu(view, task));

  cancelRename = (): void => {
    if (!this.scope) return;
    this.edit = {};
    this.publish({ renamingTaskKey: null, renameDraft: "" });
  };
  startRename = (task: KnorviaTaskMeta): void => {
    if (!this.scope) return;
    this.edit = {};
    this.publish({ renamingTaskKey: taskKey(task), renameDraft: task.title ?? "" });
  };
  setRenameDraft = (value: string): void => {
    if (!this.scope || this.snapshot.renameDraft === value) return;
    this.edit = {};
    this.publish({ renameDraft: value });
  };
  reconcileRename(view: KnorviaGroupedTaskView): void {
    if (this.snapshot.renamingTaskKey && !findTaskInGroupedView(view, this.snapshot.renamingTaskKey)) this.cancelRename();
  }
  private metadataPermission(task: KnorviaTaskMeta, service: TaskCommands): () => boolean {
    const scope = this.scope, key = taskKey(task), ticket = {};
    this.taskWrites.set(key, ticket);
    return () => scope !== null && this.scope === scope && this.taskWrites.get(key) === ticket && this.ports().taskService(task) === service;
  }
  submitRename = async (): Promise<void> => {
    if (!this.scope || !this.snapshot.renamingTaskKey) return;
    const ports = this.ports(), task = findTaskInGroupedView(ports.displayed(), this.snapshot.renamingTaskKey);
    const service = task ? ports.taskService(task) : undefined;
    if (!task || !service) { this.cancelRename(); return; }
    const title = this.snapshot.renameDraft.trim();
    if (title === (task.title ?? "").trim()) { this.cancelRename(); return; }
    const edit = this.edit, scope = this.scope, submission = {}, accepts = this.metadataPermission(task, service);
    this.renameSubmission = submission;
    try {
      const meta = await service.renameTask({ taskId: task.taskId, workspacePath: task.workspacePath, title, ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}) });
      if (!meta) { ports.notify("taskList.renameFailed"); return; }
      ports.commitMetadata("rename", task, meta, accepts);
      if (this.scope === scope && this.edit === edit && this.renameSubmission === submission && this.ports().taskService(task) === service) this.cancelRename();
    } catch { ports.notify("taskList.renameFailed"); }
  };
  markUnread = (task: KnorviaTaskMeta): void => {
    if (!this.scope) return;
    const ports = this.ports(), service = ports.taskService(task);
    if (!service) return;
    const accepts = this.metadataPermission(task, service);
    void service.setTaskUnread({ taskId: task.taskId, workspacePath: task.workspacePath, unread: true, ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}) })
      .then((meta) => ports.commitMetadata("unread", task, meta, accepts))
      .catch(() => ports.notify("taskList.markAsUnreadFailed"));
  };
  archive = (task: KnorviaTaskMeta): void => {
    if (!this.scope) return;
    const ports = this.ports(), service = ports.taskService(task);
    if (!service) return;
    const key = taskKey(task), lease: ArchiveLease = { task, service };
    this.archives.set(key, lease);
    this.hide(key, true);
    void service.archiveTask({ taskId: task.taskId, workspacePath: task.workspacePath, ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}) }).then((meta) => {
      ports.commitArchive(task, meta);
      if (this.archives.get(key) === lease) this.archives.delete(key);
    }).catch(() => {
      lease.failed = true;
      if (this.scope && this.archives.get(key) === lease && this.ports().taskService(task) === service) {
        this.archives.delete(key);
        this.hide(key, false);
      }
      ports.notify("taskList.archiveFailed");
    });
  };
}
