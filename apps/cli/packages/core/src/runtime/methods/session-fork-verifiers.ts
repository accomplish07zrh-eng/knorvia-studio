import { randomUUID } from "node:crypto";
import {
  SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  type MessageId,
  type SessionEntryInfo,
  type SessionId,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { asRecord, requiredMapping, type ForkIdentities } from "./session-fork-identities.js";
import { stableForkError } from "./session-fork-transcript.js";

export function selectAtomicVerifiers(
  entries: SessionEntryInfo[] | undefined,
  ids: Set<string>,
): SessionEntryInfo[] {
  if (!entries) throw stableForkError("Stable fork verifier boundary cannot be loaded");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [...ids].map((id) => {
    const entry = byId.get(id);
    if (!entry)
      throw stableForkError("Stable fork verifier boundary references missing entries", {
        verificationEntryId: id,
      });
    return entry;
  });
}

export function cloneAtomicVerifier(
  entry: SessionEntryInfo,
  forkedSessionId: SessionId,
  ids: ForkIdentities,
) {
  const data = asRecord(entry.data);
  const payload = asRecord(data.payload);
  if (typeof payload.targetId !== "string" || typeof payload.verificationId !== "string") {
    throw stableForkError("Stable fork verifier entry has invalid identity", { entryId: entry.id });
  }
  const clonedPayload = {
    ...payload,
    targetId: requiredMapping(ids.targetIdMap, payload.targetId, "verifier target"),
    verificationId: requiredMapping(
      ids.verificationIdMap,
      payload.verificationId,
      "verification id",
    ),
    ...(typeof payload.anchorAssistantMessageId === "string"
      ? {
          anchorAssistantMessageId: requiredMapping(
            ids.messageIdMap,
            payload.anchorAssistantMessageId as MessageId,
            "verifier assistant anchor",
          ),
        }
      : {}),
    ...(typeof payload.anchorTurnId === "string"
      ? {
          anchorTurnId: requiredMapping(
            ids.turnIdMap,
            payload.anchorTurnId,
            "verifier turn anchor",
          ),
        }
      : {}),
  };
  const childEntryId = requiredMapping(ids.verificationEntryIdMap, entry.id, "verifier entry");
  return {
    entry: {
      ...entry,
      id: childEntryId,
      sessionID: forkedSessionId,
      data: {
        ...data,
        eventId: randomUUID(),
        payload: clonedPayload,
        forkOrigin: {
          entryId: entry.id,
          eventId: data.eventId,
          verificationId: payload.verificationId,
        },
      },
    } as SessionEntryInfo,
    payload: clonedPayload,
  };
}

function cloneLegacyVerifier(
  entry: SessionEntryInfo,
  options: {
    forkedSessionId: SessionId;
    messageIdMap: Map<MessageId, MessageId>;
    parentTargetId: string;
  },
) {
  const data = asRecord(entry.data);
  const payload = asRecord(data.payload);
  if (payload.targetId !== options.parentTargetId) return null;
  const anchor =
    typeof payload.anchorAssistantMessageId === "string"
      ? payload.anchorAssistantMessageId
      : undefined;
  if (anchor && !options.messageIdMap.has(anchor as MessageId)) return null;
  const childAnchor = anchor ? options.messageIdMap.get(anchor as MessageId) : undefined;
  const clonedPayload: Record<string, unknown> = {
    ...payload,
    ...(childAnchor ? { anchorAssistantMessageId: childAnchor } : {}),
  };
  if (typeof payload.anchorTurnId === "string") {
    delete clonedPayload.anchorTurnId;
    clonedPayload.originAnchorTurnId = payload.anchorTurnId;
  }
  const eventId = randomUUID();
  return {
    entry: {
      ...entry,
      id: `fork_goal_verify_${eventId}`,
      sessionID: options.forkedSessionId,
      data: { ...data, eventId, payload: clonedPayload },
    } as SessionEntryInfo,
    payload: clonedPayload,
  };
}

export async function copyLegacyVerifiers(
  store: NonNullable<AgentRuntimeInternal["sessionStore"]>,
  options: {
    forkedSessionId: SessionId;
    messageIdMap: Map<MessageId, MessageId>;
    parentSessionId: SessionId;
    parentTargetId: string;
    verificationEntryIds?: Set<string>;
  },
): Promise<Record<string, any>[]> {
  if (!store.sessionEntries || !store.saveSessionEntry) {
    if (options.verificationEntryIds?.size)
      throw stableForkError("Stable fork verifier boundary cannot be loaded", {
        verificationEntryIds: [...options.verificationEntryIds],
      });
    return [];
  }
  const entries = await store.sessionEntries({
    sessionID: options.parentSessionId,
    type: SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  });
  const remaining = options.verificationEntryIds && new Set(options.verificationEntryIds);
  const copied: Record<string, any>[] = [];
  for (const entry of entries) {
    if (options.verificationEntryIds && !options.verificationEntryIds.has(entry.id)) continue;
    remaining?.delete(entry.id);
    const clone = cloneLegacyVerifier(entry, options);
    if (!clone) {
      if (options.verificationEntryIds)
        throw stableForkError("Stable fork verifier is outside the fixed transcript cut", {
          verificationEntryId: entry.id,
        });
      continue;
    }
    await store.saveSessionEntry(clone.entry);
    copied.push(clone.payload);
  }
  if (remaining?.size)
    throw stableForkError("Stable fork verifier boundary references missing entries", {
      verificationEntryIds: [...remaining],
    });
  return copied;
}
