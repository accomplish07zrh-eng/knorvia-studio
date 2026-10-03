// SPDX-License-Identifier: Apache-2.0
// Upstream-derived accessors remain. Authors have read the prior implementation;
// the field-policy refactor does not establish independent authorship.
/** Workspace reads and single-bucket patches for the existing session store. */
import type { KnorviaTaskRuntimeStatus, KnorviaTaskMeta } from "@knorvia/shared";
import { mergeTaskWithOptimisticMeta } from "@/lib/taskMetaMerge.js";
import {
  DEFAULT_TASK_UI_STATE,
  DEFAULT_WORKSPACE_INIT_STATE,
  DEFAULT_TASK_RUNTIME_STATE,
  createDefaultWorkspaceState,
  getDefaultWorkspaceState,
  type KnorviaSessionStoreState,
  type WorkspaceInitState,
  type TaskRuntimeState,
  type WorkspaceKnorviaUIState,
} from "./sessionStoreTypes.js";

// ────────────────────────────────────────────
// Internal helpers（store 本体也需要使用）
// ────────────────────────────────────────────

export function resolveWorkspaceStateKey(
  workspacePath: string,
  workspaceIdentity?: string,
): string {
  return workspaceIdentity?.trim() || workspacePath;
}

function copyTaskRecordEntries<T>(
  record: Record<string, T>,
  taskIds: ReadonlySet<string>,
): Record<string, T> {
  const entries = Object.entries(record).filter(([taskId]) => taskIds.has(taskId));
  return entries.length > 0 ? Object.fromEntries(entries) : {};
}

function collectIdentityTaskIds(
  baseState: WorkspaceKnorviaUIState,
  workspaceIdentity: string,
): Set<string> {
  const normalizedIdentity = workspaceIdentity.trim();
  const taskIds = new Set<string>();
  for (const task of baseState.taskListCache ?? []) {
    if (task.workspaceIdentity?.trim() === normalizedIdentity) {
      taskIds.add(task.taskId);
    }
  }
  for (const task of Object.values(baseState.optimisticTaskListByTaskId)) {
    if (task.workspaceIdentity?.trim() === normalizedIdentity) {
      taskIds.add(task.taskId);
    }
  }
  return taskIds;
}

interface IdentityProjection {
  source: WorkspaceKnorviaUIState;
  defaults: WorkspaceKnorviaUIState;
  taskIds: ReadonlySet<string>;
  taskListCache: WorkspaceKnorviaUIState["taskListCache"];
}

type SeedPolicy = (target: WorkspaceKnorviaUIState, projection: IdentityProjection) => void;

function seedField<K extends keyof WorkspaceKnorviaUIState>(
  key: K,
  read: (projection: IdentityProjection) => WorkspaceKnorviaUIState[K],
): SeedPolicy {
  return (target, projection) => {
    target[key] = read(projection);
  };
}

// These lists are ordered reads. Display fields survive without a matching task;
// task fields are admitted together only after the identity's ID union is known.
const displaySeedPolicies: readonly SeedPolicy[] = [
  seedField("selectedSupplierKey", ({ source }) => source.selectedSupplierKey),
  seedField("isGhostSupplier", ({ source }) => source.isGhostSupplier),
  seedField("supplierMismatchReason", ({ source }) => source.supplierMismatchReason),
  seedField("configOptions", ({ source }) => source.configOptions),
  seedField("configOptionsStatus", ({ source }) => source.configOptionsStatus),
  seedField("slashCommands", ({ source }) => source.slashCommands),
];

