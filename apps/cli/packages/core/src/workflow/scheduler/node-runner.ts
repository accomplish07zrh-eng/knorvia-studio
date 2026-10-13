// SPDX-License-Identifier: Apache-2.0
// 节点运行器：一次节点执行的三段（启动 / 运行并完成 / 失败收尾），活动字段见 node-runner-activity.ts。
import {
  createChildTraceContext,
  type TraceContext,
  type WorkflowGraphNode,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { addArtifact, updateGraphNode, upsertActivity } from "./graph.js";
import {
  activeActivity,
  activeActivityOf,
  completedActivity,
  failedActivity,
  linkChildSession,
  type ActivityInput,
} from "./node-runner-activity.js";
import type { WorkflowNodeRunnerRuntime } from "./node-runner-activity.js";
import { buildDefaultNodePrompt, safeArtifactName } from "./prompts.js";
import type {
  NodeRunOutcome,
  NodeRunStarted,
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerRunOptions,
  WorkflowGraphSchedulerSnapshotAccess,
  WorkflowSchedulerNodePromise,
} from "./types.js";

export type { WorkflowNodeRunnerRuntime } from "./node-runner-activity.js";

type Access = WorkflowGraphSchedulerSnapshotAccess;
type Options = WorkflowGraphSchedulerRunOptions;
type Runtime = WorkflowNodeRunnerRuntime;
type Node = WorkflowGraphNode;
type Snap = WorkflowRunSnapshot;
type Outcome = NodeRunOutcome;

const DEFAULT_ARTIFACT_DIRECTORY = "artifacts/exec";

/** 单次执行的上下文：一次节点运行内不变量。 */
interface RunContext {
  access: Access;
  activityId: string;
  inputArtifactPaths: string[];
  node: Node;
  options: Options;
  runtime: Runtime;
  startedAt: string;
}

/** 子追踪上下文：父上下文存在时带上工作流维度属性。 */
const childTrace = (
  parent: TraceContext | undefined,
  ctx: RunContext,
  snapshot: Snap,
): TraceContext | undefined => {
  if (!parent) return undefined;
  return createChildTraceContext(parent, {
    attributes: {
      workflowActivityId: ctx.activityId,
      workflowKind: snapshot.kind,
      workflowNodeId: ctx.node.id,
      workflowPhase: ctx.options.phase,
      workflowRunId: snapshot.runId,
    },
    sessionId: parent.sessionId,
  });
};

/** 活动构造输入：由运行上下文与追踪 id 组合。 */
const activityInput = (ctx: RunContext, traceId: string | undefined): ActivityInput => ({
  activityId: ctx.activityId,
  inputArtifactPaths: ctx.inputArtifactPaths,
  node: ctx.node,
  options: { parentSessionId: ctx.options.parentSessionId, phase: ctx.options.phase },
  startedAt: ctx.startedAt,
  traceId,
});

/** 启动段：写 active 快照与 node_started 事件，并解析 started promise。 */
const startNode = async (
  ctx: RunContext,
  initial: Snap,
  resolveStarted: (value: NodeRunStarted) => void,
): Promise<{ snapshot: Snap; traceContext?: TraceContext }> => {
  const traceContext = childTrace(ctx.options.traceContext, ctx, initial);
  const activeGraph = updateGraphNode(initial, ctx.node.id, {
    error: undefined,
    status: "active",
  });
  const activity = activeActivity(activityInput(ctx, traceContext?.traceId));
  const snapshot = upsertActivity(activeGraph, activity, ctx.runtime.eventLog.timestamp());

  await ctx.runtime.writeSnapshot(snapshot, { signal: ctx.options.abortSignal });
  ctx.access.setSnapshot(snapshot);
  await ctx.runtime.eventLog.appendGraphStatus(
    snapshot,
    ctx.node.id,
    ctx.options.phase,
    "active",
    ctx.options.abortSignal,
  );
  await ctx.runtime.eventLog.emitEvent(snapshot, "node_started", {
    message: `Node started: ${ctx.node.title}`,
    nodeId: ctx.node.id,
    phase: ctx.options.phase,
    signal: ctx.options.abortSignal,
  });
  resolveStarted({ snapshot });
  return { snapshot, traceContext };
};

/** 运行请求：把节点、相位、提示词与追踪上下文交给 runner。 */
const buildRequest = (
  ctx: RunContext,
  snapshot: Snap,
  traceContext: TraceContext | undefined,
): WorkflowGraphSchedulerActivityInput => ({
  abortSignal: ctx.options.abortSignal,
  activityId: ctx.activityId,
  cwd: ctx.options.cwd,
  node: ctx.node,
  onChildSessionStarted: async (event) => {
    await linkChildSession({
      access: ctx.access,
      activityId: ctx.activityId,
      event,
      node: ctx.node,
      phase: ctx.options.phase,
      runtime: ctx.runtime,
      signal: ctx.options.abortSignal,
    });
  },
  onEvent: ctx.options.onEvent,
  parentSessionId: ctx.options.parentSessionId,
  phase: ctx.options.phase,
  prompt: ctx.options.buildPrompt
    ? ctx.options.buildPrompt({ node: ctx.node, phase: ctx.options.phase, snapshot })
    : buildDefaultNodePrompt(snapshot, ctx.node, ctx.options.phase),
  runId: snapshot.runId,
  task: snapshot.task,
  traceContext,
});

/** 完成段：落工件、更新节点与活动、发 artifact_written 与 node_completed。 */
const finishCompleted = async (
  ctx: RunContext,
  activeSnapshot: Snap,
  traceContext: TraceContext | undefined,
): Promise<Outcome> => {
  const result = await ctx.runtime.runner.run(buildRequest(ctx, activeSnapshot, traceContext));
  const directory = ctx.options.artifactDirectory ?? DEFAULT_ARTIFACT_DIRECTORY;
  const artifact = await ctx.runtime.writeArtifact(
    activeSnapshot.runId,
    `${directory}/${safeArtifactName(ctx.node.id)}.md`,
    result.response,
    { signal: ctx.options.abortSignal },
  );

  const current = ctx.access.getSnapshot();
  const graph = updateGraphNode(current, ctx.node.id, {
    attempts: ctx.node.attempts,
    error: undefined,
    status: "completed",
  });
  const input = activityInput(ctx, traceContext?.traceId);
  const activity = completedActivity(
    input,
    {
      model: result.model,
      sessionId: result.sessionId,
      traceId: result.traceId,
      turnId: result.turnId,
    },
    artifact.relativePath,
    ctx.runtime.eventLog.timestamp(),
  );
  const withActivity = upsertActivity(graph, activity, ctx.runtime.eventLog.timestamp());
  const record = {
    contentType: "text/markdown",
    createdAt: ctx.runtime.eventLog.timestamp(),
    label: ctx.node.title,
    path: artifact.relativePath,
    phase: ctx.options.phase,
  };
  const snapshot = addArtifact(withActivity, record, ctx.runtime.eventLog.timestamp());

  await ctx.runtime.writeSnapshot(snapshot, { signal: ctx.options.abortSignal });
  ctx.access.setSnapshot(snapshot);
  await ctx.runtime.eventLog.appendGraphStatus(
    snapshot,
    ctx.node.id,
    ctx.options.phase,
    "completed",
    ctx.options.abortSignal,
  );
  await ctx.runtime.eventLog.emitEvent(snapshot, "artifact_written", {
    message: `Artifact written: ${artifact.relativePath}`,
    nodeId: ctx.node.id,
    phase: ctx.options.phase,
    signal: ctx.options.abortSignal,
  });
  await ctx.runtime.eventLog.emitEvent(snapshot, "node_completed", {
    message: `Node completed: ${ctx.node.title}`,
    nodeId: ctx.node.id,
    phase: ctx.options.phase,
    signal: ctx.options.abortSignal,
  });
  return { nodeId: ctx.node.id, ok: true, snapshot };
};

/** 失败段：按尝试次数决定 failed/pending，写错误并保留已链接会话信息。 */
const finishFailed = async (
  ctx: RunContext,
  error: unknown,
  maxAttempts: number,
  traceContext: TraceContext | undefined,
): Promise<Outcome> => {
  const attempts = (ctx.node.attempts ?? 0) + 1;
  const message = error instanceof Error ? error.message : String(error);
  const status = attempts >= maxAttempts ? "failed" : "pending";
  const current = ctx.access.getSnapshot();
  const graph = updateGraphNode(current, ctx.node.id, { attempts, error: message, status });
  const input = activityInput(ctx, traceContext?.traceId);
  const activity = failedActivity(
    input,
    activeActivityOf(current, ctx.activityId),
    status,
    message,
    ctx.runtime.eventLog.timestamp(),
  );
  const snapshot = upsertActivity(graph, activity, ctx.runtime.eventLog.timestamp());

  await ctx.runtime.writeSnapshot(snapshot, { signal: ctx.options.abortSignal });
  ctx.access.setSnapshot(snapshot);
  await ctx.runtime.eventLog.appendGraphStatus(
    snapshot,
    ctx.node.id,
    ctx.options.phase,
    status,
    ctx.options.abortSignal,
  );
  await ctx.runtime.eventLog.emitEvent(snapshot, "node_failed", {
    message,
    nodeId: ctx.node.id,
    payload: { attempts, retry: status === "pending" },
    phase: ctx.options.phase,
    signal: ctx.options.abortSignal,
  });
  return { nodeId: ctx.node.id, ok: false, snapshot };
};

export function runWorkflowNode(
  snapshotAccess: Access,
  node: Node,
  options: Options,
  maxAttempts: number,
  runtime: Runtime,
): WorkflowSchedulerNodePromise {
  let resolveStarted!: (value: NodeRunStarted) => void;
  const started = new Promise<NodeRunStarted>((resolve) => {
    resolveStarted = resolve;
  });
  const outcome = execute() as WorkflowSchedulerNodePromise;
  outcome.started = started;
  return outcome;

  async function execute(): Promise<Outcome> {
    const initial = snapshotAccess.getSnapshot();
    const ctx: RunContext = {
      access: snapshotAccess,
      activityId: runtime.createActivityId(),
      inputArtifactPaths: initial.artifacts.map((artifact) => artifact.path),
      node,
      options,
      runtime,
      startedAt: runtime.eventLog.timestamp(),
    };
    const { snapshot, traceContext } = await startNode(ctx, initial, resolveStarted);
    try {
      return await finishCompleted(ctx, snapshot, traceContext);
    } catch (error) {
      if (options.abortSignal?.aborted) throw error;
      return await finishFailed(ctx, error, maxAttempts, traceContext);
    }
  }
}
