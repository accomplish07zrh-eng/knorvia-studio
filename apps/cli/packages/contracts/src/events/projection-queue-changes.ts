// SPDX-License-Identifier: Apache-2.0
// 队列 changes 的内部实现：转向输入（steer）的排队、投递、重排、出队与模式授权。
// 组织方式：所有操作都在「pendingInputId → 行」的有序 Map 上做（Map 保证插入序＝排队序），
// 结束时统一 materialize 成数组，因此「原位更新」「按 id 去重」都是数据结构的自然结果。

import type { PendingSteerInputInfo, SessionProjection } from "../interfaces/session.port.js";
import type {
  SessionEvent,
  SessionModeChangedPayload,
  TurnSteerDeliveryChangedPayload,
  TurnSteerQueuedPayload,
  TurnSteerReorderedPayload,
} from "./session.events.js";
import type { SessionProjectionChanges } from "./projection-ledger-changes.js";

/** 队列投影的规范形状：`pendingInputId` 在队列内唯一（admission 即按 id 去重）。 */
type QueueRows = Map<string, PendingSteerInputInfo>;

type QueueKey = keyof PendingSteerInputInfo;

function toQueueRows(rows: readonly PendingSteerInputInfo[]): QueueRows {
  return new Map(rows.map((row) => [row.pendingInputId, row]));
}

function toRowArray(rows: QueueRows): PendingSteerInputInfo[] {
  return [...rows.values()];
}

/** 入库值缺失（undefined / null）时沿用旧值；空字符串等合法值照旧生效。 */
function preferIncoming<T>(incoming: T | null | undefined, previous: T | undefined): T | undefined {
  return incoming === undefined || incoming === null ? previous : incoming;
}

/** 逐字段挑「本次给了就用本次，没给就沿用旧值」。 */
function mergeDefinedFields<K extends QueueKey>(
  incoming: PendingSteerInputInfo,
  previous: PendingSteerInputInfo | undefined,
  keys: readonly K[],
): Pick<PendingSteerInputInfo, K> {
  const merged = {} as Pick<PendingSteerInputInfo, K>;
  for (const key of keys) merged[key] = preferIncoming(incoming[key], previous?.[key]) as never;
  return merged;
}

/** 内容字段：身份与展示字段每次 admission 都整份替换。 */
const ADMISSION_CONTENT_KEYS = ["input", "inputPreview", "inputSize", "targetTurnId"] as const;
/** 行为字段：本次没给就沿用旧行，避免编辑内容时把授权、来源与展示方式清掉。 */
const ADMISSION_CARRIED_KEYS = [
  "commandKind",
  "source",
  "inputPresentation",
  "intent",
  "toolDisallowlist",
] as const;

/**
 * admission：同 id 再次 admission 视为「编辑」——整行替换但保留首次的排队位置与排队时间。
 * 有序 Map 上的 `set` 对既有键不改插入序，正好表达「原位更新」。
 */
export function queueAdmissionChanges(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjectionChanges {
  const payload = event.payload as TurnSteerQueuedPayload;
  const rows = toQueueRows(projection.pendingSteerInputs);
  const previous = rows.get(payload.pendingInputId);

  const admitted: PendingSteerInputInfo = {
    pendingInputId: payload.pendingInputId,
    ...mergeDefinedFields(
      payload as unknown as PendingSteerInputInfo,
      previous,
      ADMISSION_CONTENT_KEYS,
    ),
    ...mergeDefinedFields(
      payload as unknown as PendingSteerInputInfo,
      previous,
      ADMISSION_CARRIED_KEYS,
    ),
    queuedAt: previous?.queuedAt ?? event.timestamp,
    traceId: event.traceId,
  };
  rows.set(admitted.pendingInputId, admitted);
  return { pendingSteerInputs: toRowArray(rows) };
}

/**
 * delivery：只改目标行的 intent。payload 没给 intent 时按旧 intent 补投递结论；
 * 旧行本来就没有 intent 就保持没有——凭空造一个 intent 会改变该队列项的授权语义。
 */
export function queueDeliveryChanges(
  projection: SessionProjection,
  payload: TurnSteerDeliveryChangedPayload,
): SessionProjectionChanges {
  const rows = toQueueRows(projection.pendingSteerInputs);
  const row = rows.get(payload.pendingInputId);
  if (!row) return { pendingSteerInputs: toRowArray(rows) };

  const incoming = payload.intent;
  const delivered =
    incoming === undefined || incoming === null
      ? row.intent && {
          ...row.intent,
          admittedDelivery: payload.admittedDelivery,
          fallbackReasonCode: payload.fallbackReasonCode,
        }
      : incoming;
  rows.set(row.pendingInputId, { ...row, intent: delivered });
  return { pendingSteerInputs: toRowArray(rows) };
}

/**
 * order：按给出的 id 顺序取行，未列出的行按原排队序接在后面。
 * 顺带把有 intent 的行写成从 0 起的 `queuePosition`；没有 intent 的行不写，避免产生半个队列位置。
 */
export function queueOrderChanges(
  projection: SessionProjection,
  payload: TurnSteerReorderedPayload,
): SessionProjectionChanges {
  const rows = toQueueRows(projection.pendingSteerInputs);
  const requested = new Set(payload.orderedPendingInputIds);

  const leading = payload.orderedPendingInputIds
    .map((id) => rows.get(id))
    .filter((row): row is PendingSteerInputInfo => row !== undefined);
  const trailing = toRowArray(rows).filter((row) => !requested.has(row.pendingInputId));

  return {
    pendingSteerInputs: [...leading, ...trailing].map((row, queuePosition) =>
      row.intent ? { ...row, intent: { ...row.intent, queuePosition } } : row,
    ),
  };
}

/** removal：按 id 从有序 Map 里删键；不在名单里的行原样保留。 */
export function queueRemovalChanges(
  projection: SessionProjection,
  pendingInputIds: readonly string[],
): SessionProjectionChanges {
  const rows = toQueueRows(projection.pendingSteerInputs);
  for (const pendingInputId of pendingInputIds) rows.delete(pendingInputId);
  return { pendingSteerInputs: toRowArray(rows) };
}

/**
 * 模式变更：写 mode 与 planEnabled；带 permissionGrant 时把被放行的队列项 intent.mode 提升为 yolo。
 * 只有「在放行名单里」且「本来就有 intent」的行才提升，没有 intent 的行不参与模式授权。
 */
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
  changes.pendingSteerInputs = projection.pendingSteerInputs.map((row) =>
    row.intent && grantedIds.has(row.pendingInputId)
      ? { ...row, intent: { ...row.intent, mode: "yolo" as const } }
      : row,
  );
  return changes;
}
