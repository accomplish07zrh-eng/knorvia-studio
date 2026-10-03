import { parseCompactBoundaryPayload } from "../compact/index.js";
import type { BackgroundTaskInfo, SessionProjection } from "../interfaces/session.port.js";
import type {
  BackgroundTaskCompletedPayload,
  BackgroundTaskStartedPayload,
  BackgroundTaskUpdatedPayload,
} from "./session.events.js";
import type {
  StreamRecoveryAnchorPayload,
  StreamingToolLedgerPayload,
} from "./stream-recovery.events.js";

export type SessionProjectionChanges = Partial<SessionProjection>;

export function appendProjectionRow<Row>(rows: Row[], row: Row): Row[] {
  const next = [...rows];
  next.push(row);
  return next;
}

/** 唯一 projection commit；所有领域先算字段 changes，输入事实从不原地改写。 */
export function commitSessionProjection(
  projection: SessionProjection,
  changes: SessionProjectionChanges,
  timestamp: Date,
): SessionProjection {
  return { ...projection, ...changes, updatedAt: timestamp };
}

export function compactProjectionChanges(
  projection: SessionProjection,
  payload: unknown,
  timestamp: Date,
): SessionProjectionChanges {
  const boundary = parseCompactBoundaryPayload(payload);
  return {
    contextUsed:
      boundary.truePostCompactTokenCount ?? boundary.postCompactTokenCount ?? projection.contextUsed,
    lastCompact: {
      boundaryId: boundary.boundaryId,
      trigger: boundary.trigger,
      phase: boundary.phase,
      compactReason: boundary.compactReason,
      compactedAt: timestamp,
      preCompactTokenCount: boundary.preCompactTokenCount,
      postCompactTokenCount: boundary.postCompactTokenCount,
      truePostCompactTokenCount: boundary.truePostCompactTokenCount,
      summarizedMessageCount: boundary.summarizedMessageCount,
      keptMessageCount: boundary.keptMessageCount,
      willRetriggerNextTurn: boundary.willRetriggerNextTurn,
    },
  };
}

export function streamingLedgerChanges(
  projection: SessionProjection,
  payload: StreamingToolLedgerPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const next = { ...payload, updatedAt: timestamp };
  let matched = false;
  const rows = projection.streamingToolLedger.map((row) => {
    if (row.attemptId !== payload.attemptId || row.toolCallId !== payload.toolCallId) return row;
    matched = true;
    // Ledger 的显式 undefined 会覆盖旧字段；不能套用 background 的 merge 策略。
    return { ...row, ...next };
  });
  return {
    streamingToolLedger: matched ? rows : appendProjectionRow(projection.streamingToolLedger, next),
  };
}

export function recoveryAnchorChanges(
  payload: StreamRecoveryAnchorPayload,
  timestamp: Date,
): SessionProjectionChanges {
  return { lastStreamRecoveryAnchor: { ...payload, updatedAt: timestamp } };
}

// Canonical snapshot 字段保持既有来源；字段列表是兼容白名单，不计新原创表达。
const TASK_SNAPSHOT_FIELDS = [
  "taskId",
  "toolCallId",
  "toolName",
  "taskKind",
  "childSessionId",
  "blocked",
  "blockedReason",
  "cancellable",
  "cancelRequestedAt",
  "command",
  "description",
  "status",
  "pid",
  "startedAt",
  "completedAt",
  "outputPath",
  "stderrPersistedOutputPath",
  "stdoutPersistedOutputPath",
  "outputBytes",
  "outputTruncated",
  "outputTail",
  "stderrBytes",
  "stderrTail",
  "stdoutBytes",
  "stdoutTail",
  "terminalId",
] as const satisfies readonly (keyof BackgroundTaskInfo)[];

function backgroundSnapshot(
  payload: BackgroundTaskStartedPayload | BackgroundTaskCompletedPayload,
  completed: boolean,
): BackgroundTaskInfo {
  const entries: Array<[string, unknown]> = [];
  for (const field of TASK_SNAPSHOT_FIELDS) {
    if (!completed && field === "completedAt") continue;
    entries.push([field, payload[field]]);
  }
  return Object.fromEntries(entries) as BackgroundTaskInfo;
}

function overlayDefinedTaskFields(
  current: BackgroundTaskInfo,
  fields: Partial<BackgroundTaskInfo>,
): BackgroundTaskInfo {
  const next = { ...current };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // 和 object spread 一样写 own data property；扩展字段 __proto__ 不能改变原型。
    Object.defineProperty(next, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
}

export function backgroundStartedChanges(
  projection: SessionProjection,
  payload: BackgroundTaskStartedPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const next = backgroundSnapshot(payload, false);
  next.startedAt = payload.startedAt ?? timestamp;
  const rows = projection.backgroundTasks.filter((row) => row.taskId !== payload.taskId);
  rows.push(next);
  return { backgroundTasks: rows };
}

export function backgroundUpdatedChanges(
  projection: SessionProjection,
  payload: BackgroundTaskUpdatedPayload,
): SessionProjectionChanges {
  return {
    backgroundTasks: projection.backgroundTasks.map((row) =>
      row.taskId === payload.taskId ? overlayDefinedTaskFields(row, payload) : row,
    ),
  };
}

export function backgroundCompletedChanges(
  projection: SessionProjection,
  payload: BackgroundTaskCompletedPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const next = backgroundSnapshot(payload, true);
  next.completedAt = payload.completedAt ?? timestamp;
  let matched = false;
  const rows = projection.backgroundTasks.map((row) => {
    if (row.taskId !== payload.taskId) return row;
    matched = true;
    return overlayDefinedTaskFields(row, next);
  });
  return { backgroundTasks: matched ? rows : appendProjectionRow(projection.backgroundTasks, next) };
}
