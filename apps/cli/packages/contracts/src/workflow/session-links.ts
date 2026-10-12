// SPDX-License-Identifier: Apache-2.0
// 运行快照 → 会话链接的投影：把每个 activity 转成一条 WorkflowSessionLink（B 面 workflow 契约）。
//
// 组织方式（替换阶段的自主决定）：状态映射改用查表常量而不是 switch；可选字段用显式条件赋值
// 而不是「展开 + 三元」内联对象，避免同一行同时承担「有没有值」和「键叫什么」两件事；
// 尝试次数按「阶段 + 节点 + 类型」分组递增，保持旧实现的计数口径。
import {
  type WorkflowRunSnapshot,
  type WorkflowSessionLink,
  type WorkflowSessionLinkStatus,
} from "./run-schema.js";
import { type WorkflowNodeStatus } from "./definition.js";

// 节点状态 → 会话链接状态：skipped 与 cancelled 都归为 cancelled，pending 视为 starting。
const LINK_STATUS_BY_NODE_STATUS: Record<WorkflowNodeStatus, WorkflowSessionLinkStatus> = {
  active: "running",
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  pending: "starting",
  skipped: "cancelled",
};

function linkStatusOf(status: WorkflowNodeStatus): WorkflowSessionLinkStatus {
  const mapped = LINK_STATUS_BY_NODE_STATUS[status];
  return mapped ?? "starting";
}

// 尝试分组键：同一阶段、同一节点、同一 activity 类型共享一个递增序列。
function attemptScopeOf(activity: WorkflowRunSnapshot["activities"][number]): string {
  const nodePart = activity.nodeId ?? `phase:${activity.phase}`;
  return `${activity.phase}:${nodePart}:${activity.kind}`;
}

export function deriveWorkflowSessionLinks(
  snapshot: Pick<WorkflowRunSnapshot, "activities" | "runId">,
): WorkflowSessionLink[] {
  const attemptsByScope = new Map<string, number>();
  const links: WorkflowSessionLink[] = [];
  for (const activity of snapshot.activities) {
    const scope = attemptScopeOf(activity);
    const attempt = (attemptsByScope.get(scope) ?? 0) + 1;
    attemptsByScope.set(scope, attempt);

    const link: WorkflowSessionLink = {
      activityId: activity.activityId,
      attempt,
      kind: activity.kind,
      phase: activity.phase,
      runId: snapshot.runId,
      startedAt: activity.startedAt,
      status: linkStatusOf(activity.status),
    };
    if (activity.completedAt) link.completedAt = activity.completedAt;
    if (activity.model) link.model = activity.model;
    if (activity.nodeId) link.nodeId = activity.nodeId;
    if (activity.parentSessionId) link.parentSessionId = activity.parentSessionId;
    if (activity.sessionId) link.sessionId = activity.sessionId;
    if (activity.traceId) link.traceId = activity.traceId;
    if (activity.turnId) link.turnId = activity.turnId;
    links.push(link);
  }
  return links;
}