const taskSeedPolicies: readonly SeedPolicy[] = [
  seedField("activeTaskId", ({ source, defaults, taskIds }) =>
    source.activeTaskId && taskIds.has(source.activeTaskId)
      ? source.activeTaskId
      : defaults.activeTaskId,
  ),
  seedField("optimisticTaskListByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.optimisticTaskListByTaskId, taskIds),
  ),
  seedField("taskConfigOptionsByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.taskConfigOptionsByTaskId, taskIds),
  ),
  seedField("taskConfigOptionsStatusByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.taskConfigOptionsStatusByTaskId, taskIds),
  ),
  seedField("taskListCache", ({ taskListCache }) => taskListCache),
  seedField("taskListVersion", ({ source }) => source.taskListVersion),
  seedField("taskRuntimeByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.taskRuntimeByTaskId, taskIds),
  ),
  seedField("taskUiByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.taskUiByTaskId, taskIds),
  ),
  seedField("taskUnreadByTaskId", ({ source, taskIds }) =>
    copyTaskRecordEntries(source.taskUnreadByTaskId, taskIds),
  ),
];

function createIdentityWorkspaceStateSeed(
  source: WorkspaceKnorviaUIState | undefined,
  workspaceIdentity?: string,
): WorkspaceKnorviaUIState {
  if (!source) {
    return createDefaultWorkspaceState(getDefaultWorkspaceState().selectedProvider);
  }

  const defaults = createDefaultWorkspaceState(source.selectedProvider);
  const taskIds = workspaceIdentity
    ? collectIdentityTaskIds(source, workspaceIdentity)
    : new Set<string>();
  const taskListCache = source.taskListCache?.filter((task) => taskIds.has(task.taskId)) ?? null;
  const projection: IdentityProjection = { source, defaults, taskIds, taskListCache };
  for (const apply of displaySeedPolicies) apply(defaults, projection);
  if (taskIds.size > 0) {
    for (const apply of taskSeedPolicies) apply(defaults, projection);
  }
  return defaults;
}

export function getWorkspaceState(
  state: KnorviaSessionStoreState,
  workspacePath: string,
  workspaceIdentity?: string,
): WorkspaceKnorviaUIState {
  const baseState = state.workspaces[workspacePath] ?? getDefaultWorkspaceState();
  const workspaceKey = resolveWorkspaceStateKey(workspacePath, workspaceIdentity);
  if (workspaceKey === workspacePath) {
    return baseState;
  }

  const identityState = state.workspaces[workspaceKey];
  if (!identityState) {
    return baseState;
  }

  // workspaceIdentity 表示远程/隔离 workspace 身份，path 桶只用于本地 fallback
  // 和 identity 桶首次写入前的一次性迁移起点。identity 桶一旦存在，就不能再动态合并
  // path task maps，否则同一路径的不同 SSH/WSL/Docker 窗口会互相读到 task config、队列和错误态。
  return identityState;
}

export function updateWorkspaceState(
  state: KnorviaSessionStoreState,
  workspacePath: string,
  updater: (current: WorkspaceKnorviaUIState) => WorkspaceKnorviaUIState,
  workspaceIdentity?: string,
): Pick<KnorviaSessionStoreState, "workspaces"> {
  const workspaceKey = resolveWorkspaceStateKey(workspacePath, workspaceIdentity);
  const current =
    workspaceKey === workspacePath
      ? getWorkspaceState(state, workspacePath, workspaceIdentity)
      : (state.workspaces[workspaceKey] ??
        createIdentityWorkspaceStateSeed(state.workspaces[workspacePath], workspaceIdentity));
  const nextWorkspaceState = updater(current);

  if (nextWorkspaceState === current) {
    // A no-op must also leave an as-yet absent identity bucket absent.
    return { workspaces: state.workspaces };
  }

  // One resolved bucket owns the write, including when key and path are equal.
  return { workspaces: { ...state.workspaces, [workspaceKey]: nextWorkspaceState } };
}

// ────────────────────────────────────────────
// Per-task accessor functions
// ────────────────────────────────────────────

export function getTaskRuntimeState(
  workspaceState: WorkspaceKnorviaUIState,
  taskId: string,
): TaskRuntimeState {
  return workspaceState.taskRuntimeByTaskId[taskId] ?? DEFAULT_TASK_RUNTIME_STATE;
}

