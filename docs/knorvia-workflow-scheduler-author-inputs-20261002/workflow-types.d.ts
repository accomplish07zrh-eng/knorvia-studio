export type WorkflowRunSnapshot = {
  status: "pending" | "completed" | "failed" | "cancelled" | "running" | "paused";
  kind: string;
  activities: {
    activityId: string;
    status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
    inputArtifactPaths: string[];
    kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent";
    outputArtifactPaths: string[];
    phase: string;
    startedAt: string;
    artifactPath?: string | undefined;
    completedAt?: string | undefined;
    error?: string | undefined;
    model?: string | undefined;
    nodeId?: string | undefined;
    parentSessionId?: string | undefined;
    sessionId?: string | undefined;
    traceId?: string | undefined;
    turnId?: string | undefined;
  }[];
  artifacts: {
    path: string;
    contentType: string;
    createdAt: string;
    label: string;
    phase?: string | undefined;
  }[];
  createdAt: string;
  cwd: string;
  task: string;
  graph: {
    edges: { from: string; to: string }[];
    nodes: {
      status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
      kind: "phase" | "task";
      title: string;
      id: string;
      dependsOn: string[];
      error?: string | undefined;
      phase?: string | undefined;
      collectionId?: string | undefined;
      attempts?: number | undefined;
      description?: string | undefined;
      prompt?: string | undefined;
      reopenAttempts?: number | undefined;
    }[];
    collections?:
      | {
          collectionId: string;
          status?: "active" | "exhausted" | "draining" | undefined;
          phase?: string | undefined;
          analyzedNodeIds?: string[] | undefined;
          errorCount?: number | undefined;
          exhausted?: boolean | undefined;
          explorable?: boolean | undefined;
          frontierTarget?: number | undefined;
          goal?: string | undefined;
          lastCompletionAt?: string | undefined;
          lastGraphChangeAt?: string | undefined;
          metric?: string | undefined;
          nodeIds?: string[] | undefined;
          plannerRuns?: number | undefined;
          title?: string | undefined;
        }[]
      | undefined;
  };
  phaseOrder: string[];
  phases: {
    status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
    phase: string;
    activityId?: string | undefined;
    artifactPath?: string | undefined;
    completedAt?: string | undefined;
    error?: string | undefined;
    sessionId?: string | undefined;
    startedAt?: string | undefined;
    traceId?: string | undefined;
    turnId?: string | undefined;
  }[];
  recoveryActions: {
    label: string;
    action: "retry" | "retry_with_current_model" | "skip_node" | "cancel";
    activityId?: string | undefined;
    nodeId?: string | undefined;
    phase?: string | undefined;
    destructive?: boolean | undefined;
  }[];
  runId: string;
  schemaVersion: 1;
  sessionLinks: {
    activityId: string;
    status:
      | "completed"
      | "failed"
      | "cancelled"
      | "starting"
      | "running"
      | "retrying_model"
      | "waiting_permission";
    kind: "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent";
    phase: string;
    startedAt: string;
    runId: string;
    attempt: number;
    completedAt?: string | undefined;
    model?: string | undefined;
    nodeId?: string | undefined;
    parentSessionId?: string | undefined;
    sessionId?: string | undefined;
    traceId?: string | undefined;
    turnId?: string | undefined;
  }[];
  strategy: {
    clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number };
    executor: {
      frontierTarget: number;
      drainingChangeHours: number;
      maxConcurrentLoops: number;
      maxConsecutiveErrors: number;
      maxPlannerRuns: number;
    };
    finalCritic: { maxIterations: number };
    reactLoop: { maxRounds: number };
  };
  updatedAt: string;
  completedAt?: string | undefined;
  sessionId?: string | undefined;
  startedAt?: string | undefined;
  traceId?: string | undefined;
  currentPhase?: string | undefined;
  definitionId?: string | undefined;
  definitionVersion?: string | undefined;
  failure?:
    | {
        message: string;
        kind:
          | "cancelled"
          | "unknown"
          | "network"
          | "rate_limit"
          | "timeout"
          | "auth"
          | "provider"
          | "model_context"
          | "configuration"
          | "permission"
          | "tool";
        recoverable: boolean;
        retryable: boolean;
        activityId?: string | undefined;
        code?: string | undefined;
        nodeId?: string | undefined;
        phase?: string | undefined;
        sessionId?: string | undefined;
        traceId?: string | undefined;
        turnId?: string | undefined;
      }
    | undefined;
  pauseReason?: string | undefined;
  reportPath?: string | undefined;
};
export type WorkflowGraphNode = {
  status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
  kind: "phase" | "task";
  title: string;
  id: string;
  dependsOn: string[];
  error?: string | undefined;
  phase?: string | undefined;
  collectionId?: string | undefined;
  attempts?: number | undefined;
  description?: string | undefined;
  prompt?: string | undefined;
  reopenAttempts?: number | undefined;
};
export type WorkflowGraph = {
  edges: { from: string; to: string }[];
  nodes: {
    status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
    kind: "phase" | "task";
    title: string;
    id: string;
    dependsOn: string[];
    error?: string | undefined;
    phase?: string | undefined;
    collectionId?: string | undefined;
    attempts?: number | undefined;
    description?: string | undefined;
    prompt?: string | undefined;
    reopenAttempts?: number | undefined;
  }[];
  collections?:
    | {
        collectionId: string;
        status?: "active" | "exhausted" | "draining" | undefined;
        phase?: string | undefined;
        analyzedNodeIds?: string[] | undefined;
        errorCount?: number | undefined;
        exhausted?: boolean | undefined;
        explorable?: boolean | undefined;
        frontierTarget?: number | undefined;
        goal?: string | undefined;
        lastCompletionAt?: string | undefined;
        lastGraphChangeAt?: string | undefined;
        metric?: string | undefined;
        nodeIds?: string[] | undefined;
        plannerRuns?: number | undefined;
        title?: string | undefined;
      }[]
    | undefined;
};
export type WorkflowGraphCollection = {
  collectionId: string;
  status?: "active" | "exhausted" | "draining" | undefined;
  phase?: string | undefined;
  analyzedNodeIds?: string[] | undefined;
  errorCount?: number | undefined;
  exhausted?: boolean | undefined;
  explorable?: boolean | undefined;
  frontierTarget?: number | undefined;
  goal?: string | undefined;
  lastCompletionAt?: string | undefined;
  lastGraphChangeAt?: string | undefined;
  metric?: string | undefined;
  nodeIds?: string[] | undefined;
  plannerRuns?: number | undefined;
  title?: string | undefined;
};
export type WorkflowGraphPlannerResult = {
  edges: { from: string; to: string }[];
  nodes: {
    kind: "phase" | "task";
    title: string;
    id: string;
    dependsOn: string[];
    phase?: string | undefined;
    collectionId?: string | undefined;
    description?: string | undefined;
    prompt?: string | undefined;
  }[];
  exhausted?: boolean | undefined;
  collectionNodeIds?: string[] | undefined;
  reasoning?: string | undefined;
};
export type WorkflowGraphRecord =
  | {
      createdAt: string;
      phaseOrder: string[];
      runId: string;
      schemaVersion: 1;
      strategy: {
        clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number };
        executor: {
          frontierTarget: number;
          drainingChangeHours: number;
          maxConcurrentLoops: number;
          maxConsecutiveErrors: number;
          maxPlannerRuns: number;
        };
        finalCritic: { maxIterations: number };
        reactLoop: { maxRounds: number };
      };
      recordType: "meta";
      definitionId?: string | undefined;
      definitionVersion?: string | undefined;
    }
  | {
      runId: string;
      recordType: "node";
      node: {
        status: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
        kind: "phase" | "task";
        title: string;
        id: string;
        dependsOn: string[];
        error?: string | undefined;
        phase?: string | undefined;
        collectionId?: string | undefined;
        attempts?: number | undefined;
        description?: string | undefined;
        prompt?: string | undefined;
        reopenAttempts?: number | undefined;
      };
      timestamp: string;
    }
  | { runId: string; recordType: "edge"; timestamp: string; edge: { from: string; to: string } }
  | {
      runId: string;
      recordType: "collection";
      timestamp: string;
      collection: {
        collectionId: string;
        status?: "active" | "exhausted" | "draining" | undefined;
        phase?: string | undefined;
        analyzedNodeIds?: string[] | undefined;
        errorCount?: number | undefined;
        exhausted?: boolean | undefined;
        explorable?: boolean | undefined;
        frontierTarget?: number | undefined;
        goal?: string | undefined;
        lastCompletionAt?: string | undefined;
        lastGraphChangeAt?: string | undefined;
        metric?: string | undefined;
        nodeIds?: string[] | undefined;
        plannerRuns?: number | undefined;
        title?: string | undefined;
      };
    }
  | {
      type: string;
      runId: string;
      recordType: "op";
      timestamp: string;
      status?: "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled" | undefined;
      nodeId?: string | undefined;
      phase?: string | undefined;
      collectionId?: string | undefined;
      nodeIds?: string[] | undefined;
      edgeIds?: string[] | undefined;
      payload?: Record<string, unknown> | undefined;
    };
export type WorkflowEvent = {
  type:
    | "run_started"
    | "run_completed"
    | "run_failed"
    | "workflow_paused"
    | "workflow_retry_started"
    | "workflow_session_linked"
    | "run_cancelled"
    | "phase_started"
    | "phase_completed"
    | "phase_failed"
    | "artifact_written"
    | "graph_updated"
    | "node_started"
    | "node_completed"
    | "node_failed"
    | "frontier_changed"
    | "executor_paused"
    | "executor_completed"
    | "planner_started"
    | "planner_completed"
    | "planner_failed"
    | "graph_expanded"
    | "collection_exhausted"
    | "critic_started"
    | "critic_passed"
    | "critic_failed"
    | "node_reopened"
    | "critic_iteration_limit_reached";
  kind: string;
  runId: string;
  timestamp: string;
  message?: string | undefined;
  nodeId?: string | undefined;
  phase?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};
export type WorkflowGraphCollectionStatus = "active" | "exhausted" | "draining";
export type WorkflowNodeStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";
