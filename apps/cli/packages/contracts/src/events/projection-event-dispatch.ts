// SPDX-License-Identifier: Apache-2.0
// 单个会话事件 → 投影 changes 的分派表。
// 组织方式：每个事件族一个 handlers 注册表（表驱动分派），表外的事件类型统一落到空 changes，
// 但仍然走同一个 commit；这样冷重建与增量归约共用一条事实路径。

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

/** 一个事件类型的处理器：只算 changes，不做提交。 */
type EventHandler = (
  projection: SessionProjection,
  event: SessionEvent,
) => SessionProjectionChanges;

/** 没有任何领域影响时的返回值；未知事件也走它。 */
const NO_CHANGES: SessionProjectionChanges = {};

// ── 工具调用与权限 ────────────────────────────────────────────────

/** 覆盖 activeToolCalls 里同 toolCallId 的字段；没有命中就不动。 */
function patchActiveToolCall(
  projection: SessionProjection,
  toolCallId: string,
  fields: Partial<ActiveToolCall>,
): ActiveToolCall[] {
  return projection.activeToolCalls.map((row) =>
    row.toolCallId === toolCallId ? { ...row, ...fields } : row,
  );
}

/** 权限了结：待批列表移除该 tool call，同时把工具调用状态推进到给定状态。 */
function settlePermission(
  projection: SessionProjection,
  toolCallId: string,
  status: ActiveToolCall["status"],
): SessionProjectionChanges {
  return {
    pendingPermissions: projection.pendingPermissions.filter(
      (row) => row.toolCallId !== toolCallId,
    ),
    activeToolCalls: patchActiveToolCall(projection, toolCallId, { status }),
  };
}

// ── 模型与目标完成校验 ────────────────────────────────────────────

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
  // 只有主会话可见的上下文才代表「当前窗口用了多少」；sidecar 用量与缺失用量都不能把旧值清零。
  const belongsToMainContext =
    payload.querySource === undefined
      ? payload.stopReason !== "tool_internal"
      : payload.querySource === "main_turn";
  if (!belongsToMainContext) return NO_CHANGES;
  const contextUsed = getModelUsageContextTokens(payload.usage);
  return contextUsed === undefined ? NO_CHANGES : { contextUsed };
}

