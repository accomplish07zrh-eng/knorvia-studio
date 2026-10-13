// SPDX-License-Identifier: Apache-2.0
// 运行时上下文的图日志写入：初始图（meta/节点/边/集合）、状态更新与生命周期变更批量落库。
import type { ExpertWorkflowRunSnapshot, WorkflowNodeStatus } from "@knorvia/contracts";
import type { WorkflowGraphNodeChange } from "../lifecycle.js";
import { phaseNodeId } from "./ids.js";
import type { ExpertWorkflowRuntimeDeps } from "./types.js";

/** 日志写入所需的最小上下文：存储端口与统一时钟。 */
export interface JournalContext {
  store: ExpertWorkflowRuntimeDeps["store"];
  timestamp(): string;
}

type GraphRecord = Parameters<JournalContext["store"]["appendGraphRecord"]>[1];

/** 带时间戳的图记录：字段平铺后补 recordType/runId/timestamp。 */
const appendRecord = async (
  journal: JournalContext,
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  cancel?: AbortSignal,
): Promise<void> => {
  const record = {
    ...payload,
    recordType: kind,
    runId,
    timestamp: journal.timestamp(),
  } as unknown as GraphRecord;
  await journal.store.appendGraphRecord(runId, record, { signal: cancel });
};

/** meta 记录沿用既有形态：不带时间戳，只记录定义与策略。 */
const appendMetaRecord = async (
  journal: JournalContext,
  runId: string,
  payload: Record<string, unknown>,
  cancel?: AbortSignal,
): Promise<void> => {
  const record = { ...payload, recordType: "meta", runId } as unknown as GraphRecord;
  await journal.store.appendGraphRecord(runId, record, { signal: cancel });
};

/** 初始图日志：先写 meta，再逐条写节点、边与集合。 */
export async function writeInitialGraph(
  journal: JournalContext,
  run: ExpertWorkflowRunSnapshot,
  cancel?: AbortSignal,
): Promise<void> {
  const runId = run.runId;
  await appendMetaRecord(
    journal,
    runId,
    {
      createdAt: run.createdAt,
      definitionId: run.definitionId,
      definitionVersion: run.definitionVersion,
      phaseOrder: run.phaseOrder,
      schemaVersion: 1,
      strategy: run.strategy,
    },
    cancel,
  );

  const batches: readonly (readonly [string, readonly unknown[]])[] = [
    ["node", run.graph.nodes],
    ["edge", run.graph.edges],
    ["collection", run.graph.collections ?? []],
  ];
  for (const [kind, rows] of batches) {
    for (const row of rows) {
      await appendRecord(journal, runId, kind, { [kind]: row }, cancel);
    }
  }
}

/** 节点状态日志：相位存在时一并写入，便于按相位回溯。 */
export async function appendGraphNodeStatus(
  journal: JournalContext,
  run: ExpertWorkflowRunSnapshot,
  targetNodeId: string,
  status: WorkflowNodeStatus,
  cancel?: AbortSignal,
  phaseName?: string,
): Promise<void> {
  await appendRecord(
    journal,
    run.runId,
    "op",
    { nodeId: targetNodeId, phase: phaseName, status, type: "update_status" },
    cancel,
  );
}

/** 相位状态日志：节点 id 由相位名派生。 */
export async function appendGraphStatus(
  journal: JournalContext,
  run: ExpertWorkflowRunSnapshot,
  phaseName: string,
  status: WorkflowNodeStatus,
  cancel?: AbortSignal,
): Promise<void> {
  await appendGraphNodeStatus(journal, run, phaseNodeId(phaseName), status, cancel, phaseName);
}

/** 生命周期变更批量落库：逐条写节点状态。 */
export async function appendLifecycleGraphChanges(
  journal: JournalContext,
  run: ExpertWorkflowRunSnapshot,
  changes: readonly WorkflowGraphNodeChange[],
  cancel?: AbortSignal,
): Promise<void> {
  for (const change of changes) {
    await appendGraphNodeStatus(journal, run, change.nodeId, change.status, cancel, change.phase);
  }
}
