export type * from "./workflow-types.js";
export type WorkflowSchedulerDerivedNode = {
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
  blockedBy: string[];
  collectionIds: string[];
  incoming: string[];
  outgoing: string[];
  ready: boolean;
};
export type WorkflowSchedulerState = {
  nodes: {
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
    blockedBy: string[];
    collectionIds: string[];
    incoming: string[];
    outgoing: string[];
    ready: boolean;
  }[];
  activeActivities: {
    activityId: string;
    phase: string;
    nodeId?: string | undefined;
    sessionId?: string | undefined;
    traceId?: string | undefined;
    turnId?: string | undefined;
  }[];
  activeChildSessionIds: string[];
  activeNodeIds: string[];
  blockedNodes: { nodeId: string; blockedBy: string[] }[];
  counts: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    ready: number;
    blocked: number;
    total: number;
  };
  readyNodeIds: string[];
  collectionStates: {
    status: "active" | "exhausted" | "draining";
    errorCount: number;
    exhausted: boolean;
    plannerRuns: number;
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
    activeNodeIds: string[];
    completedNodeIds: string[];
    failedNodeIds: string[];
    frontier: number;
    pendingNodeIds: string[];
    readyNodeIds: string[];
    frontierTarget?: number | undefined;
  }[];
};
export type SessionId = string & {
  readonly __brand: "SessionId";
};
export type TurnId = string & {
  readonly __brand: "TurnId";
};
export type EventId = string & {
  readonly __brand: "EventId";
};
export type TraceId = string & {
  readonly __brand: "TraceId";
};
export type QueryId = string & {
  readonly __brand: "QueryId";
};
export interface TraceContext {
  traceId: TraceId;
  queryId?: QueryId;
  spanId?: string;
  parentSpanId?: string;
  parentId?: string;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: Record<string, string | number | boolean>;
}
export interface SessionEvent {
  id: EventId;
  sessionId: SessionId;
  turnId?: TurnId;
  type: SessionEventType;
  timestamp: Date;
  traceId: TraceId;
  sequenceNumber: number;
  payload: unknown;
}
export type SessionEventType =
  | "session_created"
  | "session_resumed"
  | "session_forked"
  | "session_compacted"
  | "session_title_updated"
  | "session_mode_changed"
  | "session_ended"
  | "turn_started"
  | "turn_input_received"
  | "turn_steer_queued"
  | "turn_steer_delivery_changed"
  | "turn_steer_dispatch_changed"
  | "turn_steer_drained"
  | "turn_steer_rejected"
  | "turn_steer_discarded"
  | "session_input_promoted"
  | "turn_steer_reordered"
  | "queue_auto_drain_changed"
  | "followup_mode_changed"
  | "turn_complete"
  | "turn_error"
  | "user_message"
  | "assistant_message"
  | "assistant_feedback_updated"
  | "system_message"
  | "model_request"
  | "model_selected"
  | "model_streaming"
  | "streaming_tool_ledger_updated"
  | "stream_recovery_anchor_created"
  | "stream_recovery_started"
  | "stream_recovery_anchor_selected"
  | "stream_recovery_tail_discarded"
  | "stream_recovery_retry_started"
  | "stream_recovery_blocked"
  | "model_network_status"
  | "model_anomaly_warning"
  | "network_request_status"
  | "model_complete"
  | "model_error"
  | "tool_call_scheduled"
  | "tool_call_started"
  | "tool_call_progress"
  | "tool_call_result"
  | "tool_call_error"
  | "tool_batch_complete"
  | "background_task_started"
  | "background_task_updated"
  | "background_task_completed"
  | "dynamic_workflow_run_progress"
  | "permission_requested"
  | "permission_resolved"
  | "permission_denied"
  | "user_input_auto_resolution_updated"
  | "workspace_hook_review_requested"
  | "workspace_hook_review_settled"
  | "workspace_hook_review_superseded"
  | "workspace_hook_admission_updated"
  | "hook_run_started"
  | "hook_run_progress"
  | "hook_run_completed"
  | "hook_run_failed"
  | "hook_run_blocked"
  | "compact_started"
  | "compact_completed"
  | "compact_failed"
  | "compact_boundary"
  | "microcompact_boundary"
  | "rewind_triggered"
  | "checkpoint_created"
  | "target_changed"
  | "target_completion_verification"
  | "subagent_spawned"
  | "subagent_message"
  | "subagent_stopped"
  | "interrupt"
  | "cancel"
  | "resume"
  | "error";
