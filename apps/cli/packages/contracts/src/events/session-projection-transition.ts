import type {
  ActiveToolCall,
  PendingPermission,
  SessionProjection,
} from "../interfaces/session.port.js";
import { getModelUsageContextTokens } from "../model/index.js";
import { parseCheckpointCreatedPayload, parseRewindTriggeredPayload } from "../rewind/index.js";
import {
  GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE,
  failedGoalCompletionVerification,
  parseGoalCompletionVerificationText,
} from "../tools/target.js";
import { SessionEventType } from "./session.events.js";
import type {
  BackgroundTaskCompletedPayload,
  BackgroundTaskStartedPayload,
  BackgroundTaskUpdatedPayload,
  ModelCompletePayload,
  PermissionDeniedPayload,
  PermissionRequestedPayload,
  PermissionResolvedPayload,
  SessionCompactedPayload,
  SessionCreatedPayload,
  SessionEvent,
  SessionModeChangedPayload,
  TargetChangedPayload,
  TargetCompletionVerificationPayload,
  ToolBatchCompletePayload,
  ToolCallErrorPayload,
  ToolCallResultPayload,
  ToolCallScheduledPayload,
  ToolCallStartedPayload,
  TurnCompletePayload,
  TurnErrorPayload,
  TurnSteerDeliveryChangedPayload,
  TurnSteerDiscardedPayload,
  TurnSteerDrainedPayload,
  TurnSteerReorderedPayload,
} from "./session.events.js";
import {
  appendProjectionRow,
  backgroundCompletedChanges,
  backgroundStartedChanges,
  backgroundUpdatedChanges,
  commitSessionProjection,
  compactProjectionChanges,
  recoveryAnchorChanges,
  streamingLedgerChanges,
  type SessionProjectionChanges,
} from "./session-projection-ledgers.js";
import {
  queueAdmissionChanges,
  queueDeliveryChanges,
  queueOrderChanges,
  queueRemovalChanges,
  sessionModeChanges,
} from "./session-projection-queue.js";
import type {
  StreamRecoveryAnchorPayload,
  StreamingToolLedgerPayload,
} from "./stream-recovery.events.js";

function toolChanges(
  projection: SessionProjection,
  toolCallId: string,
  fields: Partial<ActiveToolCall>,
): ActiveToolCall[] {
  return projection.activeToolCalls.map((row) =>
    row.toolCallId === toolCallId ? { ...row, ...fields } : row,
  );
}

function permissionSettlementChanges(
  projection: SessionProjection,
  toolCallId: string,
  status: ActiveToolCall["status"],
): SessionProjectionChanges {
  return {
    pendingPermissions: projection.pendingPermissions.filter((row) => row.toolCallId !== toolCallId),
    activeToolCalls: toolChanges(projection, toolCallId, { status }),
  };
}

function modelCompletionChanges(
  projection: SessionProjection,
  payload: ModelCompletePayload,
): SessionProjectionChanges {
  if (payload.querySource === GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE) {
    return {
      targetCompletionVerifications: appendProjectionRow(
        projection.targetCompletionVerifications,
        parseGoalCompletionVerificationText(payload.content),
      ),
    };
  }
  const mainContext =
    payload.querySource === undefined
      ? payload.stopReason !== "tool_internal"
      : payload.querySource === "main_turn";
  // Sidecar usage 不代表主会话可见上下文；缺失 usage 也不能把旧 context 清零。
  if (!mainContext) return {};
  const contextUsed = getModelUsageContextTokens(payload.usage);
  return contextUsed === undefined ? {} : { contextUsed };
}

function goalVerificationChanges(
  projection: SessionProjection,
  payload: TargetCompletionVerificationPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const timeline = projection.targetCompletionVerificationTimeline;
  const previous = timeline.find((row) => {
    if (row.verificationId === payload.verificationId) return true;
    return (
      payload.goalIteration !== undefined &&
      row.targetId === payload.targetId &&
      row.goalIteration === payload.goalIteration
    );
  });
  const startedAt = previous?.startedAt ?? (payload.status === "started" ? timestamp : undefined);
  const assistantAnchor = payload.anchorAssistantMessageId ?? previous?.anchorAssistantMessageId;
  const turnAnchor = payload.anchorTurnId ?? previous?.anchorTurnId;
  const next: SessionProjection["targetCompletionVerificationTimeline"][number] = {
    targetId: payload.targetId,
    status: payload.status,
    verificationId: payload.verificationId,
    ...(payload.verification ? { verification: payload.verification } : {}),
    goalIteration: payload.goalIteration ?? previous?.goalIteration ?? timeline.length + 1,
    ...(assistantAnchor ? { anchorAssistantMessageId: assistantAnchor } : {}),
    ...(turnAnchor ? { anchorTurnId: turnAnchor } : {}),
    ...(startedAt ? { startedAt } : {}),
    updatedAt: timestamp,
  };
  const changes: SessionProjectionChanges = {
    // 按既有目标 iteration 身份及命中引用替换，started/completed 重放不能生成重复横线。
    targetCompletionVerificationTimeline: previous
      ? timeline.map((row) => (row === previous ? next : row))
      : appendProjectionRow(timeline, next),
    targetCompletionVerifications: projection.targetCompletionVerifications,
  };
  if (payload.status === "failed_closed" || payload.status === "cancelled") {
    changes.targetCompletionVerifications = appendProjectionRow(
      projection.targetCompletionVerifications,
      payload.verification ??
        failedGoalCompletionVerification(
          "The completion verifier did not return a persisted result.",
        ),
    );
  }
  return changes;
}

