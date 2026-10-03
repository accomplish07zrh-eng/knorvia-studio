import { createChildTraceContext, type WorkflowGraphNode } from "@knorvia/contracts";
import { WorkflowSchedulerEventLog } from "./events.js";
import { compactWorkflowPayload, updateGraphNode, upsertActivity } from "./graph.js";
import {
  completionPublication,
  failurePublication,
  type NodePublication,
} from "./node-runner-outcome.js";
import { buildDefaultNodePrompt, safeArtifactName } from "./prompts.js";
import type {
  NodeRunStarted,
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
  let resolveStarted: (value: NodeRunStarted) => void = () => {};
  const started = new Promise<NodeRunStarted>((resolve) => {
    resolveStarted = resolve;
  });
  const promise = (async () => {
    const initialSnapshot = snapshotAccess.getSnapshot();
    const activityId = runtime.createActivityId();
    const startedAt = runtime.eventLog.timestamp();
    const inputArtifactPaths = initialSnapshot.artifacts.map((artifact) => artifact.path);
    const traceContext = options.traceContext
      ? createChildTraceContext(options.traceContext, {
          attributes: {
            workflowActivityId: activityId,
            workflowKind: initialSnapshot.kind,
            workflowNodeId: node.id,
            workflowPhase: options.phase,
            workflowRunId: initialSnapshot.runId,
          },
          sessionId: options.traceContext.sessionId,
        })
      : undefined;
    const activeSnapshot = upsertActivity(
      updateGraphNode(initialSnapshot, node.id, {
        error: undefined,
        status: "active",
      }),
      {
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
      },
      runtime.eventLog.timestamp(),
    );
    await runtime.writeSnapshot(activeSnapshot, { signal: options.abortSignal });
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

    const outcomeInput = {
      activityId,
      clock: () => runtime.eventLog.timestamp(),
      current: () => snapshotAccess.getSnapshot(),
      inputArtifactPaths,
      node,
      options,
      startedAt,
      traceContext,
    };
    const failed = (error: unknown): NodePublication => {
      if (options.abortSignal?.aborted) throw error;
      return failurePublication(outcomeInput, error, maxAttempts);
    };
    let publication: NodePublication;

    try {
      const result = await runtime.runner.run({
        abortSignal: options.abortSignal,
        activityId,
        cwd: options.cwd,
        node,
        onChildSessionStarted: async (event) => {
          const latestSnapshot = snapshotAccess.getSnapshot();
          const currentActivity = latestSnapshot.activities.find(
            (activity) => activity.activityId === activityId,
          );
          if (!currentActivity || currentActivity.status !== "active") return;
          const childStartedSnapshot = upsertActivity(
            latestSnapshot,
            {
              ...currentActivity,
              ...(event.model ? { model: event.model } : {}),
              sessionId: event.sessionId,
              traceId: event.traceId ?? currentActivity.traceId,
              turnId: event.turnId ?? currentActivity.turnId,
            },
            runtime.eventLog.timestamp(),
          );
          await runtime.writeSnapshot(childStartedSnapshot, { signal: options.abortSignal });
          snapshotAccess.setSnapshot(childStartedSnapshot);
          await runtime.eventLog.emitEvent(childStartedSnapshot, "workflow_session_linked", {
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
          ? options.buildPrompt({ node, phase: options.phase, snapshot: activeSnapshot })
          : buildDefaultNodePrompt(activeSnapshot, node, options.phase),
        runId: activeSnapshot.runId,
        task: activeSnapshot.task,
        traceContext,
      });
      const artifact = await runtime.writeArtifact(
        activeSnapshot.runId,
        `${options.artifactDirectory ?? "artifacts/exec"}/${safeArtifactName(node.id)}.md`,
        result.response,
        { signal: options.abortSignal },
      );
      publication = completionPublication(outcomeInput, result, artifact);
    } catch (error) {
      publication = failed(error);
    }

    // Success publication can enter the existing failure path once; failure publication escapes.
    for (;;) {
      try {
        await runtime.writeSnapshot(publication.snapshot, { signal: options.abortSignal });
        snapshotAccess.setSnapshot(publication.snapshot);
        await runtime.eventLog.appendGraphStatus(
          publication.snapshot,
          node.id,
          options.phase,
          publication.status,
          options.abortSignal,
        );
        if (publication.ok) {
          await runtime.eventLog.emitEvent(publication.snapshot, "artifact_written", {
            message: `Artifact written: ${publication.artifact.relativePath}`,
            nodeId: node.id,
            phase: options.phase,
            signal: options.abortSignal,
          });
          await runtime.eventLog.emitEvent(publication.snapshot, "node_completed", {
            message: `Node completed: ${node.title}`,
            nodeId: node.id,
            phase: options.phase,
            signal: options.abortSignal,
          });
        } else {
          await runtime.eventLog.emitEvent(publication.snapshot, "node_failed", {
            message: publication.errorMessage,
            nodeId: node.id,
            payload: { attempts: publication.attempts, retry: publication.status === "pending" },
            phase: options.phase,
            signal: options.abortSignal,
          });
        }
        return { nodeId: node.id, ok: publication.ok, snapshot: publication.snapshot };
      } catch (error) {
        if (!publication.ok) throw error;
        publication = failed(error);
      }
    }
  })() as WorkflowSchedulerNodePromise;
  promise.started = started;
  return promise;
}
