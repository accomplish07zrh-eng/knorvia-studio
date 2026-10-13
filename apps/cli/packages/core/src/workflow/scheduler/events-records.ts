// SPDX-License-Identifier: Apache-2.0
// 调度器日志记录与事件发出：图记录（状态 / 集合 / 扩张）与工作流事件的具体写入实现。
import type {
  WorkflowEvent,
  WorkflowGraphCollection,
  WorkflowNodeStatus,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { edgeId } from "./graph.js";
import type { AppliedPlannerExpansion, WorkflowGraphSchedulerDeps } from "./types.js";

type GraphRecord = Parameters<WorkflowGraphSchedulerDeps["appendGraphRecord"]>[1];
type Done = Promise<void>;

/** 写入端口：图记录、事件、订阅者回调与统一时钟。 */
export interface RecordPorts {
  eventPort: WorkflowGraphSchedulerDeps["appendEvent"];
  graphPort: WorkflowGraphSchedulerDeps["appendGraphRecord"];
  observer?: WorkflowGraphSchedulerDeps["onWorkflowEvent"];
  timestamp(): string;
}

/** 事件写入选项：消息、节点、负载、相位与取消信号。 */
export interface EventOptions {
  message?: string;
  nodeId?: string;
  payload?: Record<string, unknown>;
  phase?: string;
  signal?: AbortSignal;
}

/** 扩张批次：节点与边各自成批，recordType 即批次名。 */
type ExpansionBatch = readonly [kind: "edge" | "node", rows: readonly unknown[]];

/** 图记录：字段表由调用方按上游键序给出（含 runId 与 timestamp），这里只负责派发。 */
export async function writeRecord(
  ports: RecordPorts,
  run: WorkflowRunSnapshot,
  record: Record<string, unknown>,
  cancel?: AbortSignal,
): Promise<void> {
  await ports.graphPort(run.runId, record as GraphRecord, { signal: cancel });
}

/** 节点状态记录：op 记录里带上状态与相位。 */
export async function appendStatusRecord(
  ports: RecordPorts,
  run: WorkflowRunSnapshot,
  targetNodeId: string,
  phaseName: string,
  nextStatus: WorkflowNodeStatus,
  cancel?: AbortSignal,
): Done {
  await writeRecord(
    ports,
    run,
    {
      nodeId: targetNodeId,
      phase: phaseName,
      recordType: "op",
      runId: run.runId,
      status: nextStatus,
      timestamp: ports.timestamp(),
      type: "update_status",
    },
    cancel,
  );
}

/** 集合记录：整份集合快照。 */
export async function appendCollectionSnapshot(
  ports: RecordPorts,
  run: WorkflowRunSnapshot,
  target: WorkflowGraphCollection,
  cancel?: AbortSignal,
): Done {
  await writeRecord(
    ports,
    run,
    {
      collection: target,
      recordType: "collection",
      runId: run.runId,
      timestamp: ports.timestamp(),
    },
    cancel,
  );
}

/** 扩张记录：新增节点与边逐条落库，再写集合与汇总 op 记录。 */
export async function appendExpansionRecords(
  ports: RecordPorts,
  run: WorkflowRunSnapshot,
  applied: AppliedPlannerExpansion,
  phaseName: string,
  cancel?: AbortSignal,
): Done {
  const batches: readonly ExpansionBatch[] = [
    ["node", applied.addedNodes],
    ["edge", applied.addedEdges],
  ];
  for (const [kind, rows] of batches) {
    for (const row of rows) {
      await writeRecord(
        ports,
        run,
        { [kind]: row, recordType: kind, runId: run.runId, timestamp: ports.timestamp() },
        cancel,
      );
    }
  }

  await appendCollectionSnapshot(ports, run, applied.collection, cancel);

  const payload = {
    exhausted: applied.collection.exhausted,
    plannerRuns: applied.collection.plannerRuns,
    status: applied.collection.status,
  };
  await writeRecord(
    ports,
    run,
    {
      collectionId: applied.collection.collectionId,
      edgeIds: applied.addedEdges.map((edge) => edgeId(edge)),
      nodeIds: applied.addedNodes.map((node) => node.id),
      payload,
      phase: phaseName,
      recordType: "op",
      runId: run.runId,
      timestamp: ports.timestamp(),
      type: "graph_expanded",
    },
    cancel,
  );
}

/** 事件发出：先落库再回调订阅者。 */
export async function emitSchedulerEvent(
  ports: RecordPorts,
  run: WorkflowRunSnapshot,
  eventType: WorkflowEvent["type"],
  input: EventOptions = {},
): Done {
  const rows: readonly (readonly [string, unknown])[] = [
    ["kind", run.kind],
    ["message", input.message],
    ["nodeId", input.nodeId],
    ["payload", input.payload],
    ["phase", input.phase],
    ["runId", run.runId],
    ["timestamp", ports.timestamp()],
    ["type", eventType],
  ];
  const event = Object.fromEntries(rows) as unknown as WorkflowEvent;
  await ports.eventPort(event, { signal: input.signal });
  await ports.observer?.(event);
}
