import type { RuntimeInputPresentation } from "@knorvia/contracts";
import type { MessageId, MessagePart, MessageVisibility, Model, SessionId, SessionProjection, SessionStorePort, TraceContext, SyntheticUserMessageSource, TurnInputIntentMetadata, TurnExecutionKind } from "../deps.js";
import { toTokenUsageInfo } from "../helpers/index.js";
import type { ResolvedTurnAttachment } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function persistUserPrompt(this: AgentRuntimeInternal, messageID: MessageId, input: string, attachments: ResolvedTurnAttachment[] | undefined, traceContext: TraceContext, options?: {
    steerDelivery?: "guide" | "queue";
    inputPresentation?: RuntimeInputPresentation;
    sessionInputId?: string;
    sourceCommandId?: string;
    clientId?: string;
    intent?: TurnInputIntentMetadata;
    executionKind?: TurnExecutionKind;
    epilogueStart?: number;
}): Promise<void>;
export declare function persistSyntheticUserNotice(this: AgentRuntimeInternal, messageID: MessageId, text: string, traceContext: TraceContext): Promise<void>;
export declare function persistSyntheticUserNoticeForSession(this: AgentRuntimeInternal, options: {
    messageID: MessageId;
    sessionId: SessionId;
    source: SyntheticUserMessageSource;
    text: string;
    traceContext: TraceContext;
    metadata?: Record<string, unknown>;
    visibility?: MessageVisibility;
}): Promise<void>;
export declare function persistAssistantMessage(this: AgentRuntimeInternal, messageID: MessageId, parentID: MessageId, created: number, update: {
    completed?: number;
    error?: {
        name: string;
        data?: Record<string, unknown>;
    };
    finish?: string;
    tokens?: ReturnType<typeof toTokenUsageInfo>;
} | undefined, traceContext: TraceContext, model?: Model): Promise<void>;
export declare function persistMessage(this: AgentRuntimeInternal, input: Parameters<SessionStorePort["saveMessage"]>[0], traceContext: TraceContext, copyFrom?: Parameters<SessionStorePort["saveMessage"]>[1]): Promise<void>;
export declare function persistPart(this: AgentRuntimeInternal, input: MessagePart, traceContext: TraceContext, copyFrom?: Parameters<SessionStorePort["savePart"]>[1]): Promise<void>;
export declare function rebuildProjection(this: AgentRuntimeInternal): Promise<SessionProjection>;
