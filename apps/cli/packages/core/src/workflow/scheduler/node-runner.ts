import {
  createChildTraceContext,
  type WorkflowActivitySnapshot,
  type WorkflowGraphNode,
} from "@knorvia/contracts";
import { WorkflowSchedulerEventLog } from "./events.js";
import { addArtifact, compactWorkflowPayload, updateGraphNode, upsertActivity } from "./graph.js";
import { buildDefaultNodePrompt, safeArtifactName } from "./prompts.js";
import type {
  NodeRunOutcome,
  NodeRunStarted,
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerRunOptions,
  WorkflowGraphSchedulerSnapshotAccess,
  WorkflowSchedulerNodePromise,
} from "./types.js";

export interface WorkflowNodeRunnerRuntime {
  createActivityId: () => string;
  eventLog: WorkflowSchedulerEventLog;
  runner: WorkflowGraphSchedulerDeps["runner"];
  writeArtifact: WorkflowGraphSchedulerDeps["writeArtifact"];
  writeSnapshot: WorkflowGraphSchedulerDeps["writeSnapshot"];
}

export function runWorkflowNode(
  snapshotAccess: WorkflowGraphSchedulerSnapshotAccess,
  node: WorkflowGraphNode,
  options: WorkflowGraphSchedulerRunOptions,
  maxAttempts: number,
  runtime: WorkflowNodeRunnerRuntime,
): WorkflowSchedulerNodePromise {
  let resolveStarted!: (value: NodeRunStarted) => void;
  const started = new Promise<NodeRunStarted>((resolve) => {
    resolveStarted = resolve;
  });
  const outcome = execute() as WorkflowSchedulerNodePromise;
  outcome.started = started;
  return outcome;

  async function execute(): Promise<NodeRunOutcome> {
    const initialSnapshot = snapshotAccess.getSnapshot();
    const activityId = runtime.createActivityId();
    const startedAt = runtime.eventLog.timestamp();
    const inputArtifactPaths = initialSnapshot.artifacts.map((artifact) => artifact.path);
    const parentTraceContext = options.traceContext;
    const traceContext = parentTraceContext
      ? createChildTraceContext(parentTraceContext, {
          attributes: {
            workflowActivityId: activityId,
            workflowKind: initialSnapshot.kind,
            workflowNodeId: node.id,
            workflowPhase: options.phase,
            workflowRunId: initialSnapshot.runId,
          },
          sessionId: parentTraceContext.sessionId,
        })
      : undefined;
    const activeGraph = updateGraphNode(initialSnapshot, node.id, {
      error: undefined,
      status: "active",
    });
    const activeActivity: WorkflowActivitySnapshot = {
      activityId,
      inputArtifactPaths,
      kind: "agent_session",
      nodeId: node.id,
      outputArtifactPaths: [],
      parentSessionId: options.parentSessionId,
      phase: options.phase,
      startedAt,
      status: "active",
      traceId: traceContext?.traceId,
    };
    const activeSnapshot = upsertActivity(
      activeGraph,
      activeActivity,
      runtime.eventLog.timestamp(),
    );
    await runtime.writeSnapshot(activeSnapshot, {
      signal: options.abortSignal,
    });
    snapshotAccess.setSnapshot(activeSnapshot);
    await runtime.eventLog.appendGraphStatus(
      activeSnapshot,
      node.id,
      options.phase,
      "active",
      options.abortSignal,
    );
    await runtime.eventLog.emitEvent(activeSnapshot, "node_started", {
      message: `Node started: ${node.title}`,
      nodeId: node.id,
      phase: options.phase,
      signal: options.abortSignal,
    });
    resolveStarted({ snapshot: activeSnapshot });

    try {
      const request: WorkflowGraphSchedulerActivityInput = {
        abortSignal: options.abortSignal,
        activityId,
        cwd: options.cwd,
        node,
        onChildSessionStarted: async (event) => {
          const currentSnapshot = snapshotAccess.getSnapshot();
          const linkedActivity = currentSnapshot.activities.find(
            (activity) => activity.activityId === activityId,
          );
          if (!linkedActivity || linkedActivity.status !== "active") {
            return;
          }
          const activity: WorkflowActivitySnapshot = {
            ...linkedActivity,
            ...(event.model ? { model: event.model } : {}),
            sessionId: event.sessionId,
            traceId: event.traceId ?? linkedActivity.traceId,
            turnId: event.turnId ?? linkedActivity.turnId,
          };
          const childSnapshot = upsertActivity(
            currentSnapshot,
            activity,
            runtime.eventLog.timestamp(),
          );
          await runtime.writeSnapshot(childSnapshot, {
            signal: options.abortSignal,
          });
          snapshotAccess.setSnapshot(childSnapshot);
          await runtime.eventLog.emitEvent(childSnapshot, "workflow_session_linked", {
            message: `Workflow session linked: ${event.sessionId}`,
            nodeId: node.id,
            payload: compactWorkflowPayload({
              activityId,
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
        prompt: options.buildPrompt
          ? options.buildPrompt({
              node,
              phase: options.phase,
              snapshot: activeSnapshot,
            })
          : buildDefaultNodePrompt(activeSnapshot, node, options.phase),
        runId: activeSnapshot.runId,
        task: activeSnapshot.task,
        traceContext,
      };
      const result = await runtime.runner.run(request);
      const artifact = await runtime.writeArtifact(
        activeSnapshot.runId,
        `${options.artifactDirectory ?? "artifacts/exec"}/${safeArtifactName(node.id)}.md`,
        result.response,
        { signal: options.abortSignal },
      );
      const currentSnapshot = snapshotAccess.getSnapshot();
      const completedGraph = updateGraphNode(currentSnapshot, node.id, {
        attempts: node.attempts,
        error: undefined,
        status: "completed",
      });
      const completedActivity: WorkflowActivitySnapshot = {
        activityId,
        artifactPath: artifact.relativePath,
        completedAt: runtime.eventLog.timestamp(),
        inputArtifactPaths,
        kind: "agent_session",
        nodeId: node.id,
        outputArtifactPaths: [artifact.relativePath],
        parentSessionId: options.parentSessionId,
        phase: options.phase,
        ...(result.model ? { model: result.model } : {}),
        sessionId: result.sessionId,
        startedAt,
        status: "completed",
        traceId: result.traceId ?? traceContext?.traceId,
        turnId: result.turnId,
      };
      const completedActivities = upsertActivity(
        completedGraph,
        completedActivity,
        runtime.eventLog.timestamp(),
      );
      const artifactRecord = {
        contentType: "text/markdown",
        createdAt: runtime.eventLog.timestamp(),
        label: node.title,
        path: artifact.relativePath,
        phase: options.phase,
      };
      const completedSnapshot = addArtifact(
        completedActivities,
        artifactRecord,
        runtime.eventLog.timestamp(),
      );
      await runtime.writeSnapshot(completedSnapshot, {
        signal: options.abortSignal,
      });
      snapshotAccess.setSnapshot(completedSnapshot);
      await runtime.eventLog.appendGraphStatus(
        completedSnapshot,
        node.id,
        options.phase,
        "completed",
        options.abortSignal,
      );
      await runtime.eventLog.emitEvent(completedSnapshot, "artifact_written", {
        message: `Artifact written: ${artifact.relativePath}`,
        nodeId: node.id,
        phase: options.phase,
        signal: options.abortSignal,
      });
      await runtime.eventLog.emitEvent(completedSnapshot, "node_completed", {
        message: `Node completed: ${node.title}`,
        nodeId: node.id,
        phase: options.phase,
        signal: options.abortSignal,
      });
      return { nodeId: node.id, ok: true, snapshot: completedSnapshot };
    } catch (error) {
      if (options.abortSignal?.aborted) {
        throw error;
      }
      const attempts = (node.attempts ?? 0) + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const status = attempts >= maxAttempts ? "failed" : "pending";
      const currentSnapshot = snapshotAccess.getSnapshot();
      const linkedActivity = currentSnapshot.activities.find(
        (activity) => activity.activityId === activityId,
      );
      const failedGraph = updateGraphNode(currentSnapshot, node.id, {
        attempts,
        error: errorMessage,
        status,
      });
      const failedActivity: WorkflowActivitySnapshot = {
        activityId,
        completedAt: runtime.eventLog.timestamp(),
        error: errorMessage,
        inputArtifactPaths,
        kind: "agent_session",
        ...(linkedActivity?.model ? { model: linkedActivity.model } : {}),
        nodeId: node.id,
        outputArtifactPaths: [],
        parentSessionId: options.parentSessionId,
        phase: options.phase,
        ...(linkedActivity?.sessionId ? { sessionId: linkedActivity.sessionId } : {}),
        startedAt,
        status,
        traceId: linkedActivity?.traceId ?? traceContext?.traceId,
        ...(linkedActivity?.turnId ? { turnId: linkedActivity.turnId } : {}),
      };
      const failedSnapshot = upsertActivity(
        failedGraph,
        failedActivity,
        runtime.eventLog.timestamp(),
      );
      await runtime.writeSnapshot(failedSnapshot, {
        signal: options.abortSignal,
      });
      snapshotAccess.setSnapshot(failedSnapshot);
      await runtime.eventLog.appendGraphStatus(
        failedSnapshot,
        node.id,
        options.phase,
        status,
        options.abortSignal,
      );
      await runtime.eventLog.emitEvent(failedSnapshot, "node_failed", {
        message: errorMessage,
        nodeId: node.id,
        payload: { attempts, retry: status === "pending" },
        phase: options.phase,
        signal: options.abortSignal,
      });
      return { nodeId: node.id, ok: false, snapshot: failedSnapshot };
    }
  }
}
