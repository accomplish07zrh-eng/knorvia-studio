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

async function appendSeedJournal(
  ctx: ExpertWorkflowRuntimeContext,
  applied: ApplyWorkflowGraphSeedResult<ExpertWorkflowRunSnapshot>,
  phase: string,
  signal?: AbortSignal,
): Promise<void> {
  for (const node of applied.addedNodes) {
    await ctx.store.appendGraphRecord(
      applied.snapshot.runId,
      {
        node,
        recordType: "node",
        runId: applied.snapshot.runId,
        timestamp: ctx.timestamp(),
      },
      { signal },
    );
  }

  for (const edge of applied.addedEdges) {
    await ctx.store.appendGraphRecord(
      applied.snapshot.runId,
      {
        edge,
        recordType: "edge",
        runId: applied.snapshot.runId,
        timestamp: ctx.timestamp(),
      },
      { signal },
    );
  }

  for (const collection of applied.addedCollections) {
    await ctx.store.appendGraphRecord(
      applied.snapshot.runId,
      {
        collection,
        recordType: "collection",
        runId: applied.snapshot.runId,
        timestamp: ctx.timestamp(),
      },
      { signal },
    );
  }

  await ctx.store.appendGraphRecord(
    applied.snapshot.runId,
    {
      edgeIds: applied.addedEdges.map(edgeId),
      nodeIds: applied.addedNodes.map((node) => node.id),
      payload: {
        collectionIds: applied.addedCollections.map((collection) => collection.collectionId),
        sourcePhase: phase,
      },
      phase,
      recordType: "op",
      runId: applied.snapshot.runId,
      timestamp: ctx.timestamp(),
      type: "graph_seeded",
    },
    { signal },
  );
}

export async function seedGraphFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot> {
  const configuration = definition.seedGraphFromArtifact;
  if (!configuration) return snapshot;

  const targetPhase = configuration.targetPhase;
  let seed = parseWorkflowGraphSeed(response, targetPhase);
  if (!seed || (seed.nodes.length === 0 && seed.collections.length === 0)) {
    return snapshot;
  }

  if (configuration.gateAfterPhase) {
    seed = gateRootSeedNodes(seed, phaseNodeId(configuration.gateAfterPhase));
  }

  const applied = applyWorkflowGraphSeed(snapshot, seed, {
    phase: targetPhase,
    timestamp: ctx.timestamp(),
  });
  if (!applied.changed) return snapshot;

  await ctx.store.writeSnapshot(applied.snapshot, { signal });
  const journalPhase = definition.phase;
  await appendSeedJournal(ctx, applied, journalPhase, signal);

  await ctx.appendEvent(applied.snapshot.runId, "graph_expanded", {
    message: `Workflow graph seeded from ${definition.title}.`,
    payload: {
      collectionIds: applied.addedCollections.map((collection) => collection.collectionId),
      edgeIds: applied.addedEdges.map(edgeId),
      nodeIds: applied.addedNodes.map((node) => node.id),
      sourcePhase: definition.phase,
      targetPhase,
    },
    phase: definition.phase,
    signal,
  });

  return applied.snapshot;
}

export async function updateNodePromptsFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot> {
  const configuration = definition.nodePromptsFromArtifact;
  if (!configuration) return snapshot;

  const targetPhase = configuration.targetPhase;
  const updateSet = parseWorkflowNodePromptUpdateSet(response);
  if (!updateSet || updateSet.nodes.length === 0) return snapshot;

  const applied = applyWorkflowNodePromptUpdates(snapshot, updateSet.nodes, {
    phase: targetPhase,
    timestamp: ctx.timestamp(),
  });
  if (!applied.changed) return snapshot;

  await ctx.store.writeSnapshot(applied.snapshot, { signal });
  await ctx.store.appendGraphRecord(
    applied.snapshot.runId,
    {
      nodeIds: applied.updatedNodes.map((node) => node.id),
      payload: {
        sourcePhase: definition.phase,
        targetPhase,
      },
      phase: definition.phase,
      recordType: "op",
      runId: applied.snapshot.runId,
      timestamp: ctx.timestamp(),
      type: "node_prompts_updated",
    },
    { signal },
  );

  await ctx.appendEvent(applied.snapshot.runId, "graph_updated", {
    message: `Workflow node prompts updated from ${definition.title}.`,
    payload: {
      nodeIds: applied.updatedNodes.map((node) => node.id),
      sourcePhase: definition.phase,
      targetPhase,
    },
    phase: definition.phase,
    signal,
  });

  return applied.snapshot;
}
