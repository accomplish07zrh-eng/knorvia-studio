// SPDX-License-Identifier: Apache-2.0
// 生命周期公共助手：变更记录、可取消判定、快照投影与三种「取消/待定态」条目构造。
import { deriveWorkflowSessionLinks, type WorkflowRunSnapshot } from "@knorvia/contracts";

type Snap = WorkflowRunSnapshot;
type Node = Snap["graph"]["nodes"][number];
type NodeStatus = Node["status"];
type Phase = Snap["phases"][number];
type Activity = Snap["activities"][number];

/** 节点变更记录：相位可选。 */
export interface WorkflowGraphNodeChange {
  nodeId: string;
  phase?: string;
  status: NodeStatus;
}

/** 节点变更记录：相位存在时才带上。 */
export const changeOf = (node: Node, status: NodeStatus): WorkflowGraphNodeChange =>
  Object.assign({}, { nodeId: node.id, status }, node.phase ? { phase: node.phase } : {});

/** 可取消状态：active 与 pending。 */
export const isCancellable = (status: NodeStatus): boolean =>
  status === "active" || status === "pending";

/** 可重开的终态：completed / failed / skipped。 */
export const REOPENABLE: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  "completed",
  "failed",
  "skipped",
]);

/** 图投影：只换节点列表。 */
export const withNodes = <T extends Snap>(snapshot: T, nodes: Node[]): T =>
  Object.assign({}, snapshot, {
    graph: { collections: snapshot.graph.collections, edges: snapshot.graph.edges, nodes },
  }) as T;

/** 活动与会话链接投影：换活动列表并重算链接与时间。 */
export const withLinks = <T extends Snap>(snapshot: T, activities: Activity[], at: string): T =>
  Object.assign({}, snapshot, {
    activities,
    sessionLinks: deriveWorkflowSessionLinks({ activities, runId: snapshot.runId }),
    updatedAt: at,
  }) as T;

/** 相位投影：只换相位列表（取消与恢复修复都要重写相位状态）。 */
export const withPhases = <T extends Snap>(snapshot: T, phases: Phase[]): T =>
  Object.assign({}, snapshot, { phases }) as T;

/** 取消态节点：写错误原因并置为 cancelled。 */
export const cancelledNode = (node: Node, reason: string): Node =>
  Object.assign({}, node, { error: reason, status: "cancelled" as const });

/** 取消态相位：补完成时间与错误原因。 */
export const cancelledPhase = (phase: Phase, reason: string, at: string): Phase =>
  Object.assign({}, phase, {
    completedAt: phase.completedAt ?? at,
    error: phase.error ?? reason,
    status: "cancelled" as const,
  });

/** 取消态活动：补完成时间与错误原因。 */
export const cancelledActivity = (activity: Activity, reason: string, at: string): Activity =>
  Object.assign({}, activity, {
    completedAt: activity.completedAt ?? at,
    error: activity.error ?? reason,
    status: "cancelled" as const,
  });

/** 待定态节点：写原因并退回 pending。 */
export const pendingNode = (node: Node, reason: string): Node =>
  Object.assign({}, node, { error: reason, status: "pending" as const });

/** 待定态相位：写原因并退回 pending。 */
export const pendingPhase = (phase: Phase, reason: string): Phase =>
  Object.assign({}, phase, { error: reason, phase: phase.phase, status: "pending" as const });
