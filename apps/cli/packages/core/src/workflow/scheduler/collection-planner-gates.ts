// SPDX-License-Identifier: Apache-2.0
// 规划器门控：集合是否可分析、未见完成节点、首轮前沿与前沿目标判定。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import {
  collectionFrontier,
  collectionNodeIdsForGraph,
  isCollectionInPhase,
  nodeById,
} from "./graph.js";
import type { SchedulerCollection } from "./types.js";

type Snap = WorkflowRunSnapshot;
type Ids = Set<string>;
type Collection = SchedulerCollection;

/** 集合分析结果：成员、前沿与未见完成节点。 */
export interface CollectionAnalysis {
  frontier: number;
  members: string[];
  unseen: string[];
}

/** 可分析判定：探索型集合且当前相位匹配。 */
export const isAnalyzable = (
  collection: Collection,
  snapshot: Snap,
  ids: Ids,
  phase: string,
): boolean =>
  Boolean(collection.explorable) && isCollectionInPhase(collection, snapshot.graph, ids, phase);

/** 集合分析：成员、前沿计数与「已完成但未分析」的节点。 */
export const analyzeCollection = (snapshot: Snap, collection: Collection): CollectionAnalysis => {
  const members = collectionNodeIdsForGraph(collection, snapshot.graph);
  const analyzed = collection.analyzedNodeIds ?? [];
  const unseen = members.filter(
    (id) => nodeById(snapshot.graph, id)?.status === "completed" && !analyzed.includes(id),
  );
  return { frontier: collectionFrontier(snapshot.graph, collection), members, unseen };
};

/** 首轮前沿：有前沿、从未规划、从未分析且无未见完成节点。 */
export const isFirstFrontier = (analysis: CollectionAnalysis, latest: Collection): boolean =>
  analysis.frontier > 0 &&
  (latest.plannerRuns ?? 0) === 0 &&
  (latest.analyzedNodeIds ?? []).length === 0 &&
  analysis.unseen.length === 0;

/** 前沿达标：前沿达到目标值且无未见完成节点。 */
export const hasReachedFrontierTarget = (
  analysis: CollectionAnalysis,
  latest: Collection,
  strategy: Snap["strategy"],
): boolean =>
  analysis.frontier >= (latest.frontierTarget ?? strategy.executor.frontierTarget) &&
  analysis.unseen.length === 0;

/** 规划次数超限。 */
export const exceedsPlannerRuns = (latest: Collection, strategy: Snap["strategy"]): boolean =>
  (latest.plannerRuns ?? 0) >= strategy.executor.maxPlannerRuns;

/** 连续错误超限。 */
export const exceedsErrorThreshold = (latest: Collection, strategy: Snap["strategy"]): boolean =>
  (latest.errorCount ?? 0) >= strategy.executor.maxConsecutiveErrors;

/** 集合已耗尽。 */
export const isExhausted = (collection: Collection): boolean =>
  Boolean(collection.exhausted) || collection.status === "exhausted";
