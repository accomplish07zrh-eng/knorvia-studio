import { createChildTraceContext, type WorkflowPhaseDefinition } from "@knorvia/contracts";
import { phaseNodeId } from "./ids.js";
import { buildPhasePrompt } from "./prompts.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertPhaseRunResult, ExpertWorkflowRunOptions } from "./types.js";
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";

export async function runPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertPhaseRunResult> {
  const activityId = ctx.createActivityId();
  const inputArtifactPaths = snapshot.artifacts.map((artifact) => artifact.path);
  const traceContext = options.traceContext
    ? createChildTraceContext(options.traceContext, {
        attributes: {
          workflowActivityId: activityId,
          workflowKind: ctx.definition.kind,
          workflowPhase: definition.phase,
          workflowRunId: snapshot.runId,
        },
        sessionId: options.traceContext.sessionId,
      })
    : undefined;

  const activation = ctx.updatePhase(snapshot, definition.phase, {
    activityId,
    error: undefined,
    startedAt: ctx.timestamp(),
    status: "active",
    traceId: traceContext?.traceId,
  });
  const activeSnapshot = ctx.upsertActivity(activation, {
    activityId,
    inputArtifactPaths,
    kind: "agent_session",
    nodeId: phaseNodeId(definition.phase),
    outputArtifactPaths: [],
    parentSessionId: activation.sessionId,
    phase: definition.phase,
    startedAt: ctx.timestamp(),
    status: "active",
    traceId: traceContext?.traceId,
  });

  await ctx.store.writeSnapshot(activeSnapshot, { signal: options.abortSignal });
  await ctx.appendGraphStatus(activation, definition.phase, "active", options.abortSignal);
  await ctx.appendEvent(activation.runId, "phase_started", {
    message: `${definition.title} started.`,
    phase: definition.phase,
    signal: options.abortSignal,
  });

  let cursor = activeSnapshot;
  try {
    const result = await ctx.agentRunner.run({
      abortSignal: options.abortSignal,
      activityId,
      cwd: options.cwd,
      onChildSessionStarted: async (event) => {
        const current = cursor.activities.find((activity) => activity.activityId === activityId);
        if (!current || current.status !== "active") {
          return;
        }

        const linkedPhase = ctx.updatePhase(cursor, definition.phase, {
          sessionId: event.sessionId,
          traceId: event.traceId ?? current.traceId,
          turnId: event.turnId ?? current.turnId,
        });
        cursor = ctx.upsertActivity(linkedPhase, {
          ...current,
          ...(event.model ? { model: event.model } : {}),
          sessionId: event.sessionId,
          traceId: event.traceId ?? current.traceId,
          turnId: event.turnId ?? current.turnId,
        });
        await ctx.store.writeSnapshot(cursor, { signal: options.abortSignal });
        await ctx.appendEvent(cursor.runId, "workflow_session_linked", {
          message: `Workflow session linked: ${event.sessionId}`,
          nodeId: phaseNodeId(definition.phase),
          payload: {
            activityId,
            ...(event.model ? { model: event.model } : {}),
            sessionId: event.sessionId,
            ...(event.traceId ? { traceId: event.traceId } : {}),
            ...(event.turnId ? { turnId: event.turnId } : {}),
          },
          phase: definition.phase,
          signal: options.abortSignal,
        });
      },
      onEvent: options.onEvent,
      parentSessionId: activation.sessionId,
      phase: definition.phase,
      prompt: buildPhasePrompt(cursor, definition),
      runId: activation.runId,
      task: activation.task,
      traceContext,
      workflowKind: ctx.definition.kind,
    });

    const artifactPath = definition.artifactPath ?? `artifacts/${definition.phase}.md`;
    const artifact = await ctx.store.writeArtifact(
      activation.runId,
      artifactPath,
      result.response,
      { signal: options.abortSignal },
    );
    const completedPhase = ctx.updatePhase(cursor, definition.phase, {
      activityId,
      artifactPath: artifact.relativePath,
      completedAt: ctx.timestamp(),
      sessionId: result.sessionId,
      status: "completed",
      traceId: result.traceId ?? traceContext?.traceId,
      turnId: result.turnId,
    });
    const completedActivity = ctx.upsertActivity(completedPhase, {
      activityId,
      artifactPath: artifact.relativePath,
      completedAt: ctx.timestamp(),
      inputArtifactPaths,
      kind: "agent_session",
      ...(result.model ? { model: result.model } : {}),
      nodeId: phaseNodeId(definition.phase),
      outputArtifactPaths: [artifact.relativePath],
      parentSessionId: activation.sessionId,
      phase: definition.phase,
      sessionId: result.sessionId,
      startedAt:
        cursor.activities.find((activity) => activity.activityId === activityId)?.startedAt ??
        ctx.timestamp(),
      status: "completed",
      traceId: result.traceId ?? traceContext?.traceId,
      turnId: result.turnId,
    });
    const completedSnapshot = ctx.addArtifact(completedActivity, {
      contentType: "text/markdown",
      createdAt: ctx.timestamp(),
      label: definition.title,
      path: artifact.relativePath,
      phase: definition.phase,
    });

    await ctx.store.writeSnapshot(completedSnapshot, {
      signal: options.abortSignal,
    });
    await ctx.appendGraphStatus(
      completedSnapshot,
      definition.phase,
      "completed",
      options.abortSignal,
    );
    await ctx.appendEvent(completedSnapshot.runId, "artifact_written", {
      message: `Artifact written: ${artifact.relativePath}`,
      phase: definition.phase,
      signal: options.abortSignal,
    });
    await ctx.appendEvent(completedSnapshot.runId, "phase_completed", {
      message: `${definition.title} completed.`,
      phase: definition.phase,
      signal: options.abortSignal,
    });
    return { response: result.response, snapshot: completedSnapshot };
  } catch (error) {
    if (options.abortSignal?.aborted) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const currentActivity = cursor.activities.find(
      (activity) => activity.activityId === activityId,
    );
    const failedPhase = ctx.updatePhase(cursor, definition.phase, {
      activityId,
      completedAt: ctx.timestamp(),
      error: errorMessage,
      status: "failed",
    });
    const failedSnapshot = ctx.upsertActivity(failedPhase, {
      activityId,
      completedAt: ctx.timestamp(),
      error: errorMessage,
      inputArtifactPaths,
      kind: "agent_session",
      ...(currentActivity?.model ? { model: currentActivity.model } : {}),
      nodeId: phaseNodeId(definition.phase),
      outputArtifactPaths: [],
      parentSessionId: activation.sessionId,
      phase: definition.phase,
      ...(currentActivity?.sessionId ? { sessionId: currentActivity.sessionId } : {}),
      startedAt: currentActivity?.startedAt ?? ctx.timestamp(),
      status: "failed",
      traceId: currentActivity?.traceId ?? traceContext?.traceId,
      ...(currentActivity?.turnId ? { turnId: currentActivity.turnId } : {}),
    });

    await ctx.store.writeSnapshot(failedSnapshot, { signal: options.abortSignal });
    await ctx.appendGraphStatus(failedSnapshot, definition.phase, "failed", options.abortSignal);
    await ctx.appendEvent(failedSnapshot.runId, "phase_failed", {
      message: errorMessage,
      phase: definition.phase,
      signal: options.abortSignal,
    });
    throw error;
  }
}
