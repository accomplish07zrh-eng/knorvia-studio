import { cancelWorkflowSnapshot } from "../lifecycle.js";
import { runFinalCriticLoop } from "./critic-loop.js";
import {
  latestWorkflowActivity,
  workflowFailureFromError,
  workflowRecoveryActions,
} from "./failures.js";
import { formatExpertWorkflowCompletion, formatExpertWorkflowStatus } from "./formatters.js";
import {
  seedGraphFromPhaseArtifact,
  updateNodePromptsFromPhaseArtifact,
} from "./graph-artifacts.js";
import { compactWorkflowPayload, lifecyclePayload } from "./runtime-context.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import { runPhase } from "./phase-runner.js";
import { buildReport } from "./prompts.js";
import { runScheduledPhase } from "./scheduled-phase.js";
import type { ExpertWorkflowCommandResult, ExpertWorkflowRunOptions } from "./types.js";
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";

async function completeRun(
  ctx: ExpertWorkflowRuntimeContext,
  current: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot> {
  const report = buildReport(current);
  const written = await ctx.store.writeReport(current.runId, report, {
    signal,
  });
  const phaseProjection = ctx.updatePhase(current, definition.phase, {
    artifactPath: written.relativePath,
    completedAt: ctx.timestamp(),
    startedAt: ctx.timestamp(),
    status: "completed",
  });
  // 写入端返回的路径在投影时仍可变化；保留逐次读取和方法求值顺序。
  const result = ctx.addArtifact(
    ctx.updateSnapshot(phaseProjection, {
      completedAt: ctx.timestamp(),
      reportPath: written.relativePath,
      status: "completed",
    }),
    {
      contentType: "text/markdown",
      createdAt: ctx.timestamp(),
      label: "Report",
      path: written.relativePath,
      phase: definition.phase,
    },
  );
  await ctx.store.writeSnapshot(result, { signal });
  await ctx.appendGraphStatus(result, definition.phase, "completed", signal);
  await ctx.appendEvent(result.runId, "run_completed", {
    message: `${ctx.definition.title} completed.`,
    signal,
  });
  return result;
}

export async function continueRun(
  ctx: ExpertWorkflowRuntimeContext,
  initialSnapshot: ExpertWorkflowRunSnapshot,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowCommandResult> {
  let current = ctx.updateSnapshot(initialSnapshot, {
    startedAt: initialSnapshot.startedAt ?? ctx.timestamp(),
    status: "running",
  });

  try {
    for (const phaseId of ctx.definition.phaseOrder) {
      const definition = ctx.getPhaseDefinition(phaseId);
      if (definition.behavior === "complete") {
        current = await completeRun(ctx, current, definition, options.abortSignal);
        break;
      }

      const phase = current.phases.find((candidate) => candidate.phase === definition.phase);
      if (phase?.status === "completed") {
        continue;
      }

      switch (definition.behavior) {
        case "scheduled_graph":
          current = await runScheduledPhase(ctx, current, definition, options);
          break;
        case "critic":
          current = await runFinalCriticLoop(ctx, current, definition, options);
          break;
        case "agent": {
          const result = await runPhase(ctx, current, definition, options);
          current = result.snapshot;
          current = await seedGraphFromPhaseArtifact(
            ctx,
            current,
            definition,
            result.response,
            options.abortSignal,
          );
          current = await updateNodePromptsFromPhaseArtifact(
            ctx,
            current,
            definition,
            result.response,
            options.abortSignal,
          );
          break;
        }
      }
    }

    return {
      reportPath: current.reportPath,
      response: formatExpertWorkflowCompletion(current),
      runId: current.runId,
      snapshot: current,
      status: current.status,
      traceId: current.traceId,
    };
  } catch (error) {
    const loaded =
      (await ctx.store.readRun(
        current.runId,
        options.abortSignal?.aborted ? undefined : { signal: options.abortSignal },
      )) ?? current;
    const message = error instanceof Error ? error.message : String(error);

    if (options.abortSignal?.aborted) {
      let chosenSnapshot = loaded;
      if (loaded.status !== "cancelled") {
        const repair = cancelWorkflowSnapshot(loaded, {
          reason: message,
          timestamp: ctx.timestamp(),
        });
        await ctx.store.writeSnapshot(repair.snapshot);
        await ctx.appendLifecycleGraphChanges(repair.snapshot, repair.nodeChanges);
        await ctx.appendEvent(repair.snapshot.runId, "run_cancelled", {
          message,
          payload: lifecyclePayload(repair),
        });
        chosenSnapshot = repair.snapshot;
      }
      return {
        response: formatExpertWorkflowStatus(chosenSnapshot),
        runId: chosenSnapshot.runId,
        snapshot: chosenSnapshot,
        status: chosenSnapshot.status,
        traceId: chosenSnapshot.traceId,
      };
    }

    const activity = latestWorkflowActivity(loaded);
    const failure = workflowFailureFromError(error, message, activity);
    const paused = ctx.updateSnapshot(loaded, {
      failure,
      pauseReason: failure.message,
      recoveryActions: workflowRecoveryActions(failure),
      status: "paused",
    });
    await ctx.store.writeSnapshot(paused, { signal: options.abortSignal });
    await ctx.appendEvent(paused.runId, "workflow_paused", {
      message,
      payload: compactWorkflowPayload({
        failureKind: paused.failure?.kind,
        retryable: paused.failure?.retryable,
      }),
      phase: paused.currentPhase,
      signal: options.abortSignal,
    });
    return {
      response: `${formatExpertWorkflowStatus(paused)}\n\nPaused: ${message}`,
      runId: paused.runId,
      snapshot: paused,
      status: paused.status,
      traceId: paused.traceId,
    };
  }
}
