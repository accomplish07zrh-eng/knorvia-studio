import type { PendingSteerInputInfo, SessionProjection } from "../interfaces/session.port.js";
import type {
  SessionEvent,
  SessionModeChangedPayload,
  TurnSteerDeliveryChangedPayload,
  TurnSteerQueuedPayload,
  TurnSteerReorderedPayload,
} from "./session.events.js";
import type { SessionProjectionChanges } from "./session-projection-ledgers.js";

export function queueAdmissionChanges(
  projection: SessionProjection,
  event: SessionEvent,
): SessionProjectionChanges {
  const payload = event.payload as TurnSteerQueuedPayload;
  const index = projection.pendingSteerInputs.findIndex(
    (row) => row.pendingInputId === payload.pendingInputId,
  );
  const old = index < 0 ? undefined : projection.pendingSteerInputs[index];
  const next: PendingSteerInputInfo = {
    pendingInputId: payload.pendingInputId,
    input: payload.input,
    inputPreview: payload.inputPreview,
    inputSize: payload.inputSize,
    commandKind: payload.commandKind ?? old?.commandKind,
    source: payload.source ?? old?.source,
    inputPresentation: payload.inputPresentation ?? old?.inputPresentation,
    intent: payload.intent ?? old?.intent,
    toolDisallowlist: payload.toolDisallowlist ?? old?.toolDisallowlist,
    queuedAt: old?.queuedAt ?? event.timestamp,
    targetTurnId: payload.targetTurnId,
    traceId: event.traceId,
  };
  // 同 id 的编辑保持首个 admission 位置和时间，不移到队尾、不更新其他同 id 项。
  const rows = projection.pendingSteerInputs.slice();
  if (index < 0) rows.push(next);
  else rows[index] = next;
  return { pendingSteerInputs: rows };
}

export function queueDeliveryChanges(
  projection: SessionProjection,
  payload: TurnSteerDeliveryChangedPayload,
): SessionProjectionChanges {
  return {
    pendingSteerInputs: projection.pendingSteerInputs.map((row): PendingSteerInputInfo => {
      if (row.pendingInputId !== payload.pendingInputId) return row;
      let intent = payload.intent;
      if (intent === undefined || intent === null) {
        intent = row.intent
          ? {
              ...row.intent,
              admittedDelivery: payload.admittedDelivery,
              fallbackReasonCode: payload.fallbackReasonCode,
            }
          : undefined;
      }
      return { ...row, intent };
    }),
  };
}

export function queueOrderChanges(
  projection: SessionProjection,
  payload: TurnSteerReorderedPayload,
): SessionProjectionChanges {
  const rows = projection.pendingSteerInputs;
  const latestById = new Map<string, PendingSteerInputInfo>();
  for (const row of rows) latestById.set(row.pendingInputId, row);
  const requested = new Set(payload.orderedPendingInputIds);
  const ordered: PendingSteerInputInfo[] = [];
  payload.orderedPendingInputIds.forEach((id) => {
    const row = latestById.get(id);
    if (row) ordered.push(row);
  });
  rows.forEach((row) => {
    if (!requested.has(row.pendingInputId)) ordered.push(row);
  });
  return {
    pendingSteerInputs: ordered.map((row, queuePosition) => {
      const next = { ...row };
      if (row.intent) next.intent = { ...row.intent, queuePosition };
      return next;
    }),
  };
}

export function queueRemovalChanges(
  projection: SessionProjection,
  pendingInputIds: readonly string[],
): SessionProjectionChanges {
  return {
    pendingSteerInputs: projection.pendingSteerInputs.filter(
      (row) => !pendingInputIds.includes(row.pendingInputId),
    ),
  };
}

export function sessionModeChanges(
  projection: SessionProjection,
  payload: SessionModeChangedPayload,
): SessionProjectionChanges {
  const changes: SessionProjectionChanges = {
    mode: payload.mode,
    planEnabled: payload.planEnabled ?? payload.mode === "plan",
  };
  const grant = payload.permissionGrant;
  if (grant) {
    changes.pendingSteerInputs = projection.pendingSteerInputs.map((row) => {
      if (!grant.queueItemIds.includes(row.pendingInputId) || !row.intent) return row;
      return { ...row, intent: { ...row.intent, mode: "yolo" as const } };
    });
  }
  return changes;
}
