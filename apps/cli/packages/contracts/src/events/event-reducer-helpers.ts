import type {
  ActiveToolCall,
  CollaborationMode,
  PendingPermission,
  PendingSteerInputInfo,
  SessionProjection,
  SessionStatus,
} from "../interfaces/session.port.js";
import type {
  BackgroundTaskCompletedPayload,
  BackgroundTaskStartedPayload,
  BackgroundTaskUpdatedPayload,
} from "./session.events.js";
import type {
  StreamRecoveryAnchorPayload,
  StreamingToolLedgerPayload,
} from "./stream-recovery.events.js";
import {
  backgroundCompletedChanges,
  backgroundStartedChanges,
  backgroundUpdatedChanges,
  commitSessionProjection,
  compactProjectionChanges,
  recoveryAnchorChanges,
  streamingLedgerChanges,
} from "./session-projection-ledgers.js";

// 保留 canonical template、默认值及 module 初始化时间；不计为新的原创表达。
export const initialSessionProjection = {
  createdAt: new Date(),
  updatedAt: new Date(),
  mode: "build" as CollaborationMode,
  status: "idle" as SessionStatus,
  turnCount: 0,
  totalTokenCount: 0,
  contextUsed: 0,
  contextWindow: 200000,
  pendingPermissions: [] as PendingPermission[],
  pendingSteerInputs: [] as PendingSteerInputInfo[],
  activeToolCalls: [] as ActiveToolCall[],
  streamingToolLedger: [] as SessionProjection["streamingToolLedger"],
  backgroundTasks: [] as SessionProjection["backgroundTasks"],
  currentTurnId: undefined as string | undefined,
  lastError: undefined as SessionProjection["lastError"],
  lastCompact: undefined as SessionProjection["lastCompact"],
  lastCheckpoint: undefined as SessionProjection["lastCheckpoint"],
  lastStreamRecoveryAnchor: undefined as SessionProjection["lastStreamRecoveryAnchor"],
  lastRewind: undefined as SessionProjection["lastRewind"],
  target: undefined as SessionProjection["target"],
  targetCompletionVerifications: [] as SessionProjection["targetCompletionVerifications"],
  targetCompletionVerificationTimeline:
    [] as SessionProjection["targetCompletionVerificationTimeline"],
};

export function applyStreamingToolLedgerUpdate(
  projection: SessionProjection,
  payload: StreamingToolLedgerPayload,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(
    projection,
    streamingLedgerChanges(projection, payload, timestamp),
    timestamp,
  );
}

export function applyStreamRecoveryAnchorCreated(
  projection: SessionProjection,
  payload: StreamRecoveryAnchorPayload,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(projection, recoveryAnchorChanges(payload, timestamp), timestamp);
}

export function applyCompactBoundary(
  projection: SessionProjection,
  payload: unknown,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(
    projection,
    compactProjectionChanges(projection, payload, timestamp),
    timestamp,
  );
}

// 数值兼容 helper 沿用既有标准表达和来源，不另计一个重写 owner。
export function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const integer = Math.trunc(value);
  return integer > 0 ? integer : undefined;
}

export function applyBackgroundTaskStarted(
  projection: SessionProjection,
  payload: BackgroundTaskStartedPayload,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(
    projection,
    backgroundStartedChanges(projection, payload, timestamp),
    timestamp,
  );
}

export function applyBackgroundTaskUpdated(
  projection: SessionProjection,
  payload: BackgroundTaskUpdatedPayload,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(
    projection,
    backgroundUpdatedChanges(projection, payload),
    timestamp,
  );
}

export function applyBackgroundTaskCompleted(
  projection: SessionProjection,
  payload: BackgroundTaskCompletedPayload,
  timestamp: Date,
): SessionProjection {
  return commitSessionProjection(
    projection,
    backgroundCompletedChanges(projection, payload, timestamp),
    timestamp,
  );
}
