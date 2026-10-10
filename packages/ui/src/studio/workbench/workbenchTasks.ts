import type { StudioOverview, WindowHostControllerTaskListItem } from "@knorvia/services";
import {
  getTaskListAttention,
  getTaskListRowActivity,
  isTaskListRowActive,
} from "@/v4/taskListRowActivity.js";
import type { StudioRoute } from "../useStudioNavigation.js";
import type { WorkbenchTile } from "./workbenchModel.js";
import { workbenchTargetKey } from "./workbenchPlacement.js";

export type WorkbenchTaskState = "running" | "queued" | "waiting" | "approval" | "input";
export interface WorkbenchTask {
  key: string;
  title: string;
  workspacePath: string;
  states: WorkbenchTaskState[];
  unavailable: boolean;
  tile?: WorkbenchTile;
  route?: Partial<StudioRoute>;
}
/** 只投影当前 Host 的事实，不按执行并发数或显示容量截断，也不生成运行命令。 */
export function activeWorkbenchTasks(
  overview: StudioOverview | undefined,
  native: WindowHostControllerTaskListItem[],
): WorkbenchTask[] {
  const rows = new Map<string, WorkbenchTask>();
  const conversations = new Map(overview?.conversations.map((item) => [item.id, item]));
  const groups = new Map(overview?.groups.map((item) => [item.id, item]));
  const workflows = new Map(overview?.workflows.map((item) => [item.id, item]));
  const pendingByRun = new Map<string, NonNullable<StudioOverview["attention"]>["items"]>();
  for (const item of overview?.attention?.items ?? []) {
    if (item.category !== "pending") continue;
    const key = JSON.stringify([item.runId, item.attempt]);
    const items = pendingByRun.get(key) ?? [];
    items.push(item);
    pendingByRun.set(key, items);
  }
  for (const run of overview?.runs ?? []) {
    if (!["queued", "running", "waiting"].includes(run.state)) continue;
    const conversation = conversations.get(run.targetId);
    const definition =
      run.kind === "group" ? groups.get(run.targetId) : workflows.get(run.targetId);
    const pending = pendingByRun.get(JSON.stringify([run.id, run.attempt])) ?? [];
    const states: WorkbenchTaskState[] = [];
    if (pending.some((item) => item.interactionKind === "approval")) states.push("approval");
    if (pending.some((item) => item.interactionKind === "question")) states.push("input");
    if (!states.length) states.push(run.state as WorkbenchTaskState);
    const key = JSON.stringify(["studio", run.kind, run.targetId]);
    const prior = rows.get(key);
    if (prior) {
      prior.states = [...new Set([...prior.states, ...states])];
      continue;
    }
    const tile: WorkbenchTile | undefined =
      conversation && run.kind === "chat"
        ? {
            id: crypto.randomUUID(),
            kernel: conversation.kernel,
            scope: { workspacePath: conversation.workspacePath },
            sessionId:
              conversation.kernel === "knorvia"
                ? (conversation.nativeSessionId ?? null)
                : conversation.id,
            opened: true,
            existing: true,
            configured: true,
          }
        : undefined;
    const focus = { focusRunId: run.id, focusTargetId: run.targetId };
    const row: WorkbenchTask = {
      key,
      title: conversation?.title || definition?.name || run.targetId,
      workspacePath:
        conversation?.workspacePath ||
        definition?.workspacePath ||
        run.definition?.workspacePath ||
        "",
      states,
      unavailable: run.kind === "chat" ? !tile?.sessionId : !definition,
      tile: tile?.sessionId ? tile : undefined,
      route:
        run.kind === "group"
          ? { ...focus, view: "groups", chatMode: "groups", groupId: run.targetId }
          : run.kind === "workflow"
            ? { ...focus, view: "workflows", workflowId: run.targetId }
            : undefined,
    };
    rows.set(key, row);
  }
  const targets = new Map(
    [...rows.values()].flatMap((row) =>
      row.tile ? [[workbenchTargetKey(row.tile), row.key] as const] : [],
    ),
  );
  for (const item of native) {
    const pending = getTaskListRowActivity(item)?.pendingInteractions;
    if (!getTaskListAttention(item) && !isTaskListRowActive(item)) continue;
    const states: WorkbenchTaskState[] = [];
    if ((pending?.permissionCount ?? 0) > 0) states.push("approval");
    if ((pending?.userInputCount ?? 0) > 0) states.push("input");
    if (!states.length) states.push("running");
    const key = JSON.stringify([
      "native",
      item.remoteSessionId,
      item.workspaceIdentity?.trim() || item.workspacePath,
      item.taskId,
    ]);
    const row: WorkbenchTask = {
      key,
      title: item.title,
      workspacePath: item.workspacePath,
      states,
      unavailable: item.sourceAvailability !== "online",
      tile: {
        id: crypto.randomUUID(),
        kernel: "knorvia",
        sessionId: item.taskId,
        opened: true,
        existing: true,
        configured: true,
        scope: {
          workspacePath: item.workspacePath,
          workspaceIdentity: item.workspaceIdentity,
          remoteSessionId: item.remoteSessionId,
        },
      },
    };
    // Studio 内置单聊可能同时出现在 Controller 中；同一真实会话只占一个视图。
    const targetKey = workbenchTargetKey(row.tile!);
    const previousKey = targets.get(targetKey);
    if (previousKey) rows.delete(previousKey);
    targets.set(targetKey, key);
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** 「添加对话」列表的一项：只引用已被 Host 受理的会话，不含未发送草稿。 */
export interface WorkbenchConversationRow {
  key: string;
  kernel: WorkbenchTile["kernel"];
  title: string;
  workspacePath: string;
  updatedAt: number;
  unavailable: boolean;
  tile: WorkbenchTile;
}
/**
 * 各内核已有对话（specs/knorvia-workbench-conversations-20261010.md）：原生会话来自 Controller
 * 未归档列表，外部内核来自 Studio 概览；同一真实会话按目标键去重，原生优先。按更新时间倒序。
 */
export function workbenchConversationRows(
  overview: StudioOverview | undefined,
  native: WindowHostControllerTaskListItem[],
): WorkbenchConversationRow[] {
  const rows = new Map<string, WorkbenchConversationRow>();
  for (const item of native) {
    const tile: WorkbenchTile = {
      id: crypto.randomUUID(),
      kernel: "knorvia",
      sessionId: item.taskId,
      opened: true,
      existing: true,
      configured: true,
      scope: {
        workspacePath: item.workspacePath,
        workspaceIdentity: item.workspaceIdentity,
        remoteSessionId: item.remoteSessionId,
      },
    };
    // 会话 ID 恒存在，目标键不会为 null。
    const key = workbenchTargetKey(tile)!;
    rows.set(key, {
      key,
      kernel: "knorvia",
      title: item.title,
      workspacePath: item.workspacePath,
      updatedAt: item.updatedAt,
      unavailable: item.sourceAvailability !== "online",
      tile,
    });
  }
  for (const conversation of overview?.conversations ?? []) {
    const sessionId =
      conversation.kernel === "knorvia" ? conversation.nativeSessionId : conversation.id;
    if (!sessionId) continue;
    const tile: WorkbenchTile = {
      id: crypto.randomUUID(),
      kernel: conversation.kernel,
      scope: { workspacePath: conversation.workspacePath },
      sessionId,
      opened: true,
      existing: true,
      configured: true,
    };
    const key = workbenchTargetKey(tile)!;
    // Studio 内置单聊同时出现在 Controller 中时以原生项为准。
    if (
      rows.has(key) ||
      (conversation.kernel === "knorvia" &&
        [...rows.values()].some(
          (row) => row.kernel === "knorvia" && row.tile.sessionId === sessionId,
        ))
    )
      continue;
    rows.set(key, {
      key,
      kernel: conversation.kernel,
      title: conversation.title,
      workspacePath: conversation.workspacePath,
      updatedAt: conversation.updatedAt,
      unavailable: false,
      tile,
    });
  }
  return [...rows.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
