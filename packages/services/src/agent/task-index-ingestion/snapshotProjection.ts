import {
  KNORVIA_AGENT_PROVIDER,
  deriveKnorviaTaskStatusFromSessionSnapshot,
  generateTraceId,
  getKnorviaUserVisibleMessages,
  isKnorviaGoalContinuationReminderText,
  isKnorviaModelOnlySyntheticUserMessage,
  resolveKnorviaVisibleSessionTitle,
  type KnorviaSessionStateSnapshot,
  type KnorviaMessageWithParts,
  type KnorviaTaskMeta,
  type KnorviaWorkspaceTaskListChanged,
} from "@knorvia/shared";
import type { KnorviaAgentSessionTarget } from "../agent.js";
import { formatTaskMetaModelSelectionFromSnapshot } from "../configOptions.js";
import type { TaskIndexRepo } from "#src/session/taskIndexRepo.js";
import type { IngestLogger } from "./topicTypes.js";

export interface SnapshotSyncOptions {
  modelOverride?: string;
  thoughtLevelOverride?: string;
  moveGroupedTaskToTop?: boolean;
  unreadSignal?: KnorviaWorkspaceTaskListChanged["unreadSignal"];
  broadcastReason: KnorviaWorkspaceTaskListChanged["reason"];
}

export interface WorkspaceBroadcastTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId?: string;
}

export type BroadcastTask = (
  target: WorkspaceBroadcastTarget,
  meta: KnorviaTaskMeta | undefined,
  reason: KnorviaWorkspaceTaskListChanged["reason"],
  options?: Pick<KnorviaWorkspaceTaskListChanged, "unreadSignal">,
) => void;

export function projectSnapshotMeta(
  snapshot: KnorviaSessionStateSnapshot,
  options: Pick<SnapshotSyncOptions, "modelOverride" | "thoughtLevelOverride">,
): KnorviaTaskMeta {
  const model = options.modelOverride?.trim();
  const thought = options.thoughtLevelOverride?.trim();
  const meta: KnorviaTaskMeta = {
    taskId: snapshot.session.sessionId,
    traceId: snapshot.session.traceId ?? generateTraceId(snapshot.session.sessionId),
    title: resolveKnorviaVisibleSessionTitle({
      title: snapshot.session.title,
      messages: snapshot.messages,
      target: snapshot.projection.target,
    }),
    workspacePath: snapshot.session.workspace.workspacePath,
    workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt,
    mode: snapshot.session.mode,
    model: model || formatTaskMetaModelSelectionFromSnapshot(snapshot),
    thoughtLevel: thought || snapshot.settings.thoughtLevel.current,
    provider: KNORVIA_AGENT_PROVIDER,
    status: deriveKnorviaTaskStatusFromSessionSnapshot(snapshot),
    lastError: snapshot.projection.lastError
      ? {
          code: snapshot.projection.lastError.code ?? snapshot.projection.lastError.type,
          ...(snapshot.projection.lastError.detail
            ? { detail: snapshot.projection.lastError.detail }
            : {}),
          ...(snapshot.projection.lastError.attribution
            ? { attribution: snapshot.projection.lastError.attribution }
            : {}),
          message: snapshot.projection.lastError.message,
        }
      : undefined,
  };
  if (Object.prototype.hasOwnProperty.call(snapshot.projection, "target")) {
    const goal = snapshot.projection.target;
    meta.target = goal
      ? {
          sessionID: goal.sessionId,
          targetID: goal.targetId,
          objective: goal.objective,
          summaryTitle: goal.summaryTitle,
          status: goal.status,
          tokenBudget: goal.tokenBudget,
          tokensUsed: goal.tokensUsed,
          timeUsedSeconds: goal.timeUsedSeconds,
          time: { created: goal.createdAt, updated: goal.updatedAt },
        }
      : goal;
  }
  return meta;
}

function visible(snapshot: KnorviaSessionStateSnapshot): boolean {
  const title = snapshot.session.title?.trim() ?? "";
  if (title && !isKnorviaGoalContinuationReminderText(title)) return true;
  if (snapshot.projection.target?.objective.trim()) return true;
  return snapshot.messages.some(
    (message) =>
      message.info.role === "user" &&
      !isKnorviaModelOnlySyntheticUserMessage(message) &&
      message.parts.some((part) => part.type === "text" && part.text.trim().length > 0),
  );
}

function* messageSearchParts(message: KnorviaMessageWithParts): Generator<string> {
  if (message.info.role === "assistant") {
    for (let index = message.parts.length - 1; index >= 0; index--) {
      const part = message.parts[index];
      if (part?.type !== "text") continue;
      yield part.text;
      return;
    }
  } else {
    for (const part of message.parts) {
      if (part.type === "text") yield part.text;
    }
  }
}

export function projectSnapshotSearchText(snapshot: KnorviaSessionStateSnapshot): string {
  let text = "";
  let remaining = 200_000;
  const messages = getKnorviaUserVisibleMessages(snapshot.messages, {
    target: snapshot.projection.target,
  });
  for (const message of messages) {
    for (const raw of messageSearchParts(message)) {
      const fragment = raw.trim();
      if (fragment.length === 0) continue;
      text += (text.length ? "\n" : "") + fragment;
      remaining -= fragment.length;
      // 兼容旧正文预算：先计正文长度，再截断含换行的最终值。
      if (remaining <= 0) return text.slice(0, 200_000);
    }
  }
  return text.slice(0, 200_000);
}

export function createSnapshotProjection(
  repo: TaskIndexRepo,
  emit: BroadcastTask,
  logger: IngestLogger,
) {
  return {
    async sync(
      snapshot: KnorviaSessionStateSnapshot,
      options: SnapshotSyncOptions,
    ): Promise<KnorviaTaskMeta> {
      const meta = projectSnapshotMeta(snapshot, options);
      if (snapshot.session.sessionKind === "subagent_child") return meta;
      const searchableText = projectSnapshotSearchText(snapshot);
      let initializedGroupedOrder = false;
      let persisted: KnorviaTaskMeta;
      if (options.moveGroupedTaskToTop) {
        const result = await repo.syncTaskMetaAtGroupedTop({ meta, searchableText });
        persisted = result.meta;
        initializedGroupedOrder = result.initializedGroupedOrder;
      } else persisted = await repo.syncTaskMeta({ meta, searchableText });
      const target = {
        workspacePath: persisted.workspacePath,
        workspaceIdentity: persisted.workspaceIdentity,
        taskId: persisted.taskId,
      };
      if (!visible(snapshot)) {
        // 初始空快照仍入库；新 grouped 顺序只使结构失效，不显示占位标题。
        if (initializedGroupedOrder) emit(target, undefined, "task_created");
      } else {
        emit(
          target,
          persisted,
          initializedGroupedOrder ? "task_created" : options.broadcastReason,
          options.unreadSignal ? { unreadSignal: options.unreadSignal } : undefined,
        );
      }
      return persisted;
    },
    async model(target: KnorviaAgentSessionTarget, model: string): Promise<KnorviaTaskMeta | null> {
      const normalized = model.trim();
      if (!normalized) return null;
      try {
        return await repo.updateTaskState({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          taskId: target.sessionId,
          patch: { model: normalized },
        });
      } catch (error) {
        logger.warn(
          undefined,
          `同步 task 模型到 task index 失败 taskId=${target.sessionId}`,
          error,
        );
        return null;
      }
    },
  };
}
