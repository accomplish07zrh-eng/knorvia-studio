// SPDX-License-Identifier: Apache-2.0
// 节点活动记录：active/completed/failed 三态的字段表，以及子会话链接处理。
import {
  type WorkflowActivitySnapshot,
  type WorkflowGraphNode,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { compactWorkflowPayload, upsertActivity } from "./graph.js";
import type { WorkflowSchedulerEventLog } from "./events.js";
import type {
  WorkflowGraphSchedulerChildSessionStartedEvent,
  WorkflowGraphSchedulerDeps,
} from "./types.js";

type Deps = WorkflowGraphSchedulerDeps;

/** 节点运行器运行时：活动 id、事件日志、runner 与两个落盘端口。 */
export type WorkflowNodeRunnerRuntime = Pick<
  Deps,
  "createActivityId" | "runner" | "writeArtifact" | "writeSnapshot"
> & { eventLog: WorkflowSchedulerEventLog };

type Activity = WorkflowActivitySnapshot;
type Snap = WorkflowRunSnapshot;
type Node = WorkflowGraphNode;

/** 活动构造输入：身份、工件路径与相位。 */
export interface ActivityInput {
  activityId: string;
  inputArtifactPaths: string[];
  node: Node;
  options: { parentSessionId?: string; phase: string };
  startedAt: string;
  traceId?: string;
}

/** 运行中活动：输出路径为空、状态 active。 */
export const activeActivity = (input: ActivityInput): Activity =>
  Object.fromEntries([
    ["activityId", input.activityId],
    ["inputArtifactPaths", input.inputArtifactPaths],
    ["kind", "agent_session"],
    ["nodeId", input.node.id],
    ["outputArtifactPaths", []],
    ["parentSessionId", input.options.parentSessionId],
    ["phase", input.options.phase],
    ["startedAt", input.startedAt],
    ["status", "active"],
    ["traceId", input.traceId],
  ]) as unknown as Activity;

/** 完成活动：带工件路径、模型/会话/回合与完成时间。 */
export const completedActivity = (
  input: ActivityInput,
  result: { model?: string; sessionId: string; traceId?: string; turnId?: string },
  artifactPath: string,
  completedAt: string,
): Activity =>
  Object.fromEntries([
    ["activityId", input.activityId],
    ["artifactPath", artifactPath],
    ["completedAt", completedAt],
    ["inputArtifactPaths", input.inputArtifactPaths],
    ["kind", "agent_session"],
    ["nodeId", input.node.id],
    ["outputArtifactPaths", [artifactPath]],
    ["parentSessionId", input.options.parentSessionId],
    ["phase", input.options.phase],
    ...(result.model ? [["model", result.model]] : []),
    ["sessionId", result.sessionId],
    ["startedAt", input.startedAt],
    ["status", "completed"],
    ["traceId", result.traceId ?? input.traceId],
    ["turnId", result.turnId],
  ]) as unknown as Activity;

/** 失败活动：保留已链接的模型/会话/回合信息，状态为 failed 或 pending。 */
export const failedActivity = (
  input: ActivityInput,
  linked: Activity | undefined,
  status: string,
  errorMessage: string,
  completedAt: string,
): Activity =>
  Object.fromEntries([
    ["activityId", input.activityId],
    ["completedAt", completedAt],
    ["error", errorMessage],
    ["inputArtifactPaths", input.inputArtifactPaths],
    ["kind", "agent_session"],
    ...(linked?.model ? [["model", linked.model]] : []),
    ["nodeId", input.node.id],
    ["outputArtifactPaths", []],
    ["parentSessionId", input.options.parentSessionId],
    ["phase", input.options.phase],
    ...(linked?.sessionId ? [["sessionId", linked.sessionId]] : []),
    ["startedAt", input.startedAt],
    ["status", status],
    ["traceId", linked?.traceId ?? input.traceId],
    ...(linked?.turnId ? [["turnId", linked.turnId]] : []),
  ]) as unknown as Activity;

/** 当前活动：按 id 找活动，且仅在 active 时返回。 */
export const activeActivityOf = (snapshot: Snap, activityId: string): Activity | undefined => {
  const found = snapshot.activities.find((activity) => activity.activityId === activityId);
  return found && found.status === "active" ? found : undefined;
};

/** 按 id 查找活动（不要求 active）：失败路径要保留已链接的模型/会话/回合。 */
export const anyActivityOf = (snapshot: Snap, activityId: string): Activity | undefined =>
  snapshot.activities.find((activity) => activity.activityId === activityId);

/** 子会话链接：更新活动并把新快照落盘、发 workflow_session_linked 事件。 */
export const linkChildSession = async (args: {
  access: { getSnapshot: () => Snap; setSnapshot: (next: Snap) => Snap };
  activityId: string;
  event: WorkflowGraphSchedulerChildSessionStartedEvent;
  node: Node;
  phase: string;
  runtime: WorkflowNodeRunnerRuntime;
  signal?: AbortSignal;
}): Promise<void> => {
  const { access, activityId, event, node, phase, runtime, signal } = args;
  const current = access.getSnapshot();
  const linked = activeActivityOf(current, activityId);
  if (!linked) return;

  const activity = Object.fromEntries([
    ...Object.entries(linked),
    ...(event.model ? [["model", event.model]] : []),
    ["sessionId", event.sessionId],
    ["traceId", event.traceId ?? linked.traceId],
    ["turnId", event.turnId ?? linked.turnId],
  ]) as unknown as Activity;
  const child = upsertActivity(current, activity, runtime.eventLog.timestamp());
  await runtime.writeSnapshot(child, { signal });
  access.setSnapshot(child);
  const payload = compactWorkflowPayload(
    Object.fromEntries([
      ["activityId", activityId],
      ["model", event.model],
      ["sessionId", event.sessionId],
      ["traceId", event.traceId],
      ["turnId", event.turnId],
    ]),
  );
  await runtime.eventLog.emitEvent(child, "workflow_session_linked", {
    message: `Workflow session linked: ${event.sessionId}`,
    nodeId: node.id,
    payload,
    phase,
    signal,
  });
};
