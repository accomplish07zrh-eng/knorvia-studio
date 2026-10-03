import { randomUUID } from "node:crypto";
import {
  createMessageId,
  createPartId,
  createToolCallId,
  createTurnId,
  type MessageId,
  type MessagePart,
  type MessageWithParts,
  type SessionEntryInfo,
} from "../deps.js";
import type { StableConversationForkGoalBoundary } from "../types.js";
import { stableForkError } from "./session-fork-transcript.js";

export function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function requiredMapping<K, V>(map: Map<K, V>, id: K, field: string): V {
  const mapped = map.get(id);
  if (!mapped) throw stableForkError(`Stable fork cannot remap ${field}`, { id });
  return mapped;
}

export function referencedVerifierIds(
  messages: MessageWithParts[],
  explicit?: StableConversationForkGoalBoundary,
) {
  const boundaries = messages.map((message) => message.info.anchor?.goalBoundary);
  if (explicit) boundaries.push(explicit);
  const verifierIds = new Set<string>();
  for (const boundary of boundaries) {
    if (boundary?.kind !== "snapshot") continue;
    for (const id of boundary.verificationEntryIds) verifierIds.add(id);
  }
  return verifierIds;
}

export function goalSnapshotsForFork(
  messages: MessageWithParts[],
  explicit?: StableConversationForkGoalBoundary,
) {
  const boundaries = messages.map((message) => message.info.anchor?.goalBoundary);
  if (explicit) boundaries.push(explicit);
  const targets = new Map<string, any>();
  for (const boundary of boundaries) {
    if (boundary?.kind === "snapshot") targets.set(boundary.target.targetID, boundary.target);
  }
  return [...targets.values()];
}

export function allocateForkIdentities(
  messages: MessageWithParts[],
  goalSnapshots: any[],
  entries: SessionEntryInfo[],
) {
  const messageIdMap = new Map<MessageId, MessageId>();
  const partIdMap = new Map<MessagePart["id"], MessagePart["id"]>();
  const turnIdMap = new Map<string, string>();
  const productTurnIdMap = new Map<string, string>();
  const targetIdMap = new Map<string, string>();
  const verificationEntryIdMap = new Map<string, string>();
  const verificationIdMap = new Map<string, string>();
  const toolCallIdMap = new Map<string, string>();
  const hiddenMessageId = createMessageId();
  const hiddenPartId = createPartId();
  const noticeMessageId = createMessageId();
  const noticePartId = createPartId();
  const noticeTurnId = createTurnId();
  const noticeProductTurnId = String(hiddenMessageId);
  const addTurn = (id: unknown) => {
    if (typeof id === "string" && id && !turnIdMap.has(id)) turnIdMap.set(id, createTurnId());
  };
  const addTarget = (id: string) => {
    if (!targetIdMap.has(id)) targetIdMap.set(id, `fork_target_${randomUUID()}`);
  };
  const addVerification = (id: string) => {
    if (!verificationIdMap.has(id)) verificationIdMap.set(id, `fork_verify_${randomUUID()}`);
  };
  for (const message of messages) {
    messageIdMap.set(message.info.id, createMessageId());
    for (const part of message.parts) {
      partIdMap.set(part.id, createPartId());
      if (part.type === "tool") {
        toolCallIdMap.set(part.callID, String(createToolCallId()));
        if (part.state.status === "completed") {
          for (const attachment of part.state.attachments ?? [])
            partIdMap.set(attachment.id, createPartId());
        }
      }
    }
  }
  for (const message of messages) {
    addTurn(message.info.anchor?.turnId);
    const product = message.info.anchor?.productTurnId;
    if (typeof product === "string" && product && !productTurnIdMap.has(product)) {
      productTurnIdMap.set(
        product,
        String(messageIdMap.get(product as MessageId) ?? createTurnId()),
      );
    }
    for (const part of message.parts) {
      if (part.type === "timeline") {
        addTurn(part.anchorTurnId);
        if (part.timelineType === "goal_verification") {
          addTarget(part.targetId);
          addVerification(part.verificationId);
        }
      }
      if (part.type === "compaction") addTurn(part.compactBoundary?.turnId);
    }
  }
  for (const target of goalSnapshots) addTarget(target.targetID);
  for (const entry of entries) {
    verificationEntryIdMap.set(entry.id, `fork_goal_verify_${randomUUID()}`);
    const payload = asRecord(asRecord(entry.data).payload);
    if (typeof payload.verificationId === "string") addVerification(payload.verificationId);
    addTurn(payload.anchorTurnId);
  }
  return {
    messageIdMap,
    partIdMap,
    turnIdMap,
    productTurnIdMap,
    targetIdMap,
    verificationEntryIdMap,
    verificationIdMap,
    toolCallIdMap,
    hiddenMessageId,
    hiddenPartId,
    noticeMessageId,
    noticePartId,
    noticeTurnId,
    noticeProductTurnId,
  };
}

export type ForkIdentities = ReturnType<typeof allocateForkIdentities>;
