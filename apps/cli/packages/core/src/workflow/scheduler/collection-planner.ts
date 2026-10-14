// SPDX-License-Identifier: Apache-2.0
// 集合规划入口：遍历集合，按门控决定跳过/激活/耗尽/规划；单次规划见 collection-planner-attempt.ts。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import { throwIfAborted } from "../scheduler-frontier.js";
import { attemptPlanner } from "./collection-planner-attempt.js";
import {
  analyzeCollection,
  exceedsErrorThreshold,
  exceedsPlannerRuns,
  hasReachedFrontierTarget,
  isAnalyzable,
  isFirstFrontier,
  isExhausted,
} from "./collection-planner-gates.js";
import { exhaustCollection } from "./collection-events.js";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import { graphCollections, updateGraphCollection } from "./graph.js";
import type { SchedulerCollection, WorkflowGraphSchedulerRunOptions } from "./types.js";

type Snap = WorkflowRunSnapshot;
type Options = WorkflowGraphSchedulerRunOptions;
type Runtime = WorkflowCollectionPlannerRuntime;
type Collection = SchedulerCollection;

/** 检查结果：新增节点 id、规划次数与最新快照。 */
export interface CollectionPlannerCheckResult {
  addedNodeIds: string[];
  plannersRan: number;
  snapshot: Snap;
}

/** 集合打补丁：时间戳统一取事件日志时钟。 */
const touchCollection = (
  current: Snap,
  collectionId: string,
  patch: Partial<Collection>,
  runtime: Runtime,
): Snap => updateGraphCollection(current, collectionId, patch, runtime.eventLog.timestamp());

/** 刷新完成时间：存在未见完成节点时打标。 */
const markCompletions = (current: Snap, collection: Collection, runtime: Runtime): Snap =>
  touchCollection(
    current,
    collection.collectionId,
    { lastCompletionAt: runtime.eventLog.timestamp() },
    runtime,
  );

/** 取最新集合：图上找不到时退回原集合。 */
const latestCollection = (current: Snap, original: Collection): Collection =>
  graphCollections(current.graph).find((entry) => entry.collectionId === original.collectionId) ??
  original;

/** 激活集合：状态置为 active。 */
const activate = (current: Snap, collection: Collection, runtime: Runtime): Snap =>
  touchCollection(current, collection.collectionId, { status: "active" }, runtime);

/** 耗尽集合：带原因负载。 */
const exhaust = (
  current: Snap,
  collection: Collection,
  options: Options,
  runtime: Runtime,
  reason: string,
): Promise<Snap> => exhaustCollection(current, collection, options, runtime, { reason });

export async function checkCollectionPlanners(
  snapshot: Snap,
  ids: Set<string>,
  options: Options,
  runtime: Runtime,
): Promise<CollectionPlannerCheckResult> {
  const acc = { addedNodeIds: [] as string[], plannersRan: 0 };
  if (!runtime.plannerRunner) return { ...acc, snapshot };

  let current = snapshot;
  for (const original of graphCollections(snapshot.graph)) {
    throwIfAborted(options.abortSignal);
    if (!isAnalyzable(original, current, ids, options.phase)) continue;

    const analysis = analyzeCollection(current, original);
    if (analysis.unseen.length > 0) current = markCompletions(current, original, runtime);
    const latest = latestCollection(current, original);
    if (isExhausted(latest)) continue;

    const strategy = current.strategy;
    if (isFirstFrontier(analysis, latest) || hasReachedFrontierTarget(analysis, latest, strategy)) {
      current = activate(current, latest, runtime);
      continue;
    }
    if (exceedsPlannerRuns(latest, strategy)) {
      current = await exhaust(current, latest, options, runtime, "max_planner_runs");
      continue;
    }
    if (exceedsErrorThreshold(latest, strategy)) {
      current = await exhaust(current, latest, options, runtime, "planner_error_threshold");
      continue;
    }

    const outcome = await attemptPlanner(current, latest, analysis.unseen, options, runtime);
    current = outcome.snapshot;
    acc.addedNodeIds.push(...outcome.addedNodeIds);
    acc.plannersRan += 1;
  }
  return { ...acc, snapshot: current };
}
