import type {
  ExpertWorkflowRunSnapshot,
  WorkflowCriticReopenProposal,
  WorkflowPhaseDefinition,
} from "@knorvia/contracts";
import { reopenWorkflowGraphNode } from "../lifecycle.js";
import { phaseNodeId } from "./ids.js";
import { dedupeReopenProposals, parseCriticResult } from "./parsers/critic.js";
import { runPhase } from "./phase-runner.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import { runScheduledPhase } from "./scheduled-phase.js";
import type { ExpertWorkflowRunOptions } from "./types.js";

async function admitReopen(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  proposal: WorkflowCriticReopenProposal,
  iteration: number,
  phase: WorkflowPhaseDefinition["phase"],
  signal: AbortSignal | undefined,
): Promise<{
  reopenAttempts: number;
  snapshot: ExpertWorkflowRunSnapshot;
} | null> {
  try {
    const result = reopenWorkflowGraphNode(snapshot, {
      maxReopens: 2,
      nodeId: proposal.nodeId,
      reason: proposal.reason,
      timestamp: ctx.timestamp(),
    });
    return {
      reopenAttempts: result.reopenAttempts,
      snapshot: result.snapshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.appendEvent(snapshot.runId, "critic_failed", {
      message: `Critic reopen rejected for ${proposal.nodeId}: ${message}`,
      payload: {
        iteration,
        nodeId: proposal.nodeId,
        reason: proposal.reason,
        rejected: true,
      },
      phase,
      signal,
    });
    return null;
  }
}

async function appendReopenRecord(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  proposal: WorkflowCriticReopenProposal,
  iteration: number,
  reopenAttempts: number,
  phase: WorkflowPhaseDefinition["phase"],
  signal: AbortSignal | undefined,
): Promise<void> {
  await ctx.store.appendGraphRecord(
    snapshot.runId,
    {
      nodeId: proposal.nodeId,
      payload: {
        iteration,
        reason: proposal.reason,
        reopenAttempts,
        severity: proposal.severity,
      },
      phase,
      recordType: "op",
      runId: snapshot.runId,
      status: "pending",
      timestamp: ctx.timestamp(),
      type: "reopen_node",
    },
    { signal },
  );
}

function resetPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  phase: WorkflowPhaseDefinition["phase"],
  reason: string,
): ExpertWorkflowRunSnapshot {
  const nodeId = phaseNodeId(phase);
  return {
    ...snapshot,
    currentPhase: phase,
    graph: {
      collections: snapshot.graph.collections,
      edges: snapshot.graph.edges,
      nodes: snapshot.graph.nodes.map((node) =>
        node.id === nodeId && node.kind === "phase"
          ? { ...node, error: reason, status: "pending" }
          : node,
      ),
    },
    phases: snapshot.phases.map((entry) =>
      entry.phase === phase ? { error: reason, phase, status: "pending" } : entry,
    ),
    updatedAt: ctx.timestamp(),
  };
}

export async function runFinalCriticLoop(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot> {
  let current = snapshot;
  const executionDefinition = ctx.definition.phases.find(
    (phase) => phase.behavior === "scheduled_graph",
  );
  if (!executionDefinition) {
    throw new Error(`${ctx.definition.title} definition is missing a scheduled graph phase`);
  }

  let iteration = 1;
  while (iteration <= current.strategy.finalCritic.maxIterations) {
    await ctx.appendEvent(current.runId, "critic_started", {
      message: `Final critic iteration ${iteration} started.`,
      payload: { iteration },
      phase: definition.phase,
      signal: options.abortSignal,
    });

    const result = await runPhase(ctx, current, definition, options);
    current = result.snapshot;
    const critic = parseCriticResult(result.response);

    if (critic.verdict === "pass") {
      await ctx.appendEvent(current.runId, "critic_passed", {
        message: critic.reasoning || `Final critic iteration ${iteration} passed.`,
        payload: { acceptanceGaps: critic.acceptanceGaps, iteration },
        phase: definition.phase,
        signal: options.abortSignal,
      });
      return current;
    }

    const proposals = dedupeReopenProposals(critic.reopenProposals);
    await ctx.appendEvent(current.runId, "critic_failed", {
      message: critic.reasoning || `Final critic iteration ${iteration} failed.`,
      payload: {
        acceptanceGaps: critic.acceptanceGaps,
        iteration,
        reopenProposals: proposals,
      },
      phase: definition.phase,
      signal: options.abortSignal,
    });
    if (proposals.length === 0) {
      return current;
    }

    const acceptedIds: string[] = [];
    for (const proposal of proposals) {
      const admitted = await admitReopen(
        ctx,
        current,
        proposal,
        iteration,
        definition.phase,
        options.abortSignal,
      );
      if (admitted === null) {
        continue;
      }

      current = admitted.snapshot;
      acceptedIds.push(proposal.nodeId);
      await ctx.store.writeSnapshot(current, { signal: options.abortSignal });
      await appendReopenRecord(
        ctx,
        current,
        proposal,
        iteration,
        admitted.reopenAttempts,
        definition.phase,
        options.abortSignal,
      );
      await ctx.appendEvent(current.runId, "node_reopened", {
        message: `Node reopened by final critic: ${proposal.nodeId}`,
        nodeId: proposal.nodeId,
        payload: {
          iteration,
          reason: proposal.reason,
          reopenAttempts: admitted.reopenAttempts,
          severity: proposal.severity,
        },
        phase: definition.phase,
        signal: options.abortSignal,
      });
    }

    if (acceptedIds.length === 0) {
      return current;
    }

    const reason = `Final critic reopened node(s): ${acceptedIds.join(", ")}`;
    current = resetPhase(ctx, current, executionDefinition.phase, reason);
    current = resetPhase(ctx, current, definition.phase, reason);
    await ctx.store.writeSnapshot(current, { signal: options.abortSignal });
    await ctx.appendGraphStatus(current, executionDefinition.phase, "pending", options.abortSignal);
    await ctx.appendGraphStatus(current, definition.phase, "pending", options.abortSignal);
    current = await runScheduledPhase(ctx, current, executionDefinition, options);
    iteration += 1;
  }

  const error = "Final critic iteration limit reached.";
  current = ctx.updatePhase(current, definition.phase, {
    completedAt: ctx.timestamp(),
    error,
    status: "failed",
  });
  await ctx.store.writeSnapshot(current, { signal: options.abortSignal });
  await ctx.appendGraphStatus(current, definition.phase, "failed", options.abortSignal);
  await ctx.appendEvent(current.runId, "critic_iteration_limit_reached", {
    message: error,
    payload: { maxIterations: current.strategy.finalCritic.maxIterations },
    phase: definition.phase,
    signal: options.abortSignal,
  });
  return current;
}