/** 目标完成校验：时间线按「verificationId 命中，或同一目标同一迭代号」认定为同一条线， 因此 started/completed 重放只会推进那一行，不会留下重影。失败或取消时同时补一条兜底结论。 */
function goalVerificationChanges(
  projection: SessionProjection,
  payload: TargetCompletionVerificationPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const timeline = projection.targetCompletionVerificationTimeline;
  const previous = timeline.find(
    (row) =>
      row.verificationId === payload.verificationId ||
      (payload.goalIteration !== undefined &&
        row.targetId === payload.targetId &&
        row.goalIteration === payload.goalIteration),
  );
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

// ── 事件类型 → 处理函数 ───────────────────────────────────────────

const HANDLERS: Partial<Record<SessionEventType, EventHandler>> = {
  [SessionEventType.SessionCreated]: (projection, event) => {
    const payload = event.payload as SessionCreatedPayload;
    return {
      id: event.sessionId,
      mode: payload.mode,
      planEnabled: payload.planEnabled ?? payload.mode === "plan",
      contextWindow: payload.contextWindow,
      createdAt: event.timestamp,
      status: "idle",
    };
  },
  [SessionEventType.SessionModeChanged]: (projection, event) =>
    sessionModeChanges(projection, event.payload as SessionModeChangedPayload),
  // 新轮被接受后，上一轮的 provider 错误不再是当前事实；冷重建也必须据此清掉错误横幅。
  [SessionEventType.TurnStarted]: (projection, event) => ({
    currentTurnId: event.turnId,
    lastError: undefined,
    turnCount: projection.turnCount + 1,
    status: "running",
  }),
  [SessionEventType.TurnComplete]: (projection, event) => ({
    status: "idle",
    totalTokenCount: projection.totalTokenCount + (event.payload as TurnCompletePayload).tokenCount,
  }),
  [SessionEventType.TurnError]: (projection, event) => {
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
  },
  [SessionEventType.ModelComplete]: (projection, event) =>
    modelCompletionChanges(projection, event.payload as ModelCompletePayload),
  [SessionEventType.TargetChanged]: (projection, event) => {
    const payload = event.payload as TargetChangedPayload;
    // 换目标（targetID 变了）就把完成校验的历史整段清掉，否则旧目标的横线会挂在新目标上。
    const changedTarget =
      payload.action === "set" && payload.previousTarget?.targetID !== payload.target?.targetID;
    return {
      target: payload.target,
      targetCompletionVerifications: changedTarget ? [] : projection.targetCompletionVerifications,
      targetCompletionVerificationTimeline: changedTarget
        ? []
        : projection.targetCompletionVerificationTimeline,
    };
  },
  [SessionEventType.TargetCompletionVerification]: (projection, event) =>
    goalVerificationChanges(
      projection,
      event.payload as TargetCompletionVerificationPayload,
      event.timestamp,
    ),
  [SessionEventType.TurnSteerQueued]: (projection, event) =>
    queueAdmissionChanges(projection, event),
  [SessionEventType.TurnSteerDeliveryChanged]: (projection, event) =>
    queueDeliveryChanges(projection, event.payload as TurnSteerDeliveryChangedPayload),
  [SessionEventType.TurnSteerReordered]: (projection, event) =>
    queueOrderChanges(projection, event.payload as TurnSteerReorderedPayload),
  [SessionEventType.TurnSteerDrained]: (projection, event) =>
    queueRemovalChanges(projection, (event.payload as TurnSteerDrainedPayload).pendingInputIds),
  [SessionEventType.TurnSteerDiscarded]: (projection, event) =>
    queueRemovalChanges(projection, (event.payload as TurnSteerDiscardedPayload).pendingInputIds),
  [SessionEventType.ToolCallScheduled]: (projection, event) => {
    const payload = event.payload as ToolCallScheduledPayload;
    return {
      activeToolCalls: appendProjectionRow<ActiveToolCall>(projection.activeToolCalls, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: "pending",
      }),
    };
  },
  [SessionEventType.ToolCallStarted]: (projection, event) => {
    const payload = event.payload as ToolCallStartedPayload;
    return {
      activeToolCalls: patchActiveToolCall(projection, payload.toolCallId, {
        status: "running",
        startedAt: payload.startedAt,
      }),
    };
  },
  [SessionEventType.ToolCallResult]: (projection, event) => {
    const payload = event.payload as ToolCallResultPayload;
    return {
      activeToolCalls: patchActiveToolCall(projection, payload.toolCallId, {
        status: payload.result.success ? "completed" : "failed",
      }),
    };
  },
  [SessionEventType.ToolCallError]: (projection, event) => ({
    activeToolCalls: patchActiveToolCall(
      projection,
      (event.payload as ToolCallErrorPayload).toolCallId,
      { status: "failed" },
    ),
  }),
  // 一批工具收口后仍可能继续请求模型，所以这里只清工具行，status 仍由 TurnComplete 决定。
  [SessionEventType.ToolBatchComplete]: (projection, event) => {
    const finished = new Set<string>((event.payload as ToolBatchCompletePayload).toolCallIds);
    return {
      activeToolCalls: projection.activeToolCalls.filter((row) => !finished.has(row.toolCallId)),
    };
  },
  [SessionEventType.PermissionRequested]: (projection, event) => {
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
  },
  [SessionEventType.PermissionResolved]: (projection, event) => {
    const payload = event.payload as PermissionResolvedPayload;
    return settlePermission(
      projection,
      payload.toolCallId,
      payload.decision === "deny" ? "denied" : "completed",
    );
  },
  [SessionEventType.PermissionDenied]: (projection, event) =>
    settlePermission(projection, (event.payload as PermissionDeniedPayload).toolCallId, "denied"),
  [SessionEventType.SessionCompacted]: (projection, event) =>
    compactProjectionChanges(
      projection,
      (event.payload as SessionCompactedPayload).compactBoundary,
      event.timestamp,
    ),
  [SessionEventType.CompactBoundary]: (projection, event) =>
    compactProjectionChanges(projection, event.payload, event.timestamp),
  [SessionEventType.CheckpointCreated]: (projection, event) => {
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
  },
  [SessionEventType.RewindTriggered]: (projection, event) => {
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
  },
  [SessionEventType.StreamingToolLedgerUpdated]: (projection, event) =>
    streamingLedgerChanges(
      projection,
      event.payload as StreamingToolLedgerPayload,
      event.timestamp,
    ),
  [SessionEventType.StreamRecoveryAnchorCreated]: (projection, event) =>
    recoveryAnchorChanges(event.payload as StreamRecoveryAnchorPayload, event.timestamp),
  [SessionEventType.BackgroundTaskStarted]: (projection, event) =>
    backgroundStartedChanges(
      projection,
      event.payload as BackgroundTaskStartedPayload,
      event.timestamp,
    ),
  [SessionEventType.BackgroundTaskUpdated]: (projection, event) =>
    backgroundUpdatedChanges(projection, event.payload as BackgroundTaskUpdatedPayload),
  [SessionEventType.BackgroundTaskCompleted]: (projection, event) =>
    backgroundCompletedChanges(
      projection,
      event.payload as BackgroundTaskCompletedPayload,
      event.timestamp,
    ),
};

/** 推进一个事件：查表得 changes，再统一提交并写事件时间戳。 表里没有的事件（已存在但本包未建模、或未来新增）得到空 changes，`updatedAt` 仍然推进。 */
export function applySessionProjectionEvent(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjection {
  const handler = HANDLERS[event.type];
  const changes = handler ? handler(projection, event) : NO_CHANGES;
  return commitSessionProjection(projection, changes, event.timestamp);
}
