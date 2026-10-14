// SPDX-License-Identifier: Apache-2.0
// 工作流标识与净化：阶段节点 id、边 id、阶段可执行集合、工件名与运行 id 片段、终态判定。
// 全部是纯函数；净化与判定规则集中在命名常量里，避免逻辑中散落字面量。
import type { WorkflowGraph, WorkflowGraphEdge, WorkflowRunStatus } from "@knorvia/contracts";

const PHASE_NODE_PREFIX = "phase:";
const EDGE_ARROW = "->";
const FALLBACK_ARTIFACT_NAME = "workflow";
const UNSAFE_ARTIFACT_CHARS = /[^a-zA-Z0-9._-]+/gu;
const EDGE_TRIM = /^-+|-+$/gu;
const DOT = /[.]/gu;
const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function phaseNodeId(section: string): string {
  return PHASE_NODE_PREFIX + section;
}

export function edgeId(link: WorkflowGraphEdge): string {
  return [link.from, link.to].join(EDGE_ARROW);
}

/** 阶段可执行集合：先挑出该阶段的 task 节点，空集合退回阶段节点本身。 */
export function executableNodeIdsForPhase(graph: WorkflowGraph, section: string): string[] {
  const belongsToSection = (node: WorkflowGraph["nodes"][number]): boolean =>
    node.phase === undefined || node.phase === "" || node.phase === section;
  const ids = graph.nodes
    .filter((node) => node.kind === "task" && belongsToSection(node))
    .map(({ id }) => id);
  return ids.length === 0 ? [phaseNodeId(section)] : ids;
}

/** 工件名净化：非法字符折叠成连字符，再去掉首尾连字符；结果为空时用兜底名。 */
export function safeArtifactName(raw: string): string {
  const collapsed = raw.replace(UNSAFE_ARTIFACT_CHARS, "-").replace(EDGE_TRIM, "");
  const isEmpty = collapsed.length === 0;
  return isEmpty ? FALLBACK_ARTIFACT_NAME : collapsed;
}

export function safeRunIdSegment(raw: string): string {
  return safeArtifactName(raw).replace(DOT, "-");
}

export function isTerminalStatus(state: WorkflowRunStatus): boolean {
  return TERMINAL_STATUSES.has(state);
}
