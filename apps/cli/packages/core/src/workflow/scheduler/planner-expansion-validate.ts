// SPDX-License-Identifier: Apache-2.0
// 扩张校验：对规划器新增的每条边做自环、未知端点、重复与成环检查（顺序即拒绝优先级）。
import { edgeId } from "./graph.js";
import type { RouteIndex } from "./planner-expansion-routes.js";
import type { WorkflowGraphRecordEdge } from "./types.js";

/** 单条边的校验输入。 */
export interface EdgeCheckInput {
  accepted: ReadonlySet<string>;
  edge: WorkflowGraphRecordEdge;
  index: RouteIndex;
  nodeIds: ReadonlySet<string>;
}

/** 校验项：返回 null 表示通过，否则返回拒绝原因。 */
type EdgeCheck = (input: EdgeCheckInput) => string | null;

/** 校验表：顺序即拒绝优先级，与调度器既有报错文案一致。 */
const EDGE_CHECKS: readonly EdgeCheck[] = [
  ({ edge }) =>
    edge.from === edge.to ? `Planner returned a self-loop edge: ${edge.from} -> ${edge.to}` : null,
  ({ edge, nodeIds }) =>
    nodeIds.has(edge.from)
      ? null
      : `Planner returned an edge with unknown source node: ${edge.from}`,
  ({ edge, nodeIds }) =>
    nodeIds.has(edge.to) ? null : `Planner returned an edge with unknown target node: ${edge.to}`,
  ({ accepted, edge }) =>
    accepted.has(edgeId(edge)) ? `Planner returned duplicate workflow edge: ${edgeId(edge)}` : null,
  ({ index, edge }) =>
    index.reaches(edge.to, edge.from)
      ? `Planner returned an edge that would create a cycle: ${edgeId(edge)}`
      : null,
];

/** 依次跑校验表：首个失败项的原因即抛错内容。 */
export function edgeRejection(input: EdgeCheckInput): string | null {
  for (const check of EDGE_CHECKS) {
    const reason = check(input);
    if (reason !== null) return reason;
  }
  return null;
}
