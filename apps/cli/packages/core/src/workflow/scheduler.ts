// SPDX-License-Identifier: Apache-2.0
// 图调度循环：恢复修复 → 集合规划 → 前沿事件 → 完成/暂停判定 → 分派与收割。
// 端口组装见 scheduler-runtimes.ts，前沿事件与取消检查见 scheduler-frontier.ts。
import { reconcileWorkflowSnapshotForResume } from "./lifecycle.js";
import { checkCollectionPlanners } from "./scheduler/collection-planner.js";
import { WorkflowSchedulerEventLog } from "./scheduler/events.js";
import {
  areExecutableNodesComplete,
  blockedExecutableNodes,
  orderedReadyExecutableNodes,
} from "./scheduler/graph.js";
import { emitFrontierChanged, throwIfAborted } from "./scheduler-frontier.js";
import { runWorkflowNode } from "./scheduler/node-runner.js";
import {
  collectionPlannerRuntime,
  nodeRunnerRuntime,
  schedulerPorts,
  type SchedulerPorts,
} from "./scheduler-runtimes.js";
import type {
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerRunOptions,
  WorkflowGraphSchedulerRunResult,
  WorkflowSchedulerNodePromise,
} from "./scheduler/types.js";

export { deriveWorkflowRunSchedulerState, deriveWorkflowSchedulerState } from "@knorvia/contracts";
export type { WorkflowSchedulerDerivedNode, WorkflowSchedulerState } from "@knorvia/contracts";
export type {
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerActivityResult,
  WorkflowGraphSchedulerChildSessionStartedEvent,
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerPlannerInput,
  WorkflowGraphSchedulerPlannerRunner,
  WorkflowGraphSchedulerPlannerRunResult,
  WorkflowGraphSchedulerRunOptions,
  WorkflowGraphSchedulerRunResult,
  WorkflowGraphSchedulerRunner,
} from "./scheduler/types.js";

type Deps = WorkflowGraphSchedulerDeps;
type RunOptions = WorkflowGraphSchedulerRunOptions;
type RunResult = WorkflowGraphSchedulerRunResult;
type NodePromise = WorkflowSchedulerNodePromise;
type Snapshot = RunResult["snapshot"];
type Ids = Set<string>;
type ActiveMap = Map<string, NodePromise>;
type Limits = { concurrent: number; errors: number };
/** 快照持有者：run 与派发出去的节点 promise 共享同一个可变引用。 */
type SnapshotHolder = { snapshot: Snapshot };

/** 可执行节点集合：显式给定时用它，否则用全图节点。 */
const executableIdsOf = (input: RunOptions): Ids =>
  new Set(input.executableNodeIds ?? input.snapshot.graph.nodes.map((node) => node.id));

/** 执行器上限：并发与连续错误都取下界 1。 */
const limitsOf = (snapshot: Snapshot): Limits => ({
  concurrent: Math.max(1, snapshot.strategy.executor.maxConcurrentLoops),
  errors: Math.max(1, snapshot.strategy.executor.maxConsecutiveErrors),
});

export class WorkflowGraphScheduler {
  readonly #eventLog: WorkflowSchedulerEventLog;
  readonly #ports: SchedulerPorts;

  constructor(deps: Deps) {
    this.#eventLog = new WorkflowSchedulerEventLog(deps);
    this.#ports = schedulerPorts(deps);
  }

  async run(input: RunOptions): Promise<RunResult> {
    const ids = executableIdsOf(input);
    const repair = reconcileWorkflowSnapshotForResume(input.snapshot, {
      nodeIds: ids,
      resetPhases: false,
      timestamp: this.#eventLog.timestamp(),
    });
    const holder: SnapshotHolder = { snapshot: repair.snapshot };
    if (repair.changed) {
      await this.#ports.writeSnapshot(holder.snapshot, { signal: input.abortSignal });
    }

    const limits = limitsOf(holder.snapshot);
    const active: ActiveMap = new Map();
    let consecutiveErrors = 0;
    let frontierKey = "";

    while (true) {
      throwIfAborted(input.abortSignal);

      const planned = await checkCollectionPlanners(
        holder.snapshot,
        ids,
        input,
        collectionPlannerRuntime(this.#eventLog, this.#ports),
      );
      holder.snapshot = planned.snapshot;
      for (const nodeId of planned.addedNodeIds) ids.add(nodeId);
      if (planned.plannersRan > 0) frontierKey = "";

      frontierKey = await emitFrontierChanged({
        ids,
        log: this.#eventLog,
        previous: frontierKey,
        signal: input.abortSignal,
        snapshot: holder.snapshot,
      });

      const complete =
        areExecutableNodesComplete(
          holder.snapshot.graph,
          ids,
          Boolean(this.#ports.plannerRunner),
        ) && active.size === 0;
      if (complete) return await this.#finish(input, holder.snapshot);
      if (consecutiveErrors >= limits.errors) {
        return await this.#pauseForErrors(input, holder.snapshot, consecutiveErrors, active);
      }

      const readyNodes = orderedReadyExecutableNodes(holder.snapshot.graph, ids).filter(
        (node) => !active.has(node.id),
      );
      let dispatched = 0;
      for (const node of readyNodes) {
        if (active.size >= limits.concurrent) break;
        const promise = runWorkflowNode(
          {
            getSnapshot: () => holder.snapshot,
            setSnapshot: (next) => {
              holder.snapshot = next;
              return next;
            },
          },
          node,
          input,
          limits.errors,
          nodeRunnerRuntime(this.#eventLog, this.#ports),
        );
        active.set(node.id, promise);
        holder.snapshot = (await promise.started).snapshot;
        dispatched += 1;
      }
      if (dispatched > 0) continue;
      if (active.size > 0) {
        const outcome = await Promise.race(active.values());
        active.delete(outcome.nodeId);
        consecutiveErrors = outcome.ok ? 0 : consecutiveErrors + 1;
        continue;
      }
      return await this.#pauseForDeadlock(input, holder.snapshot, ids);
    }
  }

  /** 完成：发 executor_completed 并返回完成结果。 */
  async #finish(input: RunOptions, snapshot: Snapshot): Promise<RunResult> {
    await this.#eventLog.emitEvent(snapshot, "executor_completed", {
      message: `${input.phase} scheduler completed.`,
      phase: input.phase,
      signal: input.abortSignal,
    });
    return { reason: "completed", snapshot, status: "completed" };
  }

  /** 连续错误达阈值：等完活动节点后发 executor_paused。 */
  async #pauseForErrors(
    input: RunOptions,
    snapshot: Snapshot,
    consecutiveErrors: number,
    active: ActiveMap,
  ): Promise<RunResult> {
    await Promise.all(active.values());
    active.clear();
    await this.#eventLog.emitEvent(snapshot, "executor_paused", {
      message: `${input.phase} scheduler paused after ${consecutiveErrors} consecutive node error(s).`,
      payload: { consecutiveErrors },
      phase: input.phase,
      signal: input.abortSignal,
    });
    return { reason: "error_threshold", snapshot, status: "paused" };
  }

  /** 死锁：无可分派且无活动节点时发 executor_paused。 */
  async #pauseForDeadlock(input: RunOptions, snapshot: Snapshot, ids: Ids): Promise<RunResult> {
    await this.#eventLog.emitEvent(snapshot, "executor_paused", {
      message: `${input.phase} scheduler paused because pending nodes are blocked.`,
      payload: { blockedNodes: blockedExecutableNodes(snapshot.graph, ids) },
      phase: input.phase,
      signal: input.abortSignal,
    });
    return { reason: "deadlock", snapshot, status: "paused" };
  }
}
