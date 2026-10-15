// SPDX-License-Identifier: Apache-2.0
// 调度前沿事件：就绪/活动/阻塞三件套变化时发 frontier_changed，键相同则跳过。
import { blockedExecutableNodes, readyExecutableNodes } from "./scheduler/graph.js";
import type { WorkflowSchedulerEventLog } from "./scheduler/events.js";
import type { WorkflowRunSnapshot } from "@knorvia/contracts";

type Snapshot = WorkflowRunSnapshot;
type Ids = Set<string>;
type Log = WorkflowSchedulerEventLog;

/** 前沿输入：事件日志、快照、可执行集合、上次的键与取消信号。 */
export interface FrontierInput {
  ids: Ids;
  log: Log;
  previous: string;
  signal?: AbortSignal;
  snapshot: Snapshot;
}

/** 取消检查：已中止则按 signal.reason 抛出（非 Error 时用兜底文案）。 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Workflow scheduler aborted");
}

/** 活动节点：可执行且状态为 active。 */
const activeIds = (snapshot: Snapshot, ids: Ids): string[] =>
  snapshot.graph.nodes
    .filter((node) => ids.has(node.id) && node.status === "active")
    .map((node) => node.id);

/** 前沿变化时发事件并返回新键；键未变则原样返回旧键。 */
export async function emitFrontierChanged(input: FrontierInput): Promise<string> {
  const payload = {
    activeNodeIds: activeIds(input.snapshot, input.ids),
    blockedNodes: blockedExecutableNodes(input.snapshot.graph, input.ids),
    readyNodeIds: readyExecutableNodes(input.snapshot.graph, input.ids).map((node) => node.id),
  };
  const nextKey = JSON.stringify(payload);
  if (nextKey === input.previous) return input.previous;
  await input.log.emitEvent(input.snapshot, "frontier_changed", {
    message: "Workflow scheduler frontier changed.",
    payload,
    signal: input.signal,
  });
  return nextKey;
}
