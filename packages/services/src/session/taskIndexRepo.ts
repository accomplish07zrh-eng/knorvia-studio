import type { KnorviaProvider, KnorviaTaskMeta } from "@knorvia/shared";
import type {
  KnorviaGroupedTaskRef,
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewOrderInput,
  KnorviaGroupedTaskViewQuery,
  KnorviaGroupedTaskViewStructure,
  KnorviaTaskGroup,
  KnorviaTaskGroupColor,
  KnorviaTaskListQuery,
  KnorviaTaskListResult,
} from "#src/session/taskListTypes.js";
import type {
  AgentInput,
  ArchiveInput,
  ListInput,
  StateInput,
  SyncInput,
} from "./task-index-repository/model.js";
import { Store } from "./task-index-repository/store.js";
import { TaskWrites } from "./task-index-repository/task-writes.js";
import { TaskQueries } from "./task-index-repository/task-queries.js";
import { Groups } from "./task-index-repository/groups.js";
import { GroupView } from "./task-index-repository/group-view.js";
import { GroupOrder } from "./task-index-repository/group-order.js";
import { SQL } from "./task-index-repository/sql.js";
export class TaskIndexRepo {
  private readonly store: Store;
  private readonly writes: TaskWrites;
  private readonly tasks: TaskQueries;
  private readonly groups: Groups;
  private readonly view: GroupView;
  private readonly order: GroupOrder;
  constructor(startupDbPath?: string, startupBusyTimeoutMs?: number) {
    this.store = new Store(startupDbPath, startupBusyTimeoutMs);
    this.groups = new Groups(this.store);
    this.writes = new TaskWrites(this.store, this.groups);
    this.tasks = new TaskQueries(this.store);
    this.view = new GroupView(this.store, this.tasks);
    this.order = new GroupOrder(this.store, this.view);
  }
  ensureReady(): Promise<void> {
    return this.store.ready();
  }
  close(options?: { throwOnError?: boolean }): void {
    this.store.close(options);
  }
  async hasGroupedWorkspaceBootstrapRun(): Promise<boolean> {
    await this.store.ready();
    return Boolean(this.store.get(SQL.bootstrapped));
  }
  archiveStaleTasks(params: ArchiveInput): Promise<KnorviaTaskMeta[]> {
    return this.tasks.archive(params);
  }
  syncTaskMeta(params: SyncInput): Promise<KnorviaTaskMeta> {
    return this.writes.sync(params);
  }
  syncTaskMetaAtGroupedTop(
    params: SyncInput,
  ): Promise<{ meta: KnorviaTaskMeta; initializedGroupedOrder: boolean }> {
    return this.writes.syncAtTop(params);
  }
  seedTaskMetaIfMissing(meta: KnorviaTaskMeta): Promise<KnorviaTaskMeta> {
    return this.writes.seed(meta);
  }
  clearTaskUnreadIfMatches(
    params: KnorviaGroupedTaskRef & { expectedUnreadAt: number },
  ): Promise<{ meta: KnorviaTaskMeta; cleared: boolean }> {
    return this.writes.clearUnread(params);
  }
  deleteArchivedTask(params: KnorviaGroupedTaskRef): Promise<KnorviaTaskMeta | null> {
    return this.writes.deleteArchived(params);
  }
  updateTaskState(params: StateInput): Promise<KnorviaTaskMeta> {
    return this.writes.update(params);
  }
  applyAgentPatch(params: AgentInput): Promise<KnorviaTaskMeta | null> {
    return this.writes.agent(params);
  }
  listTaskMetas(params: ListInput): Promise<KnorviaTaskMeta[]> {
    return this.tasks.list(params);
  }
  listDeletedTaskIds(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
  }): Promise<string[]> {
    return this.tasks.deleted(params);
  }
  listSessionsByAutomation(automationId: string): Promise<KnorviaTaskMeta[]> {
    return this.tasks.automation(automationId);
  }
  queryTaskList(
    params: KnorviaTaskListQuery & { provider?: KnorviaProvider },
  ): Promise<KnorviaTaskListResult> {
    return this.tasks.query(params);
  }
  createTaskGroup(params?: {
    title?: string;
    color?: KnorviaTaskGroupColor;
  }): Promise<KnorviaTaskGroup> {
    return this.groups.create(params);
  }
  renameTaskGroup(params: { groupId: string; title: string }): Promise<KnorviaTaskGroup> {
    return this.groups.rename(params);
  }
  updateTaskGroupColor(params: {
    groupId: string;
    color: KnorviaTaskGroupColor;
  }): Promise<KnorviaTaskGroup> {
    return this.groups.recolor(params);
  }
  deleteTaskGroup(params: { groupId: string }): Promise<void> {
    return this.groups.delete(params);
  }
  initializeGroupedTaskAtTop(params: KnorviaGroupedTaskRef): Promise<boolean> {
    return this.groups.initialize(params);
  }
  queryGroupedTaskView(
    params: KnorviaGroupedTaskViewQuery & { provider?: KnorviaProvider },
  ): Promise<KnorviaGroupedTaskView> {
    return this.view.query(params);
  }
  queryGroupedTaskViewStructure(params: {
    workspaceScopes: Array<{ workspacePath: string; workspaceIdentity?: string }>;
  }): Promise<KnorviaGroupedTaskViewStructure> {
    return this.view.structure(params);
  }
  applyGroupedTaskViewOrder(
    params: KnorviaGroupedTaskViewOrderInput & { provider?: KnorviaProvider },
  ): Promise<KnorviaGroupedTaskView> {
    return this.order.apply(params);
  }
  getTaskMeta(params: KnorviaGroupedTaskRef): Promise<KnorviaTaskMeta | null> {
    return this.tasks.get(params);
  }
}
