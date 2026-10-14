// SPDX-License-Identifier: Apache-2.0
// 调度器事件日志：图记录（状态 / 集合 / 扩张）与工作流事件的唯一发出点，时钟也由它提供。
// 实现内联在类里：任何 async 助手边界都会改变微任务顺序，而观测测试对事件/记录的先后有精确断言。
import type {
  WorkflowEvent,
  WorkflowGraphCollection,
  WorkflowNodeStatus,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { edgeId } from "./graph.js";
import type { AppliedPlannerExpansion, WorkflowGraphSchedulerDeps } from "./types.js";

type Deps = WorkflowGraphSchedulerDeps;
type GraphRecord = Parameters<Deps["appendGraphRecord"]>[1];

/** 事件写入选项：消息、节点、负载、相位与取消信号。 */
export interface EventOptions {
  message?: string;
  nodeId?: string;
  payload?: Record<string, unknown>;
  phase?: string;
  signal?: AbortSignal;
}

/** 标识与规划器端口：规划器运行需要生成活动 id，并可能调用规划器运行器。 */
type PlannerIdentityPorts = Pick<Deps, "createActivityId" | "plannerRunner">;

/** 落盘端口：快照与工件写入都由调度器注入。 */
type PlannerSinkPorts = Pick<Deps, "writeArtifact" | "writeSnapshot">;

/** 规划器运行时端口：两组端口 + 共享事件日志。 */
export type WorkflowCollectionPlannerRuntime = PlannerIdentityPorts &
  PlannerSinkPorts & {
    eventLog: WorkflowSchedulerEventLog;
  };

export class WorkflowSchedulerEventLog {
  readonly #clock: Deps["now"];
  readonly #eventPort: Deps["appendEvent"];
  readonly #graphPort: Deps["appendGraphRecord"];
  readonly #observer: Deps["onWorkflowEvent"];

  constructor(deps: Deps) {
    // 构造期按上游顺序捕获：端口 → 图端口 → 时钟 → 观察者（探针会记录 deps 的读取顺序）。
    const eventPort = deps.appendEvent;
    const graphPort = deps.appendGraphRecord;
    const now = deps.now;
    const observer = deps.onWorkflowEvent;
    this.#eventPort = eventPort;
    this.#graphPort = graphPort;
    this.#clock = now;
    this.#observer = observer;
  }

  /** 统一时钟：以实例方法调用，注入的 now 才能观察到 this=事件日志实例（上游语义）。 */
  timestamp(): string {
    return this.#clock().toISOString();
  }

  /** 节点状态记录：op 记录里带上状态与相位（键序与上游一致）。 */
  async appendGraphStatus(
    run: WorkflowRunSnapshot,
    targetNodeId: string,
    phaseName: string,
    nextStatus: WorkflowNodeStatus,
    cancel?: AbortSignal,
  ): Promise<void> {
    const rows: readonly (readonly [string, unknown])[] = [
      ["nodeId", targetNodeId],
      ["phase", phaseName],
      ["recordType", "op"],
      ["runId", run.runId],
      ["status", nextStatus],
      ["timestamp", this.timestamp()],
      ["type", "update_status"],
    ];
    await this.#graphPort(run.runId, Object.fromEntries(rows) as GraphRecord, { signal: cancel });
  }

  /** 集合记录：整份集合快照。 */
  async appendCollectionRecord(
    run: WorkflowRunSnapshot,
    target: WorkflowGraphCollection,
    cancel?: AbortSignal,
  ): Promise<void> {
    const rows: readonly (readonly [string, unknown])[] = [
      ["collection", target],
      ["recordType", "collection"],
      ["runId", run.runId],
      ["timestamp", this.timestamp()],
    ];
    await this.#graphPort(run.runId, Object.fromEntries(rows) as GraphRecord, { signal: cancel });
  }

  /** 扩张记录：新增节点与边逐条落库，再写集合与汇总 op 记录。 */
  async appendExpansionRecords(
    run: WorkflowRunSnapshot,
    applied: AppliedPlannerExpansion,
    phaseName: string,
    cancel?: AbortSignal,
  ): Promise<void> {
    const batches: readonly (readonly [string, readonly unknown[]])[] = [
      ["node", applied.addedNodes],
      ["edge", applied.addedEdges],
    ];
    for (const [kind, rows] of batches) {
      for (const row of rows) {
        const fields: readonly (readonly [string, unknown])[] = [
          [kind, row],
          ["recordType", kind],
          ["runId", run.runId],
          ["timestamp", this.timestamp()],
        ];
        await this.#graphPort(run.runId, Object.fromEntries(fields) as GraphRecord, {
          signal: cancel,
        });
      }
    }

    await this.appendCollectionRecord(run, applied.collection, cancel);

    const payload = {
      exhausted: applied.collection.exhausted,
      plannerRuns: applied.collection.plannerRuns,
      status: applied.collection.status,
    };
    const record: readonly (readonly [string, unknown])[] = [
      ["collectionId", applied.collection.collectionId],
      ["edgeIds", applied.addedEdges.map((edge) => edgeId(edge))],
      ["nodeIds", applied.addedNodes.map((node) => node.id)],
      ["payload", payload],
      ["phase", phaseName],
      ["recordType", "op"],
      ["runId", run.runId],
      ["timestamp", this.timestamp()],
      ["type", "graph_expanded"],
    ];
    await this.#graphPort(run.runId, Object.fromEntries(record) as GraphRecord, { signal: cancel });
  }

  /** 事件发出：先落库、再回调订阅者（回调抛错不影响已落库的事实）。 */
  async emitEvent(
    run: WorkflowRunSnapshot,
    eventType: WorkflowEvent["type"],
    input: EventOptions = {},
  ): Promise<void> {
    const rows: readonly (readonly [string, unknown])[] = [
      ["kind", run.kind],
      ["message", input.message],
      ["nodeId", input.nodeId],
      ["payload", input.payload],
      ["phase", input.phase],
      ["runId", run.runId],
      ["timestamp", this.timestamp()],
      ["type", eventType],
    ];
    const event = Object.fromEntries(rows) as unknown as WorkflowEvent;
    await this.#eventPort(event, { signal: input.signal });
    await this.#observer?.(event);
  }
}
