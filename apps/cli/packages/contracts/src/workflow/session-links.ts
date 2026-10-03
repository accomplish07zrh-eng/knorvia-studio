import {
  type WorkflowRunSnapshot,
  type WorkflowSessionLink,
  type WorkflowSessionLinkStatus,
} from "./run-schema.js";
import { type WorkflowNodeStatus } from "./definition.js";

export function deriveWorkflowSessionLinks(
  snapshot: Pick<WorkflowRunSnapshot, "activities" | "runId">,
): WorkflowSessionLink[] {
  const attemptByScope = new Map<string, number>();
  return snapshot.activities.map((activity) => {
    const scope = [
      activity.phase,
      activity.nodeId ?? `phase:${activity.phase}`,
      activity.kind,
    ].join(":");
    const attempt = (attemptByScope.get(scope) ?? 0) + 1;
    attemptByScope.set(scope, attempt);
    return {
      activityId: activity.activityId,
      attempt,
      ...(activity.completedAt ? { completedAt: activity.completedAt } : {}),
      kind: activity.kind,
      ...(activity.model ? { model: activity.model } : {}),
      ...(activity.nodeId ? { nodeId: activity.nodeId } : {}),
      ...(activity.parentSessionId ? { parentSessionId: activity.parentSessionId } : {}),
      phase: activity.phase,
      runId: snapshot.runId,
      ...(activity.sessionId ? { sessionId: activity.sessionId } : {}),
      startedAt: activity.startedAt,
      status: workflowSessionLinkStatusFromActivity(activity.status),
      ...(activity.traceId ? { traceId: activity.traceId } : {}),
      ...(activity.turnId ? { turnId: activity.turnId } : {}),
    };
  });
}

function workflowSessionLinkStatusFromActivity(
  status: WorkflowNodeStatus,
): WorkflowSessionLinkStatus {
  switch (status) {
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "skipped":
      return "cancelled";
    case "pending":
    default:
      return "starting";
  }
}
