import {
  KNORVIA_AGENT_PROVIDER,
  generateTraceId,
  resolveWorkspaceKey,
  type KnorviaTaskMeta,
  type KnorviaSessionStateSnapshot,
  type KnorviaWorkspaceTaskListChanged,
} from "@knorvia/shared";
import type {
  SessionPhase,
  SessionSummary,
  SessionsIndexTopicFrame,
} from "@knorvia/shared/protocol-v4";
import type {
  IKnorviaAgentService,
  KnorviaAgentSessionTarget,
  KnorviaAgentWorkspaceTarget,
} from "../agent.js";
import { repairSubagentTaskIndex } from "../repairSubagentTaskIndex.js";
import type { TaskIndexRepo } from "#src/session/taskIndexRepo.js";
import type { BroadcastTask, SnapshotSyncOptions } from "./snapshotProjection.js";
import type { IngestLogger } from "./topicTypes.js";

interface SummaryPorts {
  target: KnorviaAgentWorkspaceTarget;
  agent: IKnorviaAgentService;
  repo: TaskIndexRepo;
  logger: IngestLogger;
  emit: BroadcastTask;
  terminal(target: KnorviaAgentSessionTarget, summary: SessionSummary): void;
  captureGenerationGuard(): () => boolean;
  sync(
    snapshot: KnorviaSessionStateSnapshot,
    options: SnapshotSyncOptions,
  ): Promise<KnorviaTaskMeta>;
}
type ReadbackOptions = Pick<SnapshotSyncOptions, "moveGroupedTaskToTop" | "unreadSignal">;
type ProjectionMutation = {
  target: KnorviaAgentSessionTarget;
  patch: Parameters<TaskIndexRepo["applyAgentPatch"]>[0]["patch"];
  completion:
    | { kind: "title" }
    | {
        kind: "terminal";
        readbackReason: "phase.error" | "phase.completed";
        moveGroupedTaskToTop: boolean;
        unreadSignal: KnorviaWorkspaceTaskListChanged["unreadSignal"];
      };
};
type ProjectionConsequences = {
  notification?:
    | { reason: "task_title_changed" }
    | {
        reason: "task_status_changed";
        unreadSignal: KnorviaWorkspaceTaskListChanged["unreadSignal"];
      };
  readback?: { reason: string; options: ReadbackOptions };
};

function selectConsequences(
  completion: ProjectionMutation["completion"],
  hasRow: boolean,
): ProjectionConsequences {
  if (completion.kind === "title") {
    return hasRow
      ? { notification: { reason: "task_title_changed" } }
      : { readback: { reason: "meta.titleUpdated", options: { moveGroupedTaskToTop: true } } };
  }
  const { unreadSignal, moveGroupedTaskToTop, readbackReason } = completion;
  return {
    ...(hasRow ? { notification: { reason: "task_status_changed" as const, unreadSignal } } : {}),
    readback: {
      reason: readbackReason,
      options: {
        moveGroupedTaskToTop,
        // 已有行承接了提醒；只有缺行时把提醒交给快照投影。
        ...(!hasRow && unreadSignal ? { unreadSignal } : {}),
      },
    },
  };
}

function terminal(phase: SessionPhase): boolean {
  return phase === "error" || phase === "completedSuccess" || phase === "completedInterrupted";
}

function unread(summary: SessionSummary): KnorviaWorkspaceTaskListChanged["unreadSignal"] {
  if (summary.phase === "error") return "background_terminal";
  if (
    (summary.phase === "completedSuccess" || summary.phase === "completedInterrupted") &&
    (summary.goalStatus === undefined || summary.goalStatus === "verified")
  )
    return "background_terminal";
  return undefined;
}

