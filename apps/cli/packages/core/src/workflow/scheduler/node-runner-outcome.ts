import type {
  TraceContext,
  WorkflowActivitySnapshot,
  WorkflowGraphNode,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { addArtifact, updateGraphNode, upsertActivity } from "./graph.js";
import type {
  WorkflowGraphSchedulerActivityResult,
  WorkflowGraphSchedulerRunOptions,
} from "./types.js";

export interface NodeOutcomeInput {
  activityId: string;
  clock(): string;
  current(): WorkflowRunSnapshot;
  inputArtifactPaths: string[];
  node: WorkflowGraphNode;
  options: WorkflowGraphSchedulerRunOptions;
  startedAt: string;
  traceContext?: TraceContext;
}

export type NodePublication =
  | {
      artifact: { path: string; relativePath: string };
      ok: true;
      snapshot: WorkflowRunSnapshot;
      status: "completed";
    }
  | {
      attempts: number;
      errorMessage: string;
      ok: false;
      snapshot: WorkflowRunSnapshot;
      status: "pending" | "failed";
    };

export function completionPublication(
  input: NodeOutcomeInput,
  result: WorkflowGraphSchedulerActivityResult,
  artifact: { path: string; relativePath: string },
): NodePublication {
  let snapshot = input.current();
  snapshot = updateGraphNode(snapshot, input.node.id, {
    attempts: input.node.attempts,
    error: undefined,
    status: "completed",
  });
  const activity: WorkflowActivitySnapshot = {
    activityId: input.activityId,
    artifactPath: artifact.relativePath,
    completedAt: input.clock(),
    inputArtifactPaths: input.inputArtifactPaths,
    kind: "agent_session",
    nodeId: input.node.id,
    outputArtifactPaths: [artifact.relativePath],
    parentSessionId: input.options.parentSessionId,
    phase: input.options.phase,
    ...(result.model ? { model: result.model } : {}),
    sessionId: result.sessionId,
    startedAt: input.startedAt,
    status: "completed",
    traceId: result.traceId ?? input.traceContext?.traceId,
    turnId: result.turnId,
  };
  snapshot = upsertActivity(snapshot, activity, input.clock());
  const record = {
    contentType: "text/markdown",
    createdAt: input.clock(),
    label: input.node.title,
    path: artifact.relativePath,
    phase: input.options.phase,
  };
  snapshot = addArtifact(snapshot, record, input.clock());
  return { artifact, ok: true, snapshot, status: "completed" };
}

export function failurePublication(
  input: NodeOutcomeInput,
  error: unknown,
  maxAttempts: number,
): NodePublication {
  const attempts = (input.node.attempts ?? 0) + 1;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const status = attempts >= maxAttempts ? "failed" : "pending";
  let snapshot = input.current();
  const linked = snapshot.activities.find((value) => value.activityId === input.activityId);
  snapshot = updateGraphNode(snapshot, input.node.id, { attempts, error: errorMessage, status });
  const activity: WorkflowActivitySnapshot = {
    activityId: input.activityId,
    completedAt: input.clock(),
    error: errorMessage,
    inputArtifactPaths: input.inputArtifactPaths,
    kind: "agent_session",
    ...(linked?.model ? { model: linked.model } : {}),
    nodeId: input.node.id,
    outputArtifactPaths: [],
    parentSessionId: input.options.parentSessionId,
    phase: input.options.phase,
    ...(linked?.sessionId ? { sessionId: linked.sessionId } : {}),
    startedAt: input.startedAt,
    status,
    traceId: linked?.traceId ?? input.traceContext?.traceId,
    ...(linked?.turnId ? { turnId: linked.turnId } : {}),
  };
  snapshot = upsertActivity(snapshot, activity, input.clock());
  return { attempts, errorMessage, ok: false, snapshot, status };
}
