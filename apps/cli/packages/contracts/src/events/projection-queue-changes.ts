// SPDX-License-Identifier: Apache-2.0
// 投影的队列 changes：被接受的转向输入（steer）在会话里的排队、投递、重排与出队。
// 组织方式：五个导出各自只算一处 changes，公共的「按 pendingInputId 定位」与「补默认值」抽成小函数。

import type { PendingSteerInputInfo, SessionProjection } from "../interfaces/session.port.js";
import type {
  SessionEvent,
  SessionModeChangedPayload,
  TurnSteerDeliveryChangedPayload,
  TurnSteerQueuedPayload,
  TurnSteerReorderedPayload,
} from "./session.events.js";
import type { SessionProjectionChanges } from "./session-projection-ledgers.js";

/** 值缺失（undefined 或 null）时回落到旧值；空字符串等合法值不受影响。 */
function fallbackToExisting<T>(
  incoming: T | null | undefined,
  existing: T | undefined,
): T | undefined {
  return incoming === undefined || incoming === null ? existing : incoming;
}

function indexOfPendingInput(rows: PendingSteerInputInfo[], pendingInputId: string): number {
  return rows.findIndex((row) => row.pendingInputId === pendingInputId);
}

/** admission：同 id 的再次 admission 视为「编辑」——整行替换但**保留首次的排队位置与排队时间**， 因为调用方看到的是同一条排队输入，用户改的是内容而不是它的先后。 */
export function queueAdmissionChanges(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjectionChanges {
  const payload = event.payload as TurnSteerQueuedPayload;
  const rows = projection.pendingSteerInputs;
  const existingIndex = indexOfPendingInput(rows, payload.pendingInputId);
  const previous = existingIndex === -1 ? undefined : rows[existingIndex];

  const admitted: PendingSteerInputInfo = {
    pendingInputId: payload.pendingInputId,
    input: payload.input,
    inputPreview: payload.inputPreview,
    inputSize: payload.inputSize,
    commandKind: fallbackToExisting(payload.commandKind, previous?.commandKind),
    source: fallbackToExisting(payload.source, previous?.source),
    inputPresentation: fallbackToExisting(payload.inputPresentation, previous?.inputPresentation),
    intent: fallbackToExisting(payload.intent, previous?.intent),
    toolDisallowlist: fallbackToExisting(payload.toolDisallowlist, previous?.toolDisallowlist),
    queuedAt: previous?.queuedAt ?? event.timestamp,
    targetTurnId: payload.targetTurnId,
    traceId: event.traceId,
  };

  if (existingIndex === -1) return { pendingSteerInputs: [...rows, admitted] };
  return {
    pendingSteerInputs: rows.map((row, index) => (index === existingIndex ? admitted : row)),
  };
}

/** delivery：只改目标行的 intent。payload 没给 intent 时按旧 intent 补投递结论； 旧行本来就没有 intent 的话保持没有——凭空造一个 intent 会让队列项的授权语义发生变化。 */
export function queueDeliveryChanges(
  projection: SessionProjection,
  payload: TurnSteerDeliveryChangedPayload,
): SessionProjectionChanges {
  return {
    pendingSteerInputs: projection.pendingSteerInputs.map((row): PendingSteerInputInfo => {
      if (row.pendingInputId !== payload.pendingInputId) return row;
      if (payload.intent !== undefined && payload.intent !== null) {
        return { ...row, intent: payload.intent };
      }
      if (!row.intent) return { ...row, intent: undefined };
      return {
        ...row,
        intent: {
          ...row.intent,
          admittedDelivery: payload.admittedDelivery,
          fallbackReasonCode: payload.fallbackReasonCode,
        },
      };
    }),
  };
}

/** order：按给出的 id 顺序重排；未列出的行按原顺序接在后面。 带 intent 的行顺带写入从 0 起的 `queuePosition`；没有 intent 的行不写，避免产生半个队列位置。 */
export function queueOrderChanges(
  projection: SessionProjection,
  payload: TurnSteerReorderedPayload,
): SessionProjectionChanges {
  const rows = projection.pendingSteerInputs;
  const latestById = new Map(rows.map((row) => [row.pendingInputId, row]));
  const requested = new Set(payload.orderedPendingInputIds);

  const leading = payload.orderedPendingInputIds
    .map((id) => latestById.get(id))
    .filter((row): row is PendingSteerInputInfo => row !== undefined);
  const trailing = rows.filter((row) => !requested.has(row.pendingInputId));

  return {
    pendingSteerInputs: [...leading, ...trailing].map((row, queuePosition) => {
      if (!row.intent) return row;
      return { ...row, intent: { ...row.intent, queuePosition } };
    }),
  };
}

/** removal：按 id 过滤；不在列表里的行原样保留。 */
export function queueRemovalChanges(
  projection: SessionProjection,
  pendingInputIds: readonly string[],
): SessionProjectionChanges {
  const removing = new Set(pendingInputIds);
  return {
    pendingSteerInputs: projection.pendingSteerInputs.filter(
      (row) => !removing.has(row.pendingInputId),
    ),
  };
}

/** 模式变更：写 mode 与 planEnabled；带 permissionGrant 时把被放行的队列项 intent.mode 提升为 yolo。 只有同时「在放行名单里」且「本来就有 intent」的项才提升——没有 intent 的项不参与模式授权。 */
export function sessionModeChanges(
  projection: SessionProjection,
  payload: SessionModeChangedPayload,
): SessionProjectionChanges {
  const changes: SessionProjectionChanges = {
    mode: payload.mode,
    planEnabled: payload.planEnabled ?? payload.mode === "plan",
  };
  const granted = payload.permissionGrant;
  if (!granted) return changes;
  const grantedIds = new Set(granted.queueItemIds);
  changes.pendingSteerInputs = projection.pendingSteerInputs.map((row) => {
    if (!row.intent || !grantedIds.has(row.pendingInputId)) return row;
    return { ...row, intent: { ...row.intent, mode: "yolo" as const } };
  });
  return changes;
}