function baseline(target: KnorviaAgentWorkspaceTarget, summary: SessionSummary): KnorviaTaskMeta {
  let status: KnorviaTaskMeta["status"];
  if (summary.phase === "running" || summary.phase === "prewarming") status = "running";
  else if (summary.phase === "error") status = "error";
  else if (terminal(summary.phase)) status = "completed";
  return {
    taskId: summary.sessionId,
    traceId: generateTraceId(summary.sessionId),
    title: summary.title,
    ...(summary.titleSource === "custom" ? { titleOverridden: true } : {}),
    workspacePath: target.workspacePath,
    workspaceIdentity: target.workspaceIdentity,
    createdAt: summary.createdAt,
    updatedAt: summary.lastActivityAt,
    mode: "build",
    provider: KNORVIA_AGENT_PROVIDER,
    ...(summary.parentSessionId ? { forkedFromTaskId: summary.parentSessionId } : {}),
    ...(status ? { status } : {}),
  };
}

/** The summary map is the only diff baseline; persisted rows remain repository-owned. */
export function createSessionIndexProjection(ports: SummaryPorts) {
  let summaries = new Map<string, SessionSummary>();
  let hasInitialSnapshot = false;
  const broadcastTarget = (target: KnorviaAgentSessionTarget) => ({
    workspacePath: target.workspacePath,
    workspaceIdentity: target.workspaceIdentity,
    taskId: target.sessionId,
  });

  async function readback(
    target: KnorviaAgentSessionTarget,
    reason: string,
    options?: ReadbackOptions,
  ): Promise<void> {
    const failure = (error: unknown): void =>
      ports.logger.warn(
        undefined,
        `回源同步 task index 行失败 reason=${reason} taskId=${target.sessionId}`,
        error,
      );
    const publish = (snapshot: KnorviaSessionStateSnapshot) =>
      ports.sync(snapshot, {
        ...(options?.unreadSignal ? { unreadSignal: options.unreadSignal } : {}),
        broadcastReason: "task_status_changed",
        moveGroupedTaskToTop: options?.moveGroupedTaskToTop,
      });
    let captured: Promise<KnorviaSessionStateSnapshot>;
    try {
      captured = Promise.resolve(
        ports.agent.readSession({ ...target, runtimePolicy: "existing-only" }),
      );
    } catch (error) {
      failure(error);
      return;
    }
    // 读回只捕获现有 Agent 快照；发布失败由同一个完成通道处理，不重新读取。
    await captured.then(publish).then(() => undefined, failure);
  }

  async function consumeMutation(
    mutation: ProjectionMutation,
    persisted: Promise<KnorviaTaskMeta | null>,
  ): Promise<void> {
    try {
      const meta = await persisted;
      const consequences = selectConsequences(mutation.completion, !!meta);
      const notification = consequences.notification;
      if (meta && notification) {
        const target = broadcastTarget(mutation.target);
        if (notification.reason === "task_title_changed") {
          ports.emit(target, meta, notification.reason);
        } else {
          ports.emit(
            target,
            meta,
            notification.reason,
            notification.unreadSignal ? { unreadSignal: notification.unreadSignal } : undefined,
          );
        }
      }
      const convergence = consequences.readback;
      if (convergence) void readback(mutation.target, convergence.reason, convergence.options);
    } catch (error) {
      const operation = mutation.completion.kind === "terminal" ? "phase 终态" : "标题变更";
      ports.logger.warn(
        undefined,
        `同步 v4 ${operation}到 task index 失败 taskId=${mutation.target.sessionId}`,
        error,
      );
    }
  }

  function submitMutation(mutation: ProjectionMutation): void {
    const { target, patch } = mutation;
    // 提交留在同步调用栈；不能用 async 消费器吞掉 Repo 同步抛给调用方的异常。
    const persisted = ports.repo.applyAgentPatch({
      workspacePath: target.workspacePath,
      workspaceIdentity: target.workspaceIdentity,
      taskId: target.sessionId,
      patch,
    });
    void consumeMutation(mutation, persisted);
  }

  function complete(
    target: KnorviaAgentSessionTarget,
    next: SessionSummary,
    moveToTop: boolean,
  ): void {
    ports.terminal(target, next);
    const failed = next.phase === "error";
    const unreadSignal = unread(next);
    ports.logger.debug(undefined, "task 终态未读裁决", {
      goalStatus: next.goalStatus ?? null,
      phase: next.phase,
      taskId: target.sessionId,
      unreadSignal: unreadSignal ?? null,
    });
    const updatedAt = Date.now();
    submitMutation({
      target,
      patch: failed
        ? { status: "error", updatedAt }
        : { status: "completed", lastError: undefined, updatedAt },
      completion: {
        kind: "terminal",
        readbackReason: failed ? "phase.error" : "phase.completed",
        moveGroupedTaskToTop: moveToTop,
        unreadSignal,
      },
    });
  }

  function titleChanged(target: KnorviaAgentSessionTarget, title: string): void {
    const updatedAt = Date.now();
    submitMutation({ target, patch: { title, updatedAt }, completion: { kind: "title" } });
  }

  function observe(next: SessionSummary, previous: SessionSummary | undefined): void {
    summaries.set(next.sessionId, next);
    if (next.phase === "draft") return;
    const target: KnorviaAgentSessionTarget = {
      workspacePath: ports.target.workspacePath,
      workspaceIdentity: ports.target.workspaceIdentity,
      sessionId: next.sessionId,
    };
    const newlyVisible = previous === undefined || previous.phase === "draft";
    if (previous && !terminal(previous.phase) && terminal(next.phase)) {
      complete(target, next, newlyVisible);
    } else if (newlyVisible) {
      void readback(target, "session.became-visible", { moveGroupedTaskToTop: true });
    } else {
      const title = next.title.trim();
      if (title && (previous === undefined || previous.title !== next.title))
        titleChanged(target, title);
    }
  }

  async function seed(values: Iterable<SessionSummary>): Promise<void> {
    const candidates = [...values].filter((summary) => summary.phase !== "draft");
    if (candidates.length === 0) return;
    let failures = 0;
    let firstError: unknown;
    for (let start = 0; start < candidates.length; start += 64) {
      const results = await Promise.allSettled(
        candidates
          .slice(start, start + 64)
          .map((summary) => ports.repo.seedTaskMetaIfMissing(baseline(ports.target, summary))),
      );
      for (const result of results) {
        if (result.status === "rejected") {
          failures++;
          firstError ??= result.reason;
        }
      }
    }
    if (failures)
      ports.logger.warn(
        undefined,
        `首次 sessions-index 基线补齐 task index 失败 workspace=${resolveWorkspaceKey(ports.target)} failed=${failures} total=${candidates.length}`,
        firstError,
      );
  }

  return {
    apply(frame: SessionsIndexTopicFrame): void {
      if (frame.payload.kind === "deltas") {
        for (const delta of frame.payload.deltas) {
          if (delta.op === "session.upserted")
            observe(delta.session, summaries.get(delta.session.sessionId));
          else summaries.delete(delta.sessionId);
        }
        return;
      }
      const next = new Map<string, SessionSummary>();
      for (const summary of frame.payload.snapshot.sessions) next.set(summary.sessionId, summary);
      if (hasInitialSnapshot) {
        const previous = summaries;
        summaries = new Map();
        for (const summary of next.values()) observe(summary, previous.get(summary.sessionId));
        return;
      }
      summaries = next;
      hasInitialSnapshot = true;
      void seed(next.values());
      const isCurrent = ports.captureGenerationGuard();
      void repairSubagentTaskIndex({
        target: ports.target,
        visibleSessionIds: new Set(next.keys()),
        agentService: ports.agent,
        taskIndexRepo: ports.repo,
        isCurrent,
        onRemoved: () => ports.emit(ports.target, undefined, "task_meta_changed"),
      }).catch((error) =>
        ports.logger.warn(
          undefined,
          `子代理历史列表索引修复失败 workspace=${resolveWorkspaceKey(ports.target)}`,
          error,
        ),
      );
    },
  };
}
