// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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
  payload: string;
  admitted_sequence: number;
  promoted_sequence: number | null;
  promoted_message_id: string | null;
  status: string;
  status_reason: string | null;
  time_created: number;
  time_updated: number;
}

type InputPatch = Parameters<
  NonNullable<SessionStorePort["updateSessionInputs"]>
>[0]["updates"][number];

export function isInputDocument(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decodeInputPayload(encoded: string): SessionInputRecord["payload"] {
  try {
    const decoded: unknown = JSON.parse(encoded);
    return isInputDocument(decoded)
      ? ({ text: "", ...decoded } as SessionInputRecord["payload"])
      : { text: "" };
  } catch {
    return { text: "" };
  }
}

export function editInputPayload(
  encoded: string,
  patch: InputPatch,
): SessionInputRecord["payload"] {
  const payload = decodeInputPayload(encoded);
  if (patch.text !== undefined) payload.text = patch.text;
  if (isInputDocument(payload.conversationInputIntent)) {
    const canonical = { ...payload.conversationInputIntent };
    if (patch.text !== undefined) canonical.text = patch.text;
    if (patch.queuePosition !== undefined || patch.intent?.queuePosition !== undefined) {
      canonical.order = {
        ...(isInputDocument(canonical.order) ? canonical.order : {}),
        queuePosition: patch.queuePosition ?? patch.intent?.queuePosition,
      };
    }
    if (patch.intent) {
      canonical.delivery = {
        requested: patch.intent.requestedDelivery,
        admitted: patch.intent.admittedDelivery,
        ...(patch.intent.fallbackReasonCode
          ? { fallbackReasonCode: patch.intent.fallbackReasonCode }
          : {}),
      };
      if (patch.intent.fallbackReasonCode) {
        canonical.steer = { state: "fellBack", reasonCode: patch.intent.fallbackReasonCode };
      }
    }
    payload.conversationInputIntent = canonical;
  }
  if (patch.intent) {
    payload.intent = patch.intent;
  } else if (patch.queuePosition !== undefined && isInputDocument(payload.intent)) {
    payload.intent = { ...payload.intent, queuePosition: patch.queuePosition };
  }
  return payload;
}

export function projectSessionInput(row: SessionInputRow): SessionInputRecord {
  const status: SessionInputStatus =
    row.status === "promoted" ||
    row.status === "cancelled" ||
    row.status === "discarded" ||
    row.status === "failed"
      ? row.status
      : "admitted";
  return {
    id: row.id,
    sessionID: row.session_id as SessionId,
    kind: row.kind,
    delivery: row.delivery === "startNow" || row.delivery === "guide" ? row.delivery : "queue",
    payload: decodeInputPayload(row.payload),
    admittedSequence: row.admitted_sequence,
    ...(row.promoted_sequence !== null ? { promotedSequence: row.promoted_sequence } : {}),
    ...(row.promoted_message_id !== null
      ? { promotedMessageID: row.promoted_message_id as MessageId }
      : {}),
    status,
    ...(row.status_reason !== null ? { statusReason: row.status_reason } : {}),
    time: { created: row.time_created, updated: row.time_updated },
  };
}
