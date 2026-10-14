// SPDX-License-Identifier: Apache-2.0
// 运行类命令与结果构造：启动（前台/后台）、恢复、重试、取消、状态、列表、事件。
// 所有命令都从快照派生结果，修复类落盘统一走 persistRepair。
import { cancelWorkflowSnapshot, reconcileWorkflowSnapshotForResume } from "../lifecycle.js";
import { formatExpertWorkflowStatus } from "./formatters.js";
import { isTerminalStatus } from "./ids.js";
import { prepareSnapshotForRetry } from "./retry-state.js";
import { continueRun } from "./run-loop.js";
import { lifecyclePayload, type ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type {
  ExpertWorkflowCommandResult,
  ExpertWorkflowEventsOptions,
  ExpertWorkflowListOptions,
  ExpertWorkflowLookupOptions,
  ExpertWorkflowRetryOptions,
  ExpertWorkflowRunOptions,
} from "./types.js";
import type {
  ExpertWorkflowRunSnapshot,
  SessionEvent,
  TraceContext,
  WorkflowEvent,
  WorkflowRunListItem,
} from "@knorvia/contracts";

type Facade = ExpertWorkflowRuntimeContext;
type Run = ExpertWorkflowRunSnapshot;
type Command = ExpertWorkflowCommandResult;
type ResumeInput = ExpertWorkflowLookupOptions & {
  onEvent?: (event: SessionEvent) => void | Promise<void>;
  traceContext?: TraceContext;
};

/** 查不到运行时统一给出的响应文案。 */
export const NO_WORKFLOW_RESPONSE = "No expert workflow found.";

/** 查不到运行时的命令结果。 */
export const noWorkflowResult = (): Command => ({ response: NO_WORKFLOW_RESPONSE });

/** 基础结果：响应由调用方给出。 */
export const resultOf = (snapshot: Run, response: string): Command => ({
  response,
  runId: snapshot.runId,
  snapshot,
  status: snapshot.status,
  traceId: snapshot.traceId,
});

/** 状态类结果：额外附上报告路径。 */
export const statusResultOf = (snapshot: Run): Command => ({
  ...resultOf(snapshot, formatExpertWorkflowStatus(snapshot)),
  reportPath: snapshot.reportPath,
});

/** 修复类落盘：写快照 + 记录生命周期变更（恢复、重试、取消共用）。 */
const persistRepair = async (
  facade: Facade,
  snapshot: Run,
  changes: Parameters<Facade["appendLifecycleGraphChanges"]>[1],
  input: { abortSignal?: AbortSignal },
): Promise<void> => {
  await facade.store.writeSnapshot(snapshot, { signal: input.abortSignal });
  await facade.appendLifecycleGraphChanges(snapshot, changes, input.abortSignal);
};

/** 注册取消信号后跑主循环：无论成功失败都释放句柄。 */
const continueWithRegistration = async (
  facade: Facade,
  snapshot: Run,
  input: ExpertWorkflowRunOptions,
): Promise<Command> => {
  const registration = facade.registerRunAbortSignal(snapshot.runId, input.abortSignal);
  try {
    return await continueRun(facade, snapshot, { ...input, abortSignal: registration.signal });
  } finally {
    registration.dispose();
  }
};

/** 运行选项：从快照与命令选项派生（恢复/重试共用）。 */
const runOptionsOf = (
  snapshot: Run,
  input: {
    abortSignal?: AbortSignal;
    onEvent?: ResumeInput["onEvent"];
    traceContext?: TraceContext;
  },
): ExpertWorkflowRunOptions => ({
  abortSignal: input.abortSignal,
  cwd: snapshot.cwd,
  onEvent: input.onEvent,
  sessionId: snapshot.sessionId,
  task: snapshot.task,
  traceContext: input.traceContext,
});

/** 写初始快照、初始图与 run_started 事件。 */
const beginRun = async (facade: Facade, input: ExpertWorkflowRunOptions): Promise<Run> => {
  const snapshot = facade.createInitialSnapshot(input);
  await facade.store.writeSnapshot(snapshot, { signal: input.abortSignal });
  await facade.writeInitialGraph(snapshot, input.abortSignal);
  await facade.appendEvent(snapshot.runId, "run_started", {
    message: `${facade.definition.title} started.`,
    signal: input.abortSignal,
  });
  return snapshot;
};

/** 前台启动：等运行结束再返回。 */
export const startRun = async (
  facade: Facade,
  input: ExpertWorkflowRunOptions,
): Promise<Command> => {
  const snapshot = await beginRun(facade, input);
  return await continueWithRegistration(facade, snapshot, input);
};

/** 后台启动：立即返回 running 结果，失败只在未取消时记事件。 */
export const startRunInBackground = async (
  facade: Facade,
  input: ExpertWorkflowRunOptions,
): Promise<Command> => {
  const snapshot = await beginRun(facade, input);
  const running = facade.updateSnapshot(snapshot, {
    startedAt: snapshot.startedAt ?? facade.timestamp(),
    status: "running",
  });
  await facade.store.writeSnapshot(running, { signal: input.abortSignal });

  const registration = facade.registerRunAbortSignal(snapshot.runId, input.abortSignal);
  continueRun(facade, running, { ...input, abortSignal: registration.signal })
    .catch(async (error) => {
      if (registration.signal.aborted) return;
      await facade.appendEvent(snapshot.runId, "run_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => registration.dispose());
  return resultOf(running, formatExpertWorkflowStatus(running));
};

/** 恢复运行：终态直接回状态；否则修复陈旧活动后继续。 */
export const resumeRun = async (facade: Facade, input: ResumeInput): Promise<Command> => {
  const snapshot = await facade.resolveSnapshot(input);
  if (snapshot === null) return noWorkflowResult();
  if (isTerminalStatus(snapshot.status)) {
    return resultOf(snapshot, formatExpertWorkflowStatus(snapshot));
  }

  const repair = reconcileWorkflowSnapshotForResume(snapshot, { timestamp: facade.timestamp() });
  const resumed = { ...repair.snapshot, status: "running" as const, updatedAt: facade.timestamp() };
  await persistRepair(facade, resumed, repair.nodeChanges, input);
  if (repair.changed) {
    await facade.appendEvent(resumed.runId, "graph_updated", {
      message: "Workflow resume repaired stale active work.",
      payload: lifecyclePayload(repair),
      signal: input.abortSignal,
    });
  }
  return await continueWithRegistration(facade, resumed, runOptionsOf(resumed, input));
};

/** 重试运行：完成/取消直接回状态；否则按重试选项重置后继续。 */
export const retryRun = async (
  facade: Facade,
  input: ExpertWorkflowRetryOptions,
): Promise<Command> => {
  const snapshot = await facade.resolveSnapshot(input);
  if (snapshot === null) return noWorkflowResult();
  if (snapshot.status === "completed" || snapshot.status === "cancelled") {
    return resultOf(snapshot, formatExpertWorkflowStatus(snapshot));
  }

  const prepared = prepareSnapshotForRetry(facade, snapshot, input);
  await persistRepair(facade, prepared.snapshot, prepared.nodeChanges, input);
  const phase = input.phase ?? prepared.snapshot.currentPhase;
  await facade.appendEvent(prepared.snapshot.runId, "workflow_retry_started", {
    message: `${facade.definition.title} retry started.`,
    payload: {
      activityId: input.activityId,
      nodeId: input.nodeId,
      phase,
      resetNodeIds: prepared.nodeChanges.map((change) => change.nodeId),
    },
    phase,
    signal: input.abortSignal,
  });
  return await continueWithRegistration(
    facade,
    prepared.snapshot,
    runOptionsOf(prepared.snapshot, input),
  );
};

/** 取消运行：修复快照、落盘、发事件，并中止正在运行的控制器。 */
export const cancelRunCommand = async (
  facade: Facade,
  input: ExpertWorkflowLookupOptions,
): Promise<Command> => {
  const snapshot = await facade.resolveSnapshot(input);
  if (snapshot === null) return noWorkflowResult();
  if (isTerminalStatus(snapshot.status)) {
    return resultOf(snapshot, formatExpertWorkflowStatus(snapshot));
  }

  const repair = cancelWorkflowSnapshot(snapshot, { timestamp: facade.timestamp() });
  const cancelled = repair.snapshot;
  await persistRepair(facade, cancelled, repair.nodeChanges, input);
  await facade.appendEvent(cancelled.runId, "run_cancelled", {
    message: `${facade.definition.title} cancelled.`,
    payload: lifecyclePayload(repair),
    signal: input.abortSignal,
  });
  facade.activeRunAbortControllers.get(snapshot.runId)?.abort(new Error("Workflow cancelled"));
  return resultOf(cancelled, formatExpertWorkflowStatus(cancelled));
};

/** 状态查询：返回格式化状态与报告路径。 */
export const statusOf = async (
  facade: Facade,
  input: ExpertWorkflowLookupOptions,
): Promise<Command> => {
  const snapshot = await facade.resolveSnapshot(input);
  return snapshot === null ? noWorkflowResult() : statusResultOf(snapshot);
};

/** 列表：按工作区与类型列出运行。 */
export const listOf = async (
  facade: Facade,
  input: ExpertWorkflowListOptions,
): Promise<WorkflowRunListItem[]> =>
  await facade.store.listRuns(
    { cwd: input.cwd, kind: facade.definition.kind, limit: input.limit },
    { signal: input.abortSignal },
  );

/** 事件：按 runId 读取，limit 为从尾部截取的数量。 */
export const eventsOf = async (
  facade: Facade,
  input: ExpertWorkflowEventsOptions,
): Promise<WorkflowEvent[]> => {
  const events = await facade.store.readEvents(input.runId, { signal: input.abortSignal });
  return input.limit === undefined ? events : events.slice(-Math.max(0, input.limit));
};
