// SPDX-License-Identifier: Apache-2.0
// 相位工件 → 图变更：把「从工件里读出的图种子 / 节点提示词」应用到快照，并把变更写进图日志与事件。
// 三类图记录（node/edge/collection）用同一张表驱动，避免三段近乎相同的循环。
import {
  applyWorkflowGraphSeed,
  applyWorkflowNodePromptUpdates,
  type ApplyWorkflowGraphSeedResult,
} from "../lifecycle.js";
import { edgeId, phaseNodeId } from "./ids.js";
import { gateRootSeedNodes, parseWorkflowGraphSeed } from "./parsers/graph-seed.js";
import { parseWorkflowNodePromptUpdateSet } from "./parsers/node-prompts.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";

type Runtime = ExpertWorkflowRuntimeContext;
type Snapshot = ExpertWorkflowRunSnapshot;
type GraphRecord = Parameters<Runtime["store"]["appendGraphRecord"]>[1];
type JournalKind = "node" | "edge" | "collection";

/** 一次图记录写入：键名与 recordType 同源，避免逐类复制粘贴。 */
async function appendJournal(
  runtime: Runtime,
  runId: string,
  kind: JournalKind,
  payload: unknown,
  cancel?: AbortSignal,
): Promise<void> {
  const record = {
    [kind]: payload,
    recordType: kind,
    runId,
    timestamp: runtime.timestamp(),
  } as unknown as GraphRecord;
  await runtime.store.appendGraphRecord(runId, record, { signal: cancel });
}

/** 播种后的图日志：三类新增记录 + 一条汇总 op。 */
async function journalSeed(
  runtime: Runtime,
  outcome: ApplyWorkflowGraphSeedResult<Snapshot>,
  sourcePhase: string,
  cancel?: AbortSignal,
): Promise<void> {
  const runId = outcome.snapshot.runId;
  const batches: readonly (readonly [JournalKind, readonly unknown[]])[] = [
    ["node", outcome.addedNodes],
    ["edge", outcome.addedEdges],
    ["collection", outcome.addedCollections],
  ];
  for (const [kind, items] of batches) {
    for (const item of items) await appendJournal(runtime, runId, kind, item, cancel);
  }

  const edgeIds = outcome.addedEdges.map(edgeId);
  const nodeIds = outcome.addedNodes.map((node) => node.id);
  const collectionIds = outcome.addedCollections.map((collection) => collection.collectionId);
  await runtime.store.appendGraphRecord(
    runId,
    {
      edgeIds,
      nodeIds,
      payload: { collectionIds, sourcePhase },
      phase: sourcePhase,
      recordType: "op",
      runId,
      timestamp: runtime.timestamp(),
      type: "graph_seeded",
    } as unknown as GraphRecord,
    { signal: cancel },
  );
}

export async function seedGraphFromPhaseArtifact(
  runtime: Runtime,
  input: Snapshot,
  phaseDefinition: WorkflowPhaseDefinition,
  payload: string,
  cancel?: AbortSignal,
): Promise<Snapshot> {
  const settings = phaseDefinition.seedGraphFromArtifact;
  if (!settings) return input;

  const targetPhase = settings.targetPhase;
  let seeded = parseWorkflowGraphSeed(payload, targetPhase);
  if (!seeded) return input;
  const nothingSeeded = seeded.nodes.length === 0 && seeded.collections.length === 0;
  if (nothingSeeded) return input;

  if (settings.gateAfterPhase) {
    seeded = gateRootSeedNodes(seeded, phaseNodeId(settings.gateAfterPhase));
  }

  const outcome = applyWorkflowGraphSeed(input, seeded, {
    phase: targetPhase,
    timestamp: runtime.timestamp(),
  });
  if (!outcome.changed) return input;

  await runtime.store.writeSnapshot(outcome.snapshot, { signal: cancel });
  await journalSeed(runtime, outcome, phaseDefinition.phase, cancel);

  const edgeIds = outcome.addedEdges.map(edgeId);
  const nodeIds = outcome.addedNodes.map((node) => node.id);
  const collectionIds = outcome.addedCollections.map((collection) => collection.collectionId);
  await runtime.appendEvent(outcome.snapshot.runId, "graph_expanded", {
    message: `Workflow graph seeded from ${phaseDefinition.title}.`,
    payload: { collectionIds, edgeIds, nodeIds, sourcePhase: phaseDefinition.phase, targetPhase },
    phase: phaseDefinition.phase,
    signal: cancel,
  });

  return outcome.snapshot;
}

export async function updateNodePromptsFromPhaseArtifact(
  runtime: Runtime,
  input: Snapshot,
  phaseDefinition: WorkflowPhaseDefinition,
  payload: string,
  cancel?: AbortSignal,
): Promise<Snapshot> {
  const settings = phaseDefinition.nodePromptsFromArtifact;
  if (!settings) return input;

  const targetPhase = settings.targetPhase;
  const updateSet = parseWorkflowNodePromptUpdateSet(payload);
  if (!updateSet || updateSet.nodes.length === 0) return input;

  const outcome = applyWorkflowNodePromptUpdates(input, updateSet.nodes, {
    phase: targetPhase,
    timestamp: runtime.timestamp(),
  });
  if (!outcome.changed) return input;

  await runtime.store.writeSnapshot(outcome.snapshot, { signal: cancel });
  const nodeIds = outcome.updatedNodes.map((node) => node.id);
  const sourcePhase = phaseDefinition.phase;
  await runtime.store.appendGraphRecord(
    outcome.snapshot.runId,
    {
      nodeIds,
      payload: { sourcePhase, targetPhase },
      phase: sourcePhase,
      recordType: "op",
      runId: outcome.snapshot.runId,
      timestamp: runtime.timestamp(),
      type: "node_prompts_updated",
    } as unknown as GraphRecord,
    { signal: cancel },
  );

  await runtime.appendEvent(outcome.snapshot.runId, "graph_updated", {
    message: `Workflow node prompts updated from ${phaseDefinition.title}.`,
    payload: { nodeIds, sourcePhase, targetPhase },
    phase: sourcePhase,
    signal: cancel,
  });

  return outcome.snapshot;
}
