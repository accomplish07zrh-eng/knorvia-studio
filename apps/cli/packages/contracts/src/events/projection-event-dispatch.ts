// SPDX-License-Identifier: Apache-2.0
// 事件 → 投影 changes 的内部实现（分派表）。
// 组织方式：处理器统一接收一个只读的投影视图，投影本体不进参数列表；
// 事件表按族分三段登记，表外事件统一落到空 changes，再交给唯一提交点写时间戳。

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
} from "./projection-ledger-changes.js";
import {
  queueAdmissionChanges,
  queueDeliveryChanges,
  queueOrderChanges,
  queueRemovalChanges,
  sessionModeChanges,
} from "./projection-queue-changes.js";
import type {
  StreamRecoveryAnchorPayload,
  StreamingToolLedgerPayload,
} from "./stream-recovery.events.js";

/** 处理器只读的投影视图：投影本体挂在视图上，调用方不必逐个参数透传。 */
interface ProjectionState {
  readonly projection: SessionProjection;
}

/** 一个事件类型的处理器：只算 changes，不做提交。 */
type EventHandler = (state: ProjectionState, event: SessionEvent) => SessionProjectionChanges;

/** 没有任何领域影响时的返回值；未知事件也走它。 */
const NO_CHANGES: SessionProjectionChanges = {};

// ── 工具调用与权限 ────────────────────────────────────────────────

/** 覆盖 activeToolCalls 里同 toolCallId 的行字段；没有命中就不动。 */
function patchToolCall(
  state: ProjectionState,
  toolCallId: string,
  fields: Partial<ActiveToolCall>,
): ActiveToolCall[] {
  return state.projection.activeToolCalls.map((row) =>
    row.toolCallId === toolCallId ? { ...row, ...fields } : row,
  );
}

/** 权限了结：待批列表移除该 tool call，并把工具调用状态推进到给定状态。 */
function settlePermissionChanges(
  state: ProjectionState,
  toolCallId: string,
  status: ActiveToolCall["status"],
): SessionProjectionChanges {
  const remaining = state.projection.pendingPermissions.filter(
    (row) => row.toolCallId !== toolCallId,
  );
  return {
    pendingPermissions: remaining,
    activeToolCalls: patchToolCall(state, toolCallId, { status }),
  };
}

// ── 模型回合与目标完成校验 ────────────────────────────────────────

/** 目标完成校验的专用查询：把模型回包解析成一条校验结论。 */
function goalVerificationQueryChanges(
  state: ProjectionState,
  payload: ModelCompletePayload,
): SessionProjectionChanges {
  return {
    targetCompletionVerifications: appendProjectionRow(
      state.projection.targetCompletionVerifications,
      parseGoalCompletionVerificationText(payload.content),
    ),
  };
}

/** 只有主会话可见的上下文才代表「当前窗口用了多少」；sidecar 与缺失用量都不能把旧值清零。 */
function modelTurnContextChanges(payload: ModelCompletePayload): SessionProjectionChanges {
  const countsForMainContext =
    payload.querySource === undefined
      ? payload.stopReason !== "tool_internal"
      : payload.querySource === "main_turn";
  if (!countsForMainContext) return NO_CHANGES;

  const contextUsed = getModelUsageContextTokens(payload.usage);
  if (contextUsed === undefined) return NO_CHANGES;
  return { contextUsed };
}

/**
 * 目标完成校验：按 verificationId 命中，或同一目标同一迭代号，认定为同一条时间线，
 * 因此 started/completed 重放只推进那一行，不会留下重影。失败与取消另补一条兜底结论。
 */
