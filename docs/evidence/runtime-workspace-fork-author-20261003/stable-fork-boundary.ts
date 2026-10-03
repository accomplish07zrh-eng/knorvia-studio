import {
    SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
    type MessageId,
    type MessageProjectionAnchor,
    type TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StableConversationForkGoalBoundary } from "../types.js";

export async function persistStableForkCompletionBoundary(
    runtime: AgentRuntimeInternal,
    input: {
        boundaryMessageId: MessageId;
        startMessageId: MessageId;
        historyRoundCount: number;
        traceContext: TraceContext;
    },
): Promise<void> {
    const store = runtime.sessionStore;
    if (!store) return;

    const messages = await store.messages({ sessionID: runtime.sessionId });
    let boundaryIndex = -1;
    for (let index = 0; index < messages.length; index++) {
        const info = messages[index].info;
        if (
            info.id === input.boundaryMessageId &&
            info.role === "assistant" &&
            !info.error &&
            info.time.completed !== undefined
        ) {
            boundaryIndex = index;
        }
    }

    let startIndex = -1;
    for (let index = 0; index <= boundaryIndex; index++) {
        if (messages[index].info.id === input.startMessageId) startIndex = index;
    }
    if (startIndex < 0 || boundaryIndex < startIndex) return;

    const boundary = messages[boundaryIndex];
    if (
        boundary.info.role !== "assistant" ||
        boundary.info.error ||
        boundary.info.time.completed === undefined
    ) return;

    const orderedMessageIds = messages
        .slice(startIndex, boundaryIndex + 1)
        .map((message) => message.info.id);
    const prefixIds = new Set<string>(
        messages.slice(0, boundaryIndex + 1).map((message) => message.info.id),
    );
    const target = typeof store.readTarget === "function"
        ? await store.readTarget({ sessionID: runtime.sessionId })
        : null;

    let goalBoundary: StableConversationForkGoalBoundary = { kind: "none" };
    if (target) {
        const inheritedTarget = {
            ...target,
            activeInputId: null,
            activeRunStartedAtMs: null,
            activeRunLastSeenAtMs: null,
            time: { ...target.time },
        };
        const verificationEntryIds = await (async () => {
            const verificationStore = runtime.sessionStore;
            if (!verificationStore?.sessionEntries) return [];
            const entries = await verificationStore.sessionEntries({
                sessionID: runtime.sessionId,
                type: SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
            });
            const ids = [];
            for (const entry of entries) {
                const data = entry.data;
                if (!data || typeof data !== "object" || Array.isArray(data)) continue;
                const payload = (data as Record<string, unknown>).payload;
                if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
                const fields = payload as Record<string, unknown>;
                const targetId = typeof fields.targetId === "string" ? fields.targetId : undefined;
                const anchorAssistantMessageId = typeof fields.anchorAssistantMessageId === "string"
                    ? fields.anchorAssistantMessageId
                    : undefined;
                if (
                    targetId === target.targetID &&
                    (!anchorAssistantMessageId || prefixIds.has(anchorAssistantMessageId))
                ) ids.push(entry.id);
            }
            return ids;
        })();
        goalBoundary = { kind: "snapshot", target: inheritedTarget, verificationEntryIds };
    }

    const anchor: MessageProjectionAnchor = {
        ...boundary.info.anchor,
        ...(input.traceContext.turnId ? { turnId: input.traceContext.turnId } : {}),
        historyRoundCount: input.historyRoundCount,
        orderedMessageIds,
        boundaryMessageId: input.boundaryMessageId,
        goalBoundary,
    };
    await store.saveMessage({ ...boundary.info, anchor });
}
