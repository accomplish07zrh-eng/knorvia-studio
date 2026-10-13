// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 输入文档：payload 的容错解码、编辑补丁的应用、以及 DB 行到契约记录的投影。
// 列名、状态/投递白名单与补丁字段语义都属于可观察契约，逐字保留。

import type {
  MessageId,
  SessionId,
  SessionInputRecord,
  SessionInputStatus,
  SessionStorePort,
} from "@knorvia/contracts";

export interface SessionInputRow {
  id: string;
  session_id: string;
  kind: string;
  delivery: string;
  status: string;
  status_reason: string | null;
  payload: string;
  admitted_sequence: number;
  promoted_sequence: number | null;
  promoted_message_id: string | null;
  time_created: number;
  time_updated: number;
}

type InputPatch = Parameters<
  NonNullable<SessionStorePort["updateSessionInputs"]>
>[0]["updates"][number];

const EMPTY_PAYLOAD: SessionInputRecord["payload"] = { text: "" };
const STATUS_VALUES: readonly SessionInputStatus[] = [
  "promoted",
  "cancelled",
  "discarded",
  "failed",
];
const DELIVERY_VALUES = ["startNow", "guide"] as const;

export function isInputDocument(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  return !Array.isArray(value);
}

/** payload 解码：非 JSON 或非对象一律回落成空文本，绝不抛错。 */
export function decodeInputPayload(encoded: string): SessionInputRecord["payload"] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return { ...EMPTY_PAYLOAD };
  }
  if (!isInputDocument(parsed)) return { ...EMPTY_PAYLOAD };
  const payload = {} as SessionInputRecord["payload"];
  payload.text = "";
  Object.assign(payload, parsed);
  return payload;
}

/** 规范化的会话输入意图：把补丁里的排序与投递信息落到 canonical 对象上。 */
function applyCanonicalPatch(
  canonical: Record<string, unknown>,
  patch: InputPatch,
): Record<string, unknown> {
  const next = { ...canonical };
  if (patch.text !== undefined) next.text = patch.text;
  const queuePosition = patch.queuePosition ?? patch.intent?.queuePosition;
  if (patch.queuePosition !== undefined || patch.intent?.queuePosition !== undefined) {
    const order = isInputDocument(next.order) ? next.order : {};
    next.order = { ...order, queuePosition };
  }
  if (!patch.intent) return next;
  const fallbackReasonCode = patch.intent.fallbackReasonCode;
  const delivery = {} as Record<string, unknown>;
  delivery.requested = patch.intent.requestedDelivery;
  delivery.admitted = patch.intent.admittedDelivery;
  if (fallbackReasonCode) delivery.fallbackReasonCode = fallbackReasonCode;
  next.delivery = delivery;
  if (fallbackReasonCode) next.steer = { state: "fellBack", reasonCode: fallbackReasonCode };
  return next;
}

/** 顶层意图：给了完整 intent 就整份替换，只给 queuePosition 时就地补字段。 */
function applyTopLevelIntent(payload: SessionInputRecord["payload"], patch: InputPatch): void {
  if (patch.intent) {
    payload.intent = patch.intent;
    return;
  }
  if (patch.queuePosition === undefined) return;
  if (!isInputDocument(payload.intent)) return;
  payload.intent = { ...payload.intent, queuePosition: patch.queuePosition };
}

export function editInputPayload(
  encoded: string,
  patch: InputPatch,
): SessionInputRecord["payload"] {
  const payload = decodeInputPayload(encoded);
  if (patch.text !== undefined) payload.text = patch.text;
  if (isInputDocument(payload.conversationInputIntent)) {
    payload.conversationInputIntent = applyCanonicalPatch(payload.conversationInputIntent, patch);
  }
  applyTopLevelIntent(payload, patch);
  return payload;
}

/** 状态列白名单：表内四值照搬，其余（含历史脏数据）一律视为 admitted。 */
function statusOf(raw: string): SessionInputStatus {
  const status = raw as SessionInputStatus;
  return STATUS_VALUES.includes(status) ? status : "admitted";
}

function deliveryOf(raw: string): SessionInputRecord["delivery"] {
  const known = DELIVERY_VALUES as readonly string[];
  return known.includes(raw) ? (raw as SessionInputRecord["delivery"]) : "queue";
}

export function projectSessionInput(row: SessionInputRow): SessionInputRecord {
  const record = {} as SessionInputRecord;
  record.id = row.id;
  record.sessionID = row.session_id as SessionId;
  record.kind = row.kind;
  record.delivery = deliveryOf(row.delivery);
  record.payload = decodeInputPayload(row.payload);
  record.admittedSequence = row.admitted_sequence;
  if (row.promoted_sequence !== null) record.promotedSequence = row.promoted_sequence;
  if (row.promoted_message_id !== null) {
    record.promotedMessageID = row.promoted_message_id as MessageId;
  }
  record.status = statusOf(row.status);
  if (row.status_reason !== null) record.statusReason = row.status_reason;
  record.time = { created: row.time_created, updated: row.time_updated };
  return record;
}