function goalVerificationChanges(
  state: ProjectionState,
  payload: TargetCompletionVerificationPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const timeline = state.projection.targetCompletionVerificationTimeline;
  const line = timeline.find(
    (row) =>
      row.verificationId === payload.verificationId ||
      (payload.goalIteration !== undefined &&
        row.targetId === payload.targetId &&
        row.goalIteration === payload.goalIteration),
  );
  const startedAt = line?.startedAt ?? (payload.status === "started" ? timestamp : undefined);
  const assistantAnchor = payload.anchorAssistantMessageId ?? line?.anchorAssistantMessageId;
  const turnAnchor = payload.anchorTurnId ?? line?.anchorTurnId;

  const nextRow: SessionProjection["targetCompletionVerificationTimeline"][number] = {
    targetId: payload.targetId,
    status: payload.status,
    verificationId: payload.verificationId,
    ...(payload.verification ? { verification: payload.verification } : {}),
    goalIteration: payload.goalIteration ?? line?.goalIteration ?? timeline.length + 1,
    ...(assistantAnchor ? { anchorAssistantMessageId: assistantAnchor } : {}),
    ...(turnAnchor ? { anchorTurnId: turnAnchor } : {}),
    ...(startedAt ? { startedAt } : {}),
    updatedAt: timestamp,
  };

  const changes: SessionProjectionChanges = {
    targetCompletionVerificationTimeline: line
      ? timeline.map((row) => (row === line ? nextRow : row))
      : appendProjectionRow(timeline, nextRow),
    targetCompletionVerifications: state.projection.targetCompletionVerifications,
  };
  if (payload.status === "failed_closed" || payload.status === "cancelled") {
    changes.targetCompletionVerifications = appendProjectionRow(
      state.projection.targetCompletionVerifications,
      payload.verification ??
        failedGoalCompletionVerification(
          "The completion verifier did not return a persisted result.",
        ),
    );
  }
  return changes;
}

// ── 会话与轮次 ───────────────────────────────────────────────────

