// SPDX-License-Identifier: Apache-2.0
// 运行时上下文的载荷助手：生命周期事件载荷、紧凑载荷与节点变更去重。
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";
import type { WorkflowGraphNodeChange, WorkflowSnapshotLifecycleResult } from "../lifecycle.js";

/** 事件载荷：键值对形式，值已收敛为可序列化内容。 */
type Payload = Record<string, unknown>;

/** 节点变更列表别名。 */
type NodeChanges = WorkflowGraphNodeChange[];

/** 生命周期事件载荷：只暴露活动、节点与相位 id，避免把整份快照塞进事件。 */
export function lifecyclePayload(
  lifecycle: WorkflowSnapshotLifecycleResult<ExpertWorkflowRunSnapshot>,
): Payload {
  const nodeIds: string[] = [];
  for (const change of lifecycle.nodeChanges) {
    nodeIds.push(change.nodeId);
  }
  return { activityIds: lifecycle.activityIds, nodeIds, phaseIds: lifecycle.phaseIds };
}

/** 紧凑载荷：丢掉值为 undefined 的字段，保持事件负载稳定可比。 */
export function compactWorkflowPayload(fields: Record<string, unknown | undefined>): Payload {
  const compact: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(fields)) {
    if (entry !== undefined) compact[key] = entry;
  }
  return compact;
}

/** 节点变更去重：同一节点保留最后一次状态，并移到末尾。 */
export function dedupeWorkflowNodeChanges(items: WorkflowGraphNodeChange[]): NodeChanges {
  return items.reduce<NodeChanges>((unique, item) => {
    const position = unique.findIndex((entry) => entry.nodeId === item.nodeId);
    if (position >= 0) {
      unique.splice(position, 1);
    }
    unique.push(item);
    return unique;
  }, []);
}
