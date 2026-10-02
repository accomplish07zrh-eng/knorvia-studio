import {
  createChildTraceContext,
  type TraceContext,
  type WorkflowActivitySnapshot,
  type WorkflowGraphCollection,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { admitCollection } from "./collection-planner-admission.js";
import { emitExpansionEvents, exhaustCollection } from "./collection-events.js";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import {
  addArtifact,
  collectionFrontier,
  compactWorkflowPayload,
  graphCollections,
  normalizeCollection,
  updateGraphCollection,
  upsertActivity,
} from "./graph.js";
import { applyPlannerExpansion } from "./planner-expansion.js";
import { buildDefaultPlannerPrompt, safeArtifactName } from "./prompts.js";
import type {
  SchedulerCollection,
  WorkflowGraphSchedulerChildSessionStartedEvent,
  WorkflowGraphSchedulerPlannerRunResult,
  WorkflowGraphSchedulerRunOptions,
} from "./types.js";

interface PlannerAttempt {
  activityId: string;
  collection: SchedulerCollection;
  origin: SchedulerCollection;
  runs: number;
  inputPaths: string[];
  snapshot: WorkflowRunSnapshot;
  startedAt: string;
  trace?: TraceContext;
}

export async function checkCollectionPlanners(
  snapshot: WorkflowRunSnapshot,
  executableNodeIds: Set<string>,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): Promise<{ addedNodeIds: string[]; plannersRan: number; snapshot: WorkflowRunSnapshot }> {
  if (!runtime.plannerRunner) return { addedNodeIds: [], plannersRan: 0, snapshot };
  const collections = graphCollections(snapshot.graph);
  const addedNodeIds: string[] = [];
  let plannersRan = 0;
  for (const collection of collections) {
    if (options.abortSignal?.aborted) {
      throw options.abortSignal.reason instanceof Error
        ? options.abortSignal.reason
        : new Error("Workflow scheduler aborted");
    }
    const admission = admitCollection(snapshot, collection, executableNodeIds, options, runtime);
    snapshot = admission.snapshot;
    if (admission.action === "skip") continue;
    if (admission.action === "exhaust") {
      snapshot = await exhaustCollection(snapshot, admission.collection, options, runtime, {
        reason: admission.reason,
      });
    } else {
      const result = await attemptPlanner(
        snapshot,
        admission.collection,
        admission.unseen,
        options,
        runtime,
      );
      snapshot = result.snapshot;
      for (const nodeId of result.addedNodeIds) addedNodeIds.push(nodeId);
      plannersRan++;
    }
  }
  return { addedNodeIds, plannersRan, snapshot };
}

function activateAttempt(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): PlannerAttempt {
  const activityId = runtime.createActivityId();
  const startedAt = runtime.eventLog.timestamp();
  const plannerRuns = (collection.plannerRuns ?? 0) + 1;
  const inputPaths = snapshot.artifacts.map((artifact) => artifact.path);
  const trace = options.traceContext
    ? createChildTraceContext(options.traceContext, {
        attributes: {
          workflowActivityId: activityId,
          workflowCollectionId: collection.collectionId,
          workflowKind: snapshot.kind,
          workflowPhase: options.phase,
          workflowRunId: snapshot.runId,
        },
        sessionId: options.traceContext.sessionId,
      })
    : undefined;
  const activeCollection = normalizeCollection({
    ...collection,
    plannerRuns,
    status: "active" as const,
  });
  const activated = updateGraphCollection(
    snapshot,
    collection.collectionId,
    activeCollection,
    runtime.eventLog.timestamp(),
  );
  const activity: WorkflowActivitySnapshot = {
    activityId,
    inputArtifactPaths: inputPaths,
    kind: "planner_agent",
    outputArtifactPaths: [],
    parentSessionId: options.parentSessionId,
    phase: options.phase,
    startedAt,
    status: "active",
    traceId: trace?.traceId,
  };
  return {
    activityId,
    collection: activeCollection,
    origin: collection,
    runs: plannerRuns,
    inputPaths,
    snapshot: upsertActivity(activated, activity, runtime.eventLog.timestamp()),
    startedAt,
    trace,
  };
}

function linkAttempt(
  attempt: PlannerAttempt,
  event: WorkflowGraphSchedulerChildSessionStartedEvent,
  runtime: WorkflowCollectionPlannerRuntime,
): boolean {
  const activity = attempt.snapshot.activities.find(
    (item) => item.activityId === attempt.activityId,
  );
  if (!activity || activity.status !== "active") return false;
  const linked = { ...activity };
  if (event.model) linked.model = event.model;
  linked.sessionId = event.sessionId;
  linked.traceId = event.traceId ?? activity.traceId;
  linked.turnId = event.turnId ?? activity.turnId;
  attempt.snapshot = upsertActivity(attempt.snapshot, linked, runtime.eventLog.timestamp());
  return true;
}

function completeAttempt(
  attempt: PlannerAttempt,
  result: WorkflowGraphSchedulerPlannerRunResult,
  artifact: { relativePath: string },
  unseen: readonly string[],
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
) {
  const expansion = applyPlannerExpansion(
    attempt.snapshot,
    attempt.collection,
    result,
    unseen,
    runtime.eventLog.timestamp(),
  );
  const withArtifact = addArtifact(
    expansion.snapshot,
    {
      contentType: "text/markdown",
      createdAt: runtime.eventLog.timestamp(),
      label: `Planner ${attempt.origin.collectionId}`,
      path: artifact.relativePath,
      phase: options.phase,
    },
    runtime.eventLog.timestamp(),
  );
  const activity: WorkflowActivitySnapshot = {
    activityId: attempt.activityId,
    artifactPath: artifact.relativePath,
    completedAt: runtime.eventLog.timestamp(),
    inputArtifactPaths: attempt.inputPaths,
    kind: "planner_agent",
    outputArtifactPaths: [artifact.relativePath],
    parentSessionId: options.parentSessionId,
    phase: options.phase,
    ...(result.model ? { model: result.model } : {}),
    sessionId: result.sessionId,
    startedAt: attempt.startedAt,
    status: "completed",
    traceId: result.traceId ?? attempt.trace?.traceId,
    turnId: result.turnId,
  };
  return {
    expansion,
    snapshot: upsertActivity(withArtifact, activity, runtime.eventLog.timestamp()),
  };
}

function failAttempt(
  attempt: PlannerAttempt,
  error: unknown,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
) {
  const message = error instanceof Error ? error.message : String(error);
  const errorCount = (attempt.collection.errorCount ?? 0) + 1;
  const linked = attempt.snapshot.activities.find((item) => item.activityId === attempt.activityId);
  const exhausted = errorCount >= attempt.snapshot.strategy.executor.maxConsecutiveErrors;
  const collection: WorkflowGraphCollection = {
    ...attempt.collection,
    errorCount,
    exhausted,
    status: exhausted ? "exhausted" : "draining",
  };
  const failed = updateGraphCollection(
    attempt.snapshot,
    attempt.origin.collectionId,
    collection,
    runtime.eventLog.timestamp(),
  );
  const activity: WorkflowActivitySnapshot = {
    activityId: attempt.activityId,
    completedAt: runtime.eventLog.timestamp(),
    error: message,
    inputArtifactPaths: attempt.inputPaths,
    kind: "planner_agent",
    ...(linked?.model ? { model: linked.model } : {}),
    outputArtifactPaths: [],
    parentSessionId: options.parentSessionId,
    phase: options.phase,
    ...(linked?.sessionId ? { sessionId: linked.sessionId } : {}),
    startedAt: attempt.startedAt,
    status: "failed",
    traceId: linked?.traceId ?? attempt.trace?.traceId,
    ...(linked?.turnId ? { turnId: linked.turnId } : {}),
  };
  return {
    collection,
    message,
    snapshot: upsertActivity(failed, activity, runtime.eventLog.timestamp()),
  };
}

// The cursor tracks child links. Completion/failure views deliberately do not close it.
async function attemptPlanner(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  unseen: readonly string[],
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): Promise<{ addedNodeIds: string[]; snapshot: WorkflowRunSnapshot }> {
  if (!runtime.plannerRunner) return { addedNodeIds: [], snapshot };
  const attempt = activateAttempt(snapshot, collection, options, runtime);
  const active = attempt.snapshot;
  await runtime.writeSnapshot(active, { signal: options.abortSignal });
  await runtime.eventLog.appendCollectionRecord(active, attempt.collection, options.abortSignal);
  await runtime.eventLog.emitEvent(active, "planner_started", {
    message: `Planner started for collection: ${collection.collectionId}`,
    payload: {
      collectionId: collection.collectionId,
      frontier: collectionFrontier(active.graph, attempt.collection),
      plannerRuns: attempt.runs,
      unseenCompletions: unseen,
    },
    phase: options.phase,
    signal: options.abortSignal,
  });
  let failure: unknown;
  try {
    const result = await runtime.plannerRunner.run({
      abortSignal: options.abortSignal,
      activityId: attempt.activityId,
      collection: attempt.collection,
      cwd: options.cwd,
      graph: active.graph,
      onChildSessionStarted: async (event) => {
        if (!linkAttempt(attempt, event, runtime)) return;
        await runtime.writeSnapshot(attempt.snapshot, { signal: options.abortSignal });
        await runtime.eventLog.emitEvent(attempt.snapshot, "workflow_session_linked", {
          message: `Workflow session linked: ${event.sessionId}`,
          payload: compactWorkflowPayload({
            activityId: attempt.activityId,
            collectionId: collection.collectionId,
            model: event.model,
            sessionId: event.sessionId,
            traceId: event.traceId,
            turnId: event.turnId,
          }),
          phase: options.phase,
          signal: options.abortSignal,
        });
      },
      onEvent: options.onEvent,
      parentSessionId: options.parentSessionId,
      phase: options.phase,
      prompt: buildDefaultPlannerPrompt(active, attempt.collection, options.phase),
      runId: attempt.snapshot.runId,
      snapshot: attempt.snapshot,
      task: attempt.snapshot.task,
      traceContext: attempt.trace,
    });
    const artifact = await runtime.writeArtifact(
      attempt.snapshot.runId,
      `${options.artifactDirectory ?? "artifacts/exec"}/planners/${safeArtifactName(collection.collectionId)}-${attempt.runs}.md`,
      result.response,
      { signal: options.abortSignal },
    );
    const completed = completeAttempt(attempt, result, artifact, unseen, options, runtime);
    await runtime.writeSnapshot(completed.snapshot, { signal: options.abortSignal });
    await runtime.eventLog.appendExpansionRecords(
      completed.snapshot,
      completed.expansion,
      options.phase,
      options.abortSignal,
    );
    await runtime.eventLog.emitEvent(completed.snapshot, "planner_completed", {
      message: `Planner completed for collection: ${collection.collectionId}`,
      payload: {
        collectionId: collection.collectionId,
        edgeCount: completed.expansion.addedEdges.length,
        nodeCount: completed.expansion.addedNodes.length,
      },
      phase: options.phase,
      signal: options.abortSignal,
    });
    await emitExpansionEvents(
      completed.snapshot,
      completed.expansion,
      collection.collectionId,
      options,
      runtime,
    );
    return {
      addedNodeIds: completed.expansion.addedNodes.map((node) => node.id),
      snapshot: completed.snapshot,
    };
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    failure = error;
  }
  const failed = failAttempt(attempt, failure, options, runtime);
  await runtime.writeSnapshot(failed.snapshot, { signal: options.abortSignal });
  await runtime.eventLog.appendCollectionRecord(
    failed.snapshot,
    failed.collection,
    options.abortSignal,
  );
  await runtime.eventLog.emitEvent(failed.snapshot, "planner_failed", {
    message: failed.message,
    payload: {
      collectionId: collection.collectionId,
      errorCount: failed.collection.errorCount,
      exhausted: failed.collection.exhausted,
    },
    phase: options.phase,
    signal: options.abortSignal,
  });
  if (failed.collection.exhausted) {
    await runtime.eventLog.emitEvent(failed.snapshot, "collection_exhausted", {
      message: `Collection exhausted: ${collection.collectionId}`,
      payload: { collectionId: collection.collectionId, reason: "planner_error_threshold" },
      phase: options.phase,
      signal: options.abortSignal,
    });
  }
  return { addedNodeIds: [], snapshot: failed.snapshot };
}