const SESSION_HANDLERS: Partial<Record<SessionEventType, EventHandler>> = {
  [SessionEventType.SessionCreated]: (_state, event) => {
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
  [SessionEventType.SessionModeChanged]: (state, event) =>
    sessionModeChanges(state.projection, event.payload as SessionModeChangedPayload),
  // 新轮被接受后，上一轮的 provider 错误不再是当前事实；冷重建也据此清掉错误横幅。
  [SessionEventType.TurnStarted]: (state, event) => ({
    currentTurnId: event.turnId,
    lastError: undefined,
    turnCount: state.projection.turnCount + 1,
    status: "running",
  }),
  [SessionEventType.TurnComplete]: (state, event) => ({
    status: "idle",
    totalTokenCount:
      state.projection.totalTokenCount + (event.payload as TurnCompletePayload).tokenCount,
  }),
  [SessionEventType.TurnError]: (_state, event) => {
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
  [SessionEventType.ModelComplete]: (state, event) => {
    const payload = event.payload as ModelCompletePayload;
    return payload.querySource === GOAL_COMPLETION_VERIFICATION_QUERY_SOURCE
      ? goalVerificationQueryChanges(state, payload)
      : modelTurnContextChanges(payload);
  },
  // 换目标（targetID 变了）就把完成校验的历史整段清掉，否则旧目标的横线会挂到新目标上。
  [SessionEventType.TargetChanged]: (state, event) => {
    const payload = event.payload as TargetChangedPayload;
    const switchedTarget =
      payload.action === "set" && payload.previousTarget?.targetID !== payload.target?.targetID;
    return {
      target: payload.target,
      targetCompletionVerifications: switchedTarget
        ? []
        : state.projection.targetCompletionVerifications,
      targetCompletionVerificationTimeline: switchedTarget
        ? []
        : state.projection.targetCompletionVerificationTimeline,
    };
  },
  [SessionEventType.TargetCompletionVerification]: (state, event) =>
    goalVerificationChanges(
      state,
      event.payload as TargetCompletionVerificationPayload,
      event.timestamp,
    ),
};

// ── 转向队列 ─────────────────────────────────────────────────────

const QUEUE_HANDLERS: Partial<Record<SessionEventType, EventHandler>> = {
  [SessionEventType.TurnSteerQueued]: (state, event) =>
    queueAdmissionChanges(state.projection, event),
  [SessionEventType.TurnSteerDeliveryChanged]: (state, event) =>
    queueDeliveryChanges(state.projection, event.payload as TurnSteerDeliveryChangedPayload),
  [SessionEventType.TurnSteerReordered]: (state, event) =>
    queueOrderChanges(state.projection, event.payload as TurnSteerReorderedPayload),
  [SessionEventType.TurnSteerDrained]: (state, event) =>
    queueRemovalChanges(
      state.projection,
      (event.payload as TurnSteerDrainedPayload).pendingInputIds,
    ),
  [SessionEventType.TurnSteerDiscarded]: (state, event) =>
    queueRemovalChanges(
      state.projection,
      (event.payload as TurnSteerDiscardedPayload).pendingInputIds,
    ),
};

// ── 工具、权限与落盘记录 ─────────────────────────────────────────

const EXECUTION_HANDLERS: Partial<Record<SessionEventType, EventHandler>> = {
  [SessionEventType.ToolCallScheduled]: (state, event) => {
    const payload = event.payload as ToolCallScheduledPayload;
    return {
      activeToolCalls: appendProjectionRow<ActiveToolCall>(state.projection.activeToolCalls, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: "pending",
      }),
    };
  },
  [SessionEventType.ToolCallStarted]: (state, event) => {
    const payload = event.payload as ToolCallStartedPayload;
    return {
      activeToolCalls: patchToolCall(state, payload.toolCallId, {
        status: "running",
        startedAt: payload.startedAt,
      }),
    };
  },
  [SessionEventType.ToolCallResult]: (state, event) => {
    const payload = event.payload as ToolCallResultPayload;
    return {
      activeToolCalls: patchToolCall(state, payload.toolCallId, {
        status: payload.result.success ? "completed" : "failed",
      }),
    };
  },
  [SessionEventType.ToolCallError]: (state, event) => ({
    activeToolCalls: patchToolCall(state, (event.payload as ToolCallErrorPayload).toolCallId, {
      status: "failed",
    }),
  }),
  // 一批工具收口后仍可能继续请求模型，所以这里只清工具行，status 仍由 TurnComplete 决定。
  [SessionEventType.ToolBatchComplete]: (state, event) => {
    const finished = new Set<string>((event.payload as ToolBatchCompletePayload).toolCallIds);
    return {
      activeToolCalls: state.projection.activeToolCalls.filter(
        (row) => !finished.has(row.toolCallId),
      ),
    };
  },
  [SessionEventType.PermissionRequested]: (state, event) => {
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
    return {
      pendingPermissions: appendProjectionRow(state.projection.pendingPermissions, request),
    };
  },
  [SessionEventType.PermissionResolved]: (state, event) => {
    const payload = event.payload as PermissionResolvedPayload;
    return settlePermissionChanges(
      state,
      payload.toolCallId,
      payload.decision === "deny" ? "denied" : "completed",
    );
  },
  [SessionEventType.PermissionDenied]: (state, event) =>
    settlePermissionChanges(state, (event.payload as PermissionDeniedPayload).toolCallId, "denied"),
  [SessionEventType.SessionCompacted]: (state, event) =>
    compactProjectionChanges(
      state.projection,
      (event.payload as SessionCompactedPayload).compactBoundary,
      event.timestamp,
    ),
  [SessionEventType.CompactBoundary]: (state, event) =>
    compactProjectionChanges(state.projection, event.payload, event.timestamp),
  [SessionEventType.CheckpointCreated]: (_state, event) => {
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
  [SessionEventType.RewindTriggered]: (_state, event) => {
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
  [SessionEventType.StreamingToolLedgerUpdated]: (state, event) =>
    streamingLedgerChanges(
      state.projection,
      event.payload as StreamingToolLedgerPayload,
      event.timestamp,
    ),
  [SessionEventType.StreamRecoveryAnchorCreated]: (state, event) =>
    recoveryAnchorChanges(event.payload as StreamRecoveryAnchorPayload, event.timestamp),
  [SessionEventType.BackgroundTaskStarted]: (state, event) =>
    backgroundStartedChanges(
      state.projection,
      event.payload as BackgroundTaskStartedPayload,
      event.timestamp,
    ),
  [SessionEventType.BackgroundTaskUpdated]: (state, event) =>
    backgroundUpdatedChanges(state.projection, event.payload as BackgroundTaskUpdatedPayload),
  [SessionEventType.BackgroundTaskCompleted]: (state, event) =>
    backgroundCompletedChanges(
      state.projection,
      event.payload as BackgroundTaskCompletedPayload,
      event.timestamp,
    ),
};

/** 三段登记表合并成一张总表；同名事件只允许登记一次。 */
const HANDLERS: Partial<Record<SessionEventType, EventHandler>> = {
  ...SESSION_HANDLERS,
  ...QUEUE_HANDLERS,
  ...EXECUTION_HANDLERS,
};

/**
 * 推进一个事件：查表得 changes，再统一提交并写事件时间戳。
 * 表里没有的事件（已存在但本包未建模、或未来新增）得到空 changes，`updatedAt` 仍然推进。
 */
export function applySessionProjectionEvent(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjection {
  const handler = HANDLERS[event.type];
  const changes = handler ? handler({ projection }, event) : NO_CHANGES;
  return commitSessionProjection(projection, changes, event.timestamp);
}
