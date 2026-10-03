import {
  CoreErrorType,
  isCoreError,
  type ExpertWorkflowRunSnapshot,
  type WorkflowActivitySnapshot,
  type WorkflowFailure,
  type WorkflowRecoveryAction,
} from "@knorvia/contracts";

function errorChain(error: unknown): unknown[] {
  const entries: unknown[] = [];
  const seen = new WeakSet<object>();
  let current = error;
  while (current !== null && current !== undefined && entries.length < 8) {
    entries.push(current);
    if (typeof current !== "object") break;
    if (seen.has(current)) break;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return entries;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function rawString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function failureKind(error: unknown): WorkflowFailure["kind"] {
  for (const entry of errorChain(error)) {
    if (isCoreError(entry)) {
      switch (entry.type) {
        case CoreErrorType.ModelContextExceeded:
          return "model_context";
        case CoreErrorType.ModelRateLimited:
          return "rate_limit";
        case CoreErrorType.ModelTimeout:
          return "timeout";
        case CoreErrorType.PermissionDenied:
        case CoreErrorType.PermissionTimeout:
          return "permission";
        case CoreErrorType.ToolExecutionFailed:
        case CoreErrorType.ToolTimeout:
        case CoreErrorType.ToolMaxCalls:
          return "tool";
        case CoreErrorType.ConfigurationError:
          return "configuration";
        case CoreErrorType.TurnCancelled:
          return "cancelled";
      }
    }
    const record = recordOf(entry);
    const code = rawString(record.code).toLowerCase();
    const type = rawString(record.type).toLowerCase();
    const reason = rawString(
      record.reason ?? recordOf(record.context).reason,
    ).toLowerCase();
    const combined = `${code} ${type} ${reason}`;
    if (combined.includes("rate")) return "rate_limit";
    if (combined.includes("timeout")) return "timeout";
    if (combined.includes("context")) return "model_context";
    if (combined.includes("auth") || combined.includes("not_configured")) {
      return "auth";
    }
    if (combined.includes("permission")) return "permission";
    if (combined.includes("tool")) return "tool";
    if (
      combined.includes("network") ||
      combined.includes("proxy") ||
      combined.includes("tls")
    ) {
      return "network";
    }
    if (
      combined.includes("provider") ||
      combined.includes("model_request_failed")
    ) {
      return "provider";
    }
  }
  return "unknown";
}

function failureCode(error: unknown): string | undefined {
  for (const entry of errorChain(error)) {
    const record = recordOf(entry);
    const code = rawString(record.code || record.type);
    if (code) return code;
  }
  return undefined;
}

function retryability(kind: WorkflowFailure["kind"], error: unknown): boolean {
  if (kind === "auth" || kind === "cancelled" || kind === "configuration") {
    return false;
  }
  for (const entry of errorChain(error)) {
    const record = recordOf(entry);
    if (typeof record.retryable === "boolean") return record.retryable;
    const context = recordOf(record.context);
    if (typeof context.retryable === "boolean") return context.retryable;
  }
  return true;
}

export function latestWorkflowActivity(
  snapshot: ExpertWorkflowRunSnapshot,
): WorkflowActivitySnapshot | undefined {
  return [...snapshot.activities]
    .reverse()
    .find(
      (activity) =>
        activity.status === "failed" ||
        activity.status === "active" ||
        activity.phase === snapshot.currentPhase,
    );
}

export function workflowFailureFromError(
  error: unknown,
  message: string,
  activity?: WorkflowActivitySnapshot,
): WorkflowFailure {
  const kind = failureKind(error);
  const code = failureCode(error);
  return {
    ...(activity?.activityId ? { activityId: activity.activityId } : {}),
    ...(code ? { code } : {}),
    kind,
    message,
    ...(activity?.nodeId ? { nodeId: activity.nodeId } : {}),
    ...(activity?.phase ? { phase: activity.phase } : {}),
    recoverable: kind !== "cancelled",
    retryable: retryability(kind, error),
    ...(activity?.sessionId ? { sessionId: activity.sessionId } : {}),
    ...(activity?.traceId ? { traceId: activity.traceId } : {}),
    ...(activity?.turnId ? { turnId: activity.turnId } : {}),
  };
}

export function workflowRecoveryActions(
  failure: WorkflowFailure,
): WorkflowRecoveryAction[] {
  const scoped = {
    ...(failure.activityId ? { activityId: failure.activityId } : {}),
    ...(failure.nodeId ? { nodeId: failure.nodeId } : {}),
    ...(failure.phase ? { phase: failure.phase } : {}),
  };
  return [
    { action: "retry", label: "Retry", ...scoped },
    {
      action: "retry_with_current_model",
      label: "Retry with current model",
      ...scoped,
    },
    { action: "cancel", destructive: true, label: "Cancel workflow", ...scoped },
  ];
}
