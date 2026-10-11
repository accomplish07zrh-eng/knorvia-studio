// SPDX-License-Identifier: Apache-2.0
// 投影的领域 changes 计算：紧凑边界、流式工具账本、恢复锚点、后台任务四条线。
// 组织方式：每个导出只算「字段差异」，唯一提交点 commitSessionProjection 负责合并与时间戳；
// 后台任务的字段白名单是一张表，快照与覆盖都按表走。

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

/** 一次领域变更：只描述要改的字段，合并与时间戳由 commit 负责。 */
export type SessionProjectionChanges = Partial<SessionProjection>;

/** 追加一行；返回新数组，入参不变。 */
export function appendProjectionRow<Row>(rows: Row[], row: Row): Row[] {
  return [...rows, row];
}

/** 唯一提交点：浅拷贝旧投影、叠加 changes、写入事件时间戳。 */
export function commitSessionProjection(
  projection: SessionProjection,
  changes: SessionProjectionChanges,
  timestamp: Date,
): SessionProjection {
  return { ...projection, ...changes, updatedAt: timestamp };
}

/** 紧凑边界 → `contextUsed` 与 `lastCompact`。payload 非法时由 schema 抛错，这里不吞错。 */
export function compactProjectionChanges(
  projection: SessionProjection,
  payload: unknown,
  timestamp: Date,
): SessionProjectionChanges {
  const boundary = parseCompactBoundaryPayload(payload);
  // 三档回落：真实的后紧凑计数优先，其次是估计值，最后保持当前上下文用量不动。
  const contextUsed =
    boundary.truePostCompactTokenCount ?? boundary.postCompactTokenCount ?? projection.contextUsed;
  return {
    contextUsed,
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

/** 流式工具账本：按 `(attemptId, toolCallId)` 命中则整行覆盖，未命中则追加。 覆盖语义与后台任务相反——这里 **显式 undefined 也要覆盖**：账本的字段消失本身就是一次状态转移， 不能当作「没提供」而保留旧值。 */
export function streamingLedgerChanges(
  projection: SessionProjection,
  payload: StreamingToolLedgerPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const row = { ...payload, updatedAt: timestamp };
  const rows = projection.streamingToolLedger;
  const matchedIndex = rows.findIndex(
    (existing) =>
      existing.attemptId === payload.attemptId && existing.toolCallId === payload.toolCallId,
  );
  if (matchedIndex === -1) {
    return { streamingToolLedger: appendProjectionRow(rows, row) };
  }
  return {
    streamingToolLedger: rows.map((existing, index) =>
      index === matchedIndex ? { ...existing, ...row } : existing,
    ),
  };
}

/** 流恢复锚点：整块替换为最新一个锚点。 */
export function recoveryAnchorChanges(
  payload: StreamRecoveryAnchorPayload,
  timestamp: Date,
): SessionProjectionChanges {
  return { lastStreamRecoveryAnchor: { ...payload, updatedAt: timestamp } };
}

// 后台任务快照的兼容白名单：顺序即写入顺序，字段集合是外部可见的持久化形状，不可增删。
// 白名单之外的键一律不进快照，避免把运行时内部字段泄进投影。
// 名字写成一段以空格分隔的清单再切开：清单只有一处来源，改字段只改这一行。
type TaskSnapshotField =
  | "taskId"
  | "toolCallId"
  | "toolName"
  | "taskKind"
  | "childSessionId"
  | "blocked"
  | "blockedReason"
  | "cancellable"
  | "cancelRequestedAt"
  | "command"
  | "description"
  | "status"
  | "pid"
  | "startedAt"
  | "completedAt"
  | "outputPath"
  | "stderrPersistedOutputPath"
  | "stdoutPersistedOutputPath"
  | "outputBytes"
  | "outputTruncated"
  | "outputTail"
  | "stderrBytes"
  | "stderrTail"
  | "stdoutBytes"
  | "stdoutTail"
  | "terminalId";

const TASK_SNAPSHOT_FIELD_SOURCE =
  "taskId toolCallId toolName taskKind childSessionId blocked blockedReason cancellable cancelRequestedAt " +
  "command description status pid startedAt completedAt outputPath stderrPersistedOutputPath " +
  "stdoutPersistedOutputPath outputBytes outputTruncated outputTail stderrBytes stderrTail stdoutBytes " +
  "stdoutTail terminalId";

const TASK_SNAPSHOT_FIELDS = TASK_SNAPSHOT_FIELD_SOURCE.split(" ") as readonly TaskSnapshotField[];

/** 起始快照不含 `completedAt`（还没有完成时刻）；完成快照才带上它。 */
const FIELDS_OMITTED_WHILE_RUNNING: ReadonlySet<string> = new Set(["completedAt"]);

function backgroundSnapshot(
  payload: BackgroundTaskStartedPayload | BackgroundTaskCompletedPayload,
  completed: boolean,
): BackgroundTaskInfo {
  const entries: Array<[string, unknown]> = [];
  for (const field of TASK_SNAPSHOT_FIELDS) {
    if (!completed && FIELDS_OMITTED_WHILE_RUNNING.has(field)) continue;
    entries.push([field, payload[field]]);
  }
  // 白名单里含 payload 必需的 taskId/status，所以这里不需要再补默认值。
  return Object.fromEntries(entries) as unknown as BackgroundTaskInfo;
}

/** 按「只覆盖已定义字段」的规则叠加一行后台任务。 用 `Object.defineProperty` 而不是直接赋值：payload 可能带 `__proto__` 这类扩展键， 直接赋值会改到原型而不是写 own 数据属性。undefined 不参与覆盖（与 update 语义一致）。 */
function overlayDefinedTaskFields(
  current: BackgroundTaskInfo,
  fields: Partial<BackgroundTaskInfo>,
): BackgroundTaskInfo {
  const next = { ...current };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    Object.defineProperty(next, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
}

/** 后台任务开始：同 taskId 的旧行整行替换，并补上开始时间。 */
export function backgroundStartedChanges(
  projection: SessionProjection,
  payload: BackgroundTaskStartedPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const snapshot = backgroundSnapshot(payload, false);
  snapshot.startedAt = payload.startedAt ?? timestamp;
  const others = projection.backgroundTasks.filter((row) => row.taskId !== payload.taskId);
  return { backgroundTasks: [...others, snapshot] };
}

/** 后台任务更新：同 taskId 的行只覆盖 payload 里已定义的字段，其余保持原值。 */
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

/** 后台任务完成：命中同 taskId 则覆盖并补完成时间，未命中则追加一行。 */
export function backgroundCompletedChanges(
  projection: SessionProjection,
  payload: BackgroundTaskCompletedPayload,
  timestamp: Date,
): SessionProjectionChanges {
  const snapshot = backgroundSnapshot(payload, true);
  snapshot.completedAt = payload.completedAt ?? timestamp;
  const rows = projection.backgroundTasks;
  const matchedIndex = rows.findIndex((row) => row.taskId === payload.taskId);
  if (matchedIndex === -1) return { backgroundTasks: appendProjectionRow(rows, snapshot) };
  return {
    backgroundTasks: rows.map((row, index) =>
      index === matchedIndex ? overlayDefinedTaskFields(row, snapshot) : row,
    ),
  };
}
