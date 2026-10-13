// SPDX-License-Identifier: Apache-2.0
// 规划器单次尝试：激活集合与活动、运行规划器、成功落地扩张 / 失败按错误阈值耗尽。
import {
  createChildTraceContext,
  type WorkflowActivitySnapshot,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import { emitExpansionEvents } from "./collection-events.js";
import {
  addArtifact,
  collectionFrontier,
  compactWorkflowPayload,
  normalizeCollection,
  updateGraphCollection,
  upsertActivity,
} from "./graph.js";
import { applyPlannerExpansion } from "./planner-expansion.js";
import { buildDefaultPlannerPrompt, safeArtifactName } from "./prompts.js";
import type {
  SchedulerCollection,
  WorkflowGraphSchedulerChildSessionStartedEvent,
  WorkflowGraphSchedulerPlannerRunResult,
  WorkflowGraphSchedulerRunOptions,
} from "./types.js";

type Snap = WorkflowRunSnapshot;
type Runtime = WorkflowCollectionPlannerRuntime;
type Options = WorkflowGraphSchedulerRunOptions;
type Collection = SchedulerCollection;
type Activity = WorkflowActivitySnapshot;
type Event = WorkflowGraphSchedulerChildSessionStartedEvent;

const DEFAULT_ARTIFACT_DIRECTORY = "artifacts/exec";
const PLANNER_KIND = "planner_agent";

/** 尝试结果：新增节点 id 与最新快照。 */
export type AttemptOutcome = { addedNodeIds: string[]; snapshot: Snap };

/** 尝试期间的可变状态：子会话链接会推进快照。 */
interface AttemptState {
  childLinked: Snap;
}

/** 错误文案：Error 取 message，其余转字符串。 */
const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 集合打补丁：时间戳统一取事件日志时钟。 */
const touchCollection = (
  current: Snap,
  collectionId: string,
  patch: Partial<Collection>,
  runtime: Runtime,
): Snap => updateGraphCollection(current, collectionId, patch, runtime.eventLog.timestamp());

/** 事件发出器：统一补上相位与取消信号。 */
const emitPlannerEvent = (
  runtime: Runtime,
  snapshot: Snap,
  options: Options,
  type:
    | "planner_started"
    | "planner_completed"
    | "planner_failed"
    | "collection_exhausted"
    | "workflow_session_linked",
  message: string,
  payload?: Record<string, unknown>,
): Promise<void> =>
  runtime.eventLog.emitEvent(snapshot, type, {
    message,
    payload,
    phase: options.phase,
    signal: options.abortSignal,
  });

/** 运行中的规划器活动。 */
const activePlannerActivity = (args: {
  activityId: string;
  inputArtifactPaths: string[];
  options: Options;
  startedAt: string;
  traceId?: string;
}): Activity =>
  Object.fromEntries([
    ["activityId", args.activityId],
    ["inputArtifactPaths", args.inputArtifactPaths],
    ["kind", PLANNER_KIND],
    ["outputArtifactPaths", []],
    ["parentSessionId", args.options.parentSessionId],
    ["phase", args.options.phase],
    ["startedAt", args.startedAt],
    ["status", "active"],
    ["traceId", args.traceId],
  ]) as unknown as Activity;

/** 完成的规划器活动。 */
const completedPlannerActivity = (
  args: {
    activityId: string;
    inputArtifactPaths: string[];
    options: Options;
    startedAt: string;
    traceId?: string;
  },
  result: { model?: string; sessionId: string; traceId?: string; turnId?: string },
  artifactPath: string,
  completedAt: string,
): Activity =>
  Object.fromEntries([
    ["activityId", args.activityId],
    ["artifactPath", artifactPath],
    ["completedAt", completedAt],
    ["inputArtifactPaths", args.inputArtifactPaths],
    ["kind", PLANNER_KIND],
    ["outputArtifactPaths", [artifactPath]],
    ["parentSessionId", args.options.parentSessionId],
    ["phase", args.options.phase],
    ...(result.model ? [["model", result.model]] : []),
    ["sessionId", result.sessionId],
    ["startedAt", args.startedAt],
    ["status", "completed"],
    ["traceId", result.traceId ?? args.traceId],
    ["turnId", result.turnId],
  ]) as unknown as Activity;

/** 失败的规划器活动：保留已链接的模型/会话/回合。 */
const failedPlannerActivity = (
  args: {
    activityId: string;
    inputArtifactPaths: string[];
    options: Options;
    startedAt: string;
    traceId?: string;
  },
  linked: Activity | undefined,
  message: string,
  completedAt: string,
): Activity =>
  Object.fromEntries([
    ["activityId", args.activityId],
    ["completedAt", completedAt],
    ["error", message],
    ["inputArtifactPaths", args.inputArtifactPaths],
    ["kind", PLANNER_KIND],
    ...(linked?.model ? [["model", linked.model]] : []),
    ["outputArtifactPaths", []],
    ["parentSessionId", args.options.parentSessionId],
    ["phase", args.options.phase],
    ...(linked?.sessionId ? [["sessionId", linked.sessionId]] : []),
    ["startedAt", args.startedAt],
    ["status", "failed"],
    ["traceId", linked?.traceId ?? args.traceId],
    ...(linked?.turnId ? [["turnId", linked.turnId]] : []),
  ]) as unknown as Activity;

/** 子追踪上下文：带上集合维度属性。 */
const plannerTrace = (
  parent: Options["traceContext"],
  args: { activityId: string; collectionId: string; options: Options; snapshot: Snap },
) => {
  if (!parent) return undefined;
  const attributes = Object.fromEntries([
    ["workflowActivityId", args.activityId],
    ["workflowCollectionId", args.collectionId],
    ["workflowKind", args.snapshot.kind],
    ["workflowPhase", args.options.phase],
    ["workflowRunId", args.snapshot.runId],
  ]) as never;
  return createChildTraceContext(parent, { attributes, sessionId: parent.sessionId });
};

/** 子会话链接：推进尝试状态并发出 workflow_session_linked。 */
export const linkPlannerChildSession = async (args: {
  activityId: string;
  collectionId: string;
  event: Event;
  options: Options;
  runtime: Runtime;
  state: AttemptState;
}): Promise<void> => {
  const { activityId, collectionId, event, options, runtime, state } = args;
  const previous = state.childLinked.activities.find((item) => item.activityId === activityId);
  if (previous?.status !== "active") return;

  const linked = Object.fromEntries([
    ...Object.entries(previous),
    ...(event.model ? [["model", event.model]] : []),
    ["sessionId", event.sessionId],
    ["traceId", event.traceId ?? previous.traceId],
    ["turnId", event.turnId ?? previous.turnId],
  ]) as unknown as Activity;
  state.childLinked = upsertActivity(state.childLinked, linked, runtime.eventLog.timestamp());
  await runtime.writeSnapshot(state.childLinked, { signal: options.abortSignal });

  const payload = compactWorkflowPayload(
    Object.fromEntries([
      ["activityId", activityId],
      ["collectionId", collectionId],
      ["model", event.model],
      ["sessionId", event.sessionId],
      ["traceId", event.traceId],
      ["turnId", event.turnId],
    ]),
  );
  await emitPlannerEvent(
    runtime,
    state.childLinked,
    options,
    "workflow_session_linked",
    `Workflow session linked: ${event.sessionId}`,
    payload,
  );
};

/** 激活段：写集合与活动、落盘并发 planner_started。 */
const activate = async (args: {
  activityId: string;
  activeCollection: Collection;
  activity: Activity;
  options: Options;
  original: Collection;
  plannerRuns: number;
  runtime: Runtime;
  snapshot: Snap;
  unseen: string[];
}): Promise<Snap> => {
  const { activeCollection, activity, options, original, plannerRuns, runtime, snapshot, unseen } =
    args;
  const graph = touchCollection(snapshot, original.collectionId, activeCollection, runtime);
  const activation = upsertActivity(graph, activity, runtime.eventLog.timestamp());
  await runtime.writeSnapshot(activation, { signal: options.abortSignal });
  await runtime.eventLog.appendCollectionRecord(activation, activeCollection, options.abortSignal);
  await emitPlannerEvent(
    runtime,
    activation,
    options,
    "planner_started",
    `Planner started for collection: ${original.collectionId}`,
    {
      collectionId: original.collectionId,
      frontier: collectionFrontier(activation.graph, activeCollection),
      plannerRuns,
      unseenCompletions: unseen,
    },
  );
  return activation;
};

/** 成功段：落工件、应用扩张、写完成活动并发事件。 */
const finishPlannerCompleted = async (args: {
  activeCollection: Collection;
  activityBase: {
    activityId: string;
    inputArtifactPaths: string[];
    options: Options;
    startedAt: string;
    traceId?: string;
  };
  activityId: string;
  artifactDirectory: string;
  childTrace: ReturnType<typeof plannerTrace>;
  options: Options;
  original: Collection;
  plannerRuns: number;
  result: WorkflowGraphSchedulerPlannerRunResult;
  runtime: Runtime;
  state: AttemptState;
  unseen: string[];
}): Promise<AttemptOutcome> => {
  const {
    activeCollection,
    activityBase,
    artifactDirectory,
    childTrace,
    options,
    original,
    plannerRuns,
    result,
    runtime,
    state,
    unseen,
  } = args;
  const artifact = await runtime.writeArtifact(
    state.childLinked.runId,
    `${artifactDirectory}/planners/${safeArtifactName(original.collectionId)}-${plannerRuns}.md`,
    result.response,
    { signal: options.abortSignal },
  );
  const expansion = applyPlannerExpansion(
    state.childLinked,
    activeCollection,
    result,
    unseen,
    runtime.eventLog.timestamp(),
  );
  const record = Object.fromEntries([
    ["contentType", "text/markdown"],
    ["createdAt", runtime.eventLog.timestamp()],
    ["label", `Planner ${original.collectionId}`],
    ["path", artifact.relativePath],
    ["phase", options.phase],
  ]) as unknown as Parameters<typeof addArtifact>[1];
  const withArtifact = addArtifact(expansion.snapshot, record, runtime.eventLog.timestamp());
  const completed = upsertActivity(
    withArtifact,
    completedPlannerActivity(
      activityBase,
      result,
      artifact.relativePath,
      runtime.eventLog.timestamp(),
    ),
    runtime.eventLog.timestamp(),
  );

  await runtime.writeSnapshot(completed, { signal: options.abortSignal });
  await runtime.eventLog.appendExpansionRecords(
    completed,
    expansion,
    options.phase,
    options.abortSignal,
  );
  await emitPlannerEvent(
    runtime,
    completed,
    options,
    "planner_completed",
    `Planner completed for collection: ${original.collectionId}`,
    {
      collectionId: original.collectionId,
      edgeCount: expansion.addedEdges.length,
      nodeCount: expansion.addedNodes.length,
    },
  );
  await emitExpansionEvents(completed, expansion, original.collectionId, options, runtime);
  void childTrace;
  return { addedNodeIds: expansion.addedNodes.map((node) => node.id), snapshot: completed };
};

/** 失败段：按错误阈值决定 draining/exhausted，并写 planner_failed。 */
const finishPlannerFailed = async (args: {
  activeCollection: Collection;
  activityBase: {
    activityId: string;
    inputArtifactPaths: string[];
    options: Options;
    startedAt: string;
    traceId?: string;
  };
  activityId: string;
  childTrace: ReturnType<typeof plannerTrace>;
  error: unknown;
  options: Options;
  original: Collection;
  runtime: Runtime;
  state: AttemptState;
}): Promise<AttemptOutcome> => {
  const { activeCollection, activityBase, activityId, error, options, original, runtime, state } =
    args;
  const message = errorMessageOf(error);
  const errorCount = (activeCollection.errorCount ?? 0) + 1;
  const linked = state.childLinked.activities.find((item) => item.activityId === activityId);
  const exhausted = errorCount >= state.childLinked.strategy.executor.maxConsecutiveErrors;
  const failedStatus = exhausted ? "exhausted" : "draining";
  const failedCollection: Collection = Object.assign({}, activeCollection, {
    errorCount,
    exhausted,
    status: failedStatus,
  });
  const graph = touchCollection(
    state.childLinked,
    original.collectionId,
    failedCollection,
    runtime,
  );
  const failed = upsertActivity(
    graph,
    failedPlannerActivity(activityBase, linked, message, runtime.eventLog.timestamp()),
    runtime.eventLog.timestamp(),
  );

  await runtime.writeSnapshot(failed, { signal: options.abortSignal });
  await runtime.eventLog.appendCollectionRecord(failed, failedCollection, options.abortSignal);
  const failedPayload = Object.fromEntries([
    ["collectionId", original.collectionId],
    ["errorCount", errorCount],
    ["exhausted", exhausted],
  ]);
  await emitPlannerEvent(runtime, failed, options, "planner_failed", message, failedPayload);
  if (exhausted) {
    const exhaustedPayload = Object.fromEntries([
      ["collectionId", original.collectionId],
      ["reason", "planner_error_threshold"],
    ]);
    await emitPlannerEvent(
      runtime,
      failed,
      options,
      "collection_exhausted",
      `Collection exhausted: ${original.collectionId}`,
      exhaustedPayload,
    );
  }
  return { addedNodeIds: [], snapshot: failed };
};

export async function attemptPlanner(
  snapshot: Snap,
  original: Collection,
  unseen: string[],
  options: Options,
  runtime: Runtime,
): Promise<AttemptOutcome> {
  if (!runtime.plannerRunner) return { addedNodeIds: [], snapshot };

  const activityId = runtime.createActivityId();
  const startedAt = runtime.eventLog.timestamp();
  const plannerRuns = (original.plannerRuns ?? 0) + 1;
  const inputArtifactPaths = snapshot.artifacts.map((artifact) => artifact.path);
  const childTrace = plannerTrace(options.traceContext, {
    activityId,
    collectionId: original.collectionId,
    options,
    snapshot,
  });
  const activeCollection = normalizeCollection(
    Object.assign({}, original, { plannerRuns, status: "active" }),
  );
  const activityBase = {
    activityId,
    inputArtifactPaths,
    options,
    startedAt,
    traceId: childTrace?.traceId,
  };
  const activation = await activate({
    activityId,
    activeCollection,
    activity: activePlannerActivity(activityBase),
    options,
    original,
    plannerRuns,
    runtime,
    snapshot,
    unseen,
  });
  const state: AttemptState = { childLinked: activation };
  const artifactDirectory = options.artifactDirectory ?? DEFAULT_ARTIFACT_DIRECTORY;

  try {
    const childLink = async (event: Event): Promise<void> =>
      linkPlannerChildSession({
        activityId,
        collectionId: original.collectionId,
        event,
        options,
        runtime,
        state,
      });
    const request = Object.fromEntries([
      ["abortSignal", options.abortSignal],
      ["activityId", activityId],
      ["collection", activeCollection],
      ["cwd", options.cwd],
      ["graph", activation.graph],
      ["onChildSessionStarted", childLink],
      ["onEvent", options.onEvent],
      ["parentSessionId", options.parentSessionId],
      ["phase", options.phase],
      ["prompt", buildDefaultPlannerPrompt(activation, activeCollection, options.phase)],
      ["runId", state.childLinked.runId],
      ["snapshot", state.childLinked],
      ["task", state.childLinked.task],
      ["traceContext", childTrace],
    ]) as unknown as Parameters<NonNullable<Runtime["plannerRunner"]>["run"]>[0];
    const result = await runtime.plannerRunner.run(request);
    return await finishPlannerCompleted({
      activeCollection,
      activityBase,
      activityId,
      artifactDirectory,
      childTrace,
      options,
      original,
      plannerRuns,
      result,
      runtime,
      state,
      unseen,
    });
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return await finishPlannerFailed({
      activeCollection,
      activityBase,
      activityId,
      childTrace,
      error,
      options,
      original,
      runtime,
      state,
    });
  }
}
