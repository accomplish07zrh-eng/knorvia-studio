// SPDX-License-Identifier: Apache-2.0
// 调度器事件日志：持有写入端口与时钟，把记录/事件写入委托给 events-records.ts。
import type {
  WorkflowEvent,
  WorkflowGraphCollection,
  WorkflowNodeStatus,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import {
  appendCollectionSnapshot,
  appendExpansionRecords,
  appendStatusRecord,
  emitSchedulerEvent,
  type EventOptions,
  type RecordPorts,
} from "./events-records.js";
import type { AppliedPlannerExpansion, WorkflowGraphSchedulerDeps } from "./types.js";

export type { EventOptions } from "./events-records.js";

/** 标识与规划器端口：规划器运行需要生成活动 id，并可能调用规划器运行器。 */
type PlannerIdentityPorts = Pick<WorkflowGraphSchedulerDeps, "createActivityId" | "plannerRunner">;

/** 落盘端口：快照与工件写入都由调度器注入。 */
type PlannerSinkPorts = Pick<WorkflowGraphSchedulerDeps, "writeArtifact" | "writeSnapshot">;

/** 规划器运行时端口：两组端口 + 共享事件日志。 */
export type WorkflowCollectionPlannerRuntime = PlannerIdentityPorts &
  PlannerSinkPorts & {
    eventLog: WorkflowSchedulerEventLog;
  };

/**
 * 调度器事件日志：调度循环里所有「写」动作的唯一出口。
 *
 * 约定：
 * - 图记录与工作流事件都经 `#ports` 写入，调用方不直接触碰 store；
 * - 时间统一取 `timestamp()`（注入时钟），保证记录与事件的先后可判定；
 * - 事件先落库、再回调订阅者，回调抛错不影响已落库的事实。
 */
export class WorkflowSchedulerEventLog {
  readonly #clock: WorkflowGraphSchedulerDeps["now"];
  readonly #eventPort: WorkflowGraphSchedulerDeps["appendEvent"];
  readonly #graphPort: WorkflowGraphSchedulerDeps["appendGraphRecord"];
  readonly #observer: WorkflowGraphSchedulerDeps["onWorkflowEvent"];
  readonly #ports: RecordPorts;

  constructor(deps: WorkflowGraphSchedulerDeps) {
    // 构造期按上游顺序捕获：端口 → 图端口 → 时钟 → 观察者；探针会记录 deps 的读取顺序。
    const eventPort = deps.appendEvent;
    const graphPort = deps.appendGraphRecord;
    const now = deps.now;
    const observer = deps.onWorkflowEvent;
    this.#eventPort = eventPort;
    this.#graphPort = graphPort;
    this.#clock = now;
    this.#observer = observer;
    // 转发层：仍以实例方法形式调用端口，注入实现才能观察到 this=事件日志实例（上游语义）。
    this.#ports = {
      eventPort: (...args) => this.#eventPort(...args),
      graphPort: (...args) => this.#graphPort(...args),
      observer: (...args) => this.#observer?.(...args),
      timestamp: () => this.timestamp(),
    };
  }

  /** 统一时钟：实例方法调用，注入时钟的 this 即事件日志实例。 */
  timestamp(): string {
    return this.#clock().toISOString();
  }

  /** 节点状态记录。 */
  async appendGraphStatus(
    run: WorkflowRunSnapshot,
    targetNodeId: string,
    phaseName: string,
    nextStatus: WorkflowNodeStatus,
    cancel?: AbortSignal,
  ): Promise<void> {
    await appendStatusRecord(this.#ports, run, targetNodeId, phaseName, nextStatus, cancel);
  }

  /** 集合记录。 */
  async appendCollectionRecord(
    run: WorkflowRunSnapshot,
    target: WorkflowGraphCollection,
    cancel?: AbortSignal,
  ): Promise<void> {
    await appendCollectionSnapshot(this.#ports, run, target, cancel);
  }

  /** 扩张记录：节点、边、集合与汇总 op。 */
  async appendExpansionRecords(
    run: WorkflowRunSnapshot,
    applied: AppliedPlannerExpansion,
    phaseName: string,
    cancel?: AbortSignal,
  ): Promise<void> {
    await appendExpansionRecords(this.#ports, run, applied, phaseName, cancel);
  }

  /** 事件发出。 */
  async emitEvent(
    run: WorkflowRunSnapshot,
    eventType: WorkflowEvent["type"],
    input: EventOptions = {},
  ): Promise<void> {
    await emitSchedulerEvent(this.#ports, run, eventType, input);
  }
}