function changesForEvent(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjectionChanges {
  switch (event.type) {
    case SessionEventType.SessionCreated: {
      const payload = event.payload as SessionCreatedPayload;
      return {
        id: event.sessionId,
        mode: payload.mode,
        planEnabled: payload.planEnabled ?? payload.mode === "plan",
        contextWindow: payload.contextWindow,
        createdAt: event.timestamp,
        status: "idle",
      };
    }
    case SessionEventType.SessionModeChanged:
      return sessionModeChanges(projection, event.payload as SessionModeChangedPayload);
    case SessionEventType.TurnStarted:
      // 新轮被接受后，旧 provider 错误不再是当前任务事实；cold rebuild 也必须清除横幅。
      return {
        currentTurnId: event.turnId,
        lastError: undefined,
        turnCount: projection.turnCount + 1,
        status: "running",
      };
    case SessionEventType.TurnComplete:
      return {
        status: "idle",
        totalTokenCount: projection.totalTokenCount + (event.payload as TurnCompletePayload).tokenCount,
      };
    case SessionEventType.TurnError: {
      const error = (event.payload as TurnErrorPayload).error;
      return {
        status: "error",
        lastError: {
          type: error.type,
          ...(error.code ? { code: error.code } : {}),
          message: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
          ...(error.attribution ? { attribution: error.attribution } : {}),
        },
      };
    }
    case SessionEventType.ModelComplete:
      return modelCompletionChanges(projection, event.payload as ModelCompletePayload);
    case SessionEventType.TargetChanged: {
      const payload = event.payload as TargetChangedPayload;
      const changes: SessionProjectionChanges = {
        target: payload.target,
        targetCompletionVerifications: projection.targetCompletionVerifications,
        targetCompletionVerificationTimeline: projection.targetCompletionVerificationTimeline,
      };
      if (payload.action === "set" && payload.previousTarget?.targetID !== payload.target?.targetID) {
        changes.targetCompletionVerifications = [];
        changes.targetCompletionVerificationTimeline = [];
      }
      return changes;
    }
    case SessionEventType.TargetCompletionVerification:
      return goalVerificationChanges(
        projection,
        event.payload as TargetCompletionVerificationPayload,
        event.timestamp,
      );
    case SessionEventType.TurnSteerQueued:
      return queueAdmissionChanges(projection, event);
    case SessionEventType.TurnSteerDeliveryChanged:
      return queueDeliveryChanges(projection, event.payload as TurnSteerDeliveryChangedPayload);
    case SessionEventType.TurnSteerReordered:
      return queueOrderChanges(projection, event.payload as TurnSteerReorderedPayload);
    case SessionEventType.TurnSteerDrained:
      return queueRemovalChanges(projection, (event.payload as TurnSteerDrainedPayload).pendingInputIds);
    case SessionEventType.TurnSteerDiscarded:
      return queueRemovalChanges(projection, (event.payload as TurnSteerDiscardedPayload).pendingInputIds);
    case SessionEventType.ToolCallScheduled: {
      const payload = event.payload as ToolCallScheduledPayload;
      return {
        activeToolCalls: appendProjectionRow<ActiveToolCall>(projection.activeToolCalls, {
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          status: "pending",
        }),
      };
    }
    case SessionEventType.ToolCallStarted: {
      const payload = event.payload as ToolCallStartedPayload;
      return {
        activeToolCalls: toolChanges(projection, payload.toolCallId, {
          status: "running",
          startedAt: payload.startedAt,
        }),
      };
    }
    case SessionEventType.ToolCallResult: {
      const payload = event.payload as ToolCallResultPayload;
      return {
        activeToolCalls: toolChanges(projection, payload.toolCallId, {
          status: payload.result.success ? "completed" : "failed",
        }),
      };
    }
    case SessionEventType.ToolCallError:
      return {
        activeToolCalls: toolChanges(projection, (event.payload as ToolCallErrorPayload).toolCallId, {
          status: "failed",
        }),
      };
    case SessionEventType.ToolBatchComplete: {
      const finished = new Set<string>((event.payload as ToolBatchCompletePayload).toolCallIds);
      // Tool batch 收口后仍可能请求模型，只有 TurnComplete 将 session 转回 idle。
      return {
        activeToolCalls: projection.activeToolCalls.filter((row) => !finished.has(row.toolCallId)),
      };
    }
    case SessionEventType.PermissionRequested: {
      const payload = event.payload as PermissionRequestedPayload;
      const request: PendingPermission = {
        input: payload.input,
        reason: payload.reason,
        requestId: payload.requestId,
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        ...(payload.suggestedPermissionUpdates
          ? { suggestedPermissionUpdates: payload.suggestedPermissionUpdates }
          : {}),
        ...(payload.origin ? { origin: payload.origin } : {}),
        ...(payload.display ? { display: payload.display } : {}),
        ...(payload.optionsPolicy ? { optionsPolicy: payload.optionsPolicy } : {}),
        riskLevel: payload.riskLevel,
        requestedAt: event.timestamp,
      };
      return { pendingPermissions: appendProjectionRow(projection.pendingPermissions, request) };
    }
    case SessionEventType.PermissionResolved: {
      const payload = event.payload as PermissionResolvedPayload;
      return permissionSettlementChanges(
        projection,
        payload.toolCallId,
        payload.decision === "deny" ? "denied" : "completed",
      );
    }
    case SessionEventType.PermissionDenied:
      return permissionSettlementChanges(
        projection,
        (event.payload as PermissionDeniedPayload).toolCallId,
        "denied",
      );
    case SessionEventType.SessionCompacted:
      return compactProjectionChanges(
        projection,
        (event.payload as SessionCompactedPayload).compactBoundary,
        event.timestamp,
      );
    case SessionEventType.CompactBoundary:
      return compactProjectionChanges(projection, event.payload, event.timestamp);
    case SessionEventType.CheckpointCreated: {
      const checkpoint = parseCheckpointCreatedPayload(event.payload);
      return {
        lastCheckpoint: {
          checkpointId: checkpoint.checkpointId,
          compactBoundaryId: checkpoint.compactBoundaryId,
          coveredByCompact: checkpoint.coveredByCompact,
          createdAt: event.timestamp,
          fileCount: checkpoint.fileCount,
          messageId: checkpoint.messageId,
          targetMessageId: checkpoint.targetMessageId,
          toolMessageId: checkpoint.toolMessageId,
          scope: checkpoint.scope,
          snapshotRef: checkpoint.snapshotRef,
        },
      };
    }
    case SessionEventType.RewindTriggered: {
      const rewind = parseRewindTriggeredPayload(event.payload);
      return {
        lastRewind: {
          compactBoundaryId: rewind.compactBoundaryId,
          reason: rewind.reason,
          rewindId: rewind.rewindId,
          scope: rewind.scope,
          strategy: rewind.strategy,
          targetCheckpointId: rewind.targetCheckpointId,
          targetMessageId: rewind.targetMessageId,
          triggeredAt: event.timestamp,
        },
      };
    }
    case SessionEventType.StreamingToolLedgerUpdated:
      return streamingLedgerChanges(
        projection,
        event.payload as StreamingToolLedgerPayload,
        event.timestamp,
      );
    case SessionEventType.StreamRecoveryAnchorCreated:
      return recoveryAnchorChanges(event.payload as StreamRecoveryAnchorPayload, event.timestamp);
    case SessionEventType.BackgroundTaskStarted:
      return backgroundStartedChanges(
        projection,
        event.payload as BackgroundTaskStartedPayload,
        event.timestamp,
      );
    case SessionEventType.BackgroundTaskUpdated:
      return backgroundUpdatedChanges(projection, event.payload as BackgroundTaskUpdatedPayload);
    case SessionEventType.BackgroundTaskCompleted:
      return backgroundCompletedChanges(
        projection,
        event.payload as BackgroundTaskCompletedPayload,
        event.timestamp,
      );
    default:
      return {};
  }
}

/** 无实例 handlers/cache；已存在或未来未知事件都通过同一个 timestamp commit。 */
export function applySessionProjectionEvent(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjection {
  return commitSessionProjection(projection, changesForEvent(projection, event), event.timestamp);
}
