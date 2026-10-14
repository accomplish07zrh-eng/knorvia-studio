// SPDX-License-Identifier: Apache-2.0
// 集合事件：规划扩张后的 graph_expanded、以及集合耗尽时的快照更新与事件。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import { edgeId, updateGraphCollection } from "./graph.js";
import type {
  AppliedPlannerExpansion,
  SchedulerCollection,
  WorkflowGraphSchedulerRunOptions,
} from "./types.js";

type Done = Promise<void>;

/** 集合事件的公共输入：快照、调度选项、规划器运行时与目标集合 id。 */
export interface CollectionEventInput {
  collectionId: string;
  options: WorkflowGraphSchedulerRunOptions;
  payload?: Record<string, unknown>;
  runtime: WorkflowCollectionPlannerRuntime;
  snapshot: WorkflowRunSnapshot;
}

/** 事件发出器：统一补上相位与取消信号。 */
const emit = (
  input: CollectionEventInput,
  type: "graph_expanded" | "collection_exhausted",
  message: string,
  payload: Record<string, unknown>,
): Done =>
  input.runtime.eventLog.emitEvent(input.snapshot, type, {
    message,
    payload,
    phase: input.options.phase,
    signal: input.options.abortSignal,
  });

/** 扩张事件：有新增节点或边时发 graph_expanded；集合耗尽时补发 collection_exhausted。 */
export async function emitExpansionEvents(
  snapshot: WorkflowRunSnapshot,
  expansion: AppliedPlannerExpansion,
  collectionId: string,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): Done {
  const input: CollectionEventInput = { collectionId, options, runtime, snapshot };
  const grew = expansion.addedNodes.length > 0 || expansion.addedEdges.length > 0;
  if (grew) {
    const payload = {
      collectionId: input.collectionId,
      edgeIds: expansion.addedEdges.map((edge) => edgeId(edge)),
      nodeIds: expansion.addedNodes.map((node) => node.id),
    };
    await emit(
      input,
      "graph_expanded",
      `Graph expanded for collection: ${input.collectionId}`,
      payload,
    );
  }

  const exhausted = expansion.collection.exhausted || expansion.collection.status === "exhausted";
  if (exhausted) {
    await emit(input, "collection_exhausted", `Collection exhausted: ${input.collectionId}`, {
      collectionId: input.collectionId,
    });
  }
}

/** 耗尽态补丁：状态与 exhausted 标记一起改，避免只改一半。 */
const EXHAUSTED_PATCH = { exhausted: true, status: "exhausted" } as const;

/** 耗尽集合：投影集合状态、落盘、写集合记录并发出事件。 */
export async function exhaustCollection(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
  payload: Record<string, unknown>,
): Promise<WorkflowRunSnapshot> {
  const input: CollectionEventInput = {
    collectionId: collection.collectionId,
    options,
    payload,
    runtime,
    snapshot,
  };
  const projected = Object.assign({}, collection, EXHAUSTED_PATCH) as SchedulerCollection;
  const next = updateGraphCollection(
    input.snapshot,
    projected.collectionId,
    projected,
    input.runtime.eventLog.timestamp(),
  );

  await runtime.writeSnapshot(next, { signal: options.abortSignal });
  await runtime.eventLog.appendCollectionRecord(next, projected, options.abortSignal);
  await emit(input, "collection_exhausted", `Collection exhausted: ${projected.collectionId}`, {
    collectionId: projected.collectionId,
    ...input.payload,
  });

  return next;
}