interface WorkspaceDisplayedTaskState {
  taskStatus: KnorviaTaskRuntimeStatus;
  taskError: string | null;
}

export function getWorkspaceDisplayedTaskState(
  workspaceState: WorkspaceKnorviaUIState,
): WorkspaceDisplayedTaskState {
  if (!workspaceState.activeTaskId) {
    return {
      taskStatus: workspaceState.draftRuntime.status,
      taskError: workspaceState.draftRuntime.error,
    };
  }

  const runtimeState = getTaskRuntimeState(workspaceState, workspaceState.activeTaskId);
  return {
    taskStatus: runtimeState.status,
    taskError: runtimeState.error,
  };
}

export function getTaskUiState(workspaceState: WorkspaceKnorviaUIState, taskId: string) {
  return workspaceState.taskUiByTaskId[taskId] ?? DEFAULT_TASK_UI_STATE;
}

export function getTaskMeta(
  workspaceState:
    | WorkspaceKnorviaUIState
    | Partial<Pick<WorkspaceKnorviaUIState, "optimisticTaskListByTaskId" | "taskListCache">>,
  taskId: string,
): KnorviaTaskMeta | null {
  const optimisticTask = workspaceState.optimisticTaskListByTaskId?.[taskId];
  const cachedTask = workspaceState.taskListCache?.find((task) => task.taskId === taskId) ?? null;

  if (!optimisticTask) {
    return cachedTask;
  }

  if (!cachedTask) {
    return optimisticTask;
  }

  return mergeTaskWithOptimisticMeta(cachedTask, optimisticTask);
}

export function getVisibleTaskMetas(
  workspaceState:
    | WorkspaceKnorviaUIState
    | Partial<Pick<WorkspaceKnorviaUIState, "optimisticTaskListByTaskId" | "taskListCache">>,
): KnorviaTaskMeta[] {
  const taskById = new Map<string, KnorviaTaskMeta>();

  for (const task of workspaceState.taskListCache ?? []) {
    taskById.set(task.taskId, task);
  }

  for (const task of Object.values(workspaceState.optimisticTaskListByTaskId ?? {})) {
    taskById.set(task.taskId, getTaskMeta(workspaceState, task.taskId) ?? task);
  }

  return Array.from(taskById.values());
}

export function getTaskUnreadIndicator(
  workspaceState:
    | WorkspaceKnorviaUIState
    | Partial<
        Pick<
          WorkspaceKnorviaUIState,
          "optimisticTaskListByTaskId" | "taskListCache" | "taskUnreadByTaskId"
        >
      >,
  taskId: string,
  fallbackTask?: Pick<KnorviaTaskMeta, "unreadAt">,
): boolean {
  const storedTask = getTaskMeta(workspaceState, taskId);
  // IDE 升级或重启后，任务列表会先从 query cache 恢复，而 session store 尚未水合；
  // 此时持久化 unreadAt 只存在于列表 task。仅在 store 缺少该 task 时回退，避免旧列表覆盖 optimistic 已读状态。
  return (
    Boolean((storedTask ?? fallbackTask)?.unreadAt) ||
    workspaceState.taskUnreadByTaskId?.[taskId] === true
  );
}

// ────────────────────────────────────────────
// Standalone selector functions
// ────────────────────────────────────────────

export function selectWorkspaceKnorviaState(
  state: KnorviaSessionStoreState,
  workspacePath: string,
  workspaceIdentity?: string,
) {
  return getWorkspaceState(state, workspacePath, workspaceIdentity);
}

export function getWorkspaceInitState(
  workspaceState: Pick<WorkspaceKnorviaUIState, "workspaceInit">,
): WorkspaceInitState {
  return workspaceState.workspaceInit ?? DEFAULT_WORKSPACE_INIT_STATE;
}
