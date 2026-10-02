// Original public port/type owner: apps/cli/packages/contracts/src/model/index.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { ProviderNativeToolSpec, ToolExecutionMode, ToolPermissionSpec, ToolResultBudget } from "../tools/contract.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { ModelApiCallObservation, ModelApiErrorPhase, ResolvedModelApiCallObservation } from "../telemetry/index.js";
export type AttachmentKind = "local_file" | "resource" | "inline";
export interface AttachmentRef {
    id: string;
    kind: AttachmentKind;
    uri?: string;
    path?: string;
    mimeType?: string;
    sizeBytes?: number;
    sha256?: string;
    placeholder?: string;
}
export interface ModelTextContentBlock {
    type: "text";
    text: string;
}
export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelImageContentBlock {
    type: "image";
    mediaType: string;
    dataUrl: string;
    detail?: "auto" | "low" | "high" | "original";
    source?: AttachmentRef;
}
export interface ModelFileContentBlock {
    type: "file";
    mediaType: string;
    name?: string;
    uri?: string;
    dataUrl?: string;
    text?: string;
    source?: AttachmentRef;
}
export interface ModelVideoContentBlock {
    type: "video";
    mediaType: string;
    dataUrl: string;
    source?: AttachmentRef;
}
export interface ModelResourceLinkContentBlock {
    type: "resource_link";
    uri: string;
    name?: string;
    title?: string;
}
export type ModelMessageContentBlock = ModelTextContentBlock | ModelReasoningContentBlock | ModelImageContentBlock | ModelVideoContentBlock | ModelFileContentBlock | ModelResourceLinkContentBlock;
export type ModelMessageContent = string | ModelMessageContentBlock[];
export declare function modelMessageContentToText(content: ModelMessageContent): string;

// Original public port/type owner: apps/cli/packages/contracts/src/rewind/index.ts
import { z } from "zod";
import type { CompactBoundaryPayload } from "../compact/index.js";
import type { MessageId } from "../interfaces/shared.js";
export interface ActiveConversationBranchOptions {
    branchCutAfterMessageId?: MessageId;
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}
export declare function selectActiveConversationBranch<T extends {
    info: {
        id: MessageId;
    };
}>(messages: readonly T[], options?: ActiveConversationBranchOptions): T[];

// Original public port/type owner: apps/cli/packages/core/src/agent/message-history.ts
import { type RuntimeInputPresentation, type ModelCacheControl, type ModelMessageContent, type Model, type ModelReasoningContentBlock, type TokenUsageInfo } from "@knorvia/contracts";
import { type SystemReminderSource } from "../system-reminder/source.js";
export interface ToolCallInput {
    id: string;
    name: string;
    input: unknown;
}
export type ReasoningContentInput = ModelReasoningContentBlock;
export interface ModelInputMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ToolCallInput[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: Model["providerId"];
    modelId?: Model["modelId"];
}
export type RuntimeMessageSource = SystemReminderSource | "shared_context" | "real_user" | "legacy_synthetic";
export interface RuntimeMessageMetadata {
    source: RuntimeMessageSource;
    inputPresentation?: RuntimeInputPresentation;
}
export interface RuntimeMessageMessageEntry {
    kind?: "message";
    message: ModelInputMessage;
    metadata?: RuntimeMessageMetadata;
    tokens?: TokenUsageInfo;
    queryScope?: "output_token_continuation";
}
export interface RuntimeAttachmentEntry {
    kind: "attachment";
    content: string;
    cacheControl?: ModelCacheControl;
    metadata: RuntimeMessageMetadata;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export interface CacheStats {
    totalMessages: number;
    cachedMessages: number;
    lastCacheHit: boolean;
    cacheReadTokens?: number;
}
export interface MessageHistory {
    init(systemPromptOrMessages?: string | Array<ModelInputMessage | RuntimeMessageEntry>): void;
    addUser(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): void;
    addAttachment(source: SystemReminderSource, content: string): void;
    addEntries(entries: readonly RuntimeMessageEntry[]): void;
    addAssistant(content: string, toolCalls?: ToolCallInput[], reasoning?: ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): void;
    addToolResult(toolCallId: string, toolName: string, content: ModelMessageContent, success: boolean, isError?: boolean): void;
    borrowReadOnlyRuntimeEntries(): readonly RuntimeMessageEntry[];
    toRuntimeEntries(): RuntimeMessageEntry[];
    replaceMessages(messages: readonly (ModelInputMessage | RuntimeMessageEntry)[]): void;
    getMessageCount(): number;
    getCacheStats(): CacheStats;
    setCacheHit(tokens?: number): void;
    setCacheMiss(): void;
    reset(): void;
}
export declare function systemReminderRuntimeMetadata(source: SystemReminderSource): RuntimeMessageMetadata;
export declare function realUserRuntimeMetadata(): RuntimeMessageMetadata;
export declare function legacySyntheticRuntimeMetadata(): RuntimeMessageMetadata;
export declare function todoReminderRuntimeMetadata(): RuntimeMessageMetadata;
export declare function isKnownSystemReminderSource(value: unknown): value is SystemReminderSource;
export declare function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry;

// Original public port/type owner: apps/cli/packages/core/src/agent/runtime-input-presentation.ts
import type { RuntimeMessageMetadata } from "./message-history.js";
export declare function runtimeInputMetadata(value: unknown): RuntimeMessageMetadata | undefined;

// Original public port/type owner: apps/cli/packages/core/src/agent/message-history-usage.ts
import type { TokenUsageInfo } from "@knorvia/contracts";
export interface PersistedTokenUsageBaseline {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    contextUsageTokens?: number;
    inputTokens: number;
    outputTokens: number;
}
export declare function persistedTokenUsageBaseline(tokens: TokenUsageInfo | undefined): PersistedTokenUsageBaseline | undefined;

// Original public port/type owner: apps/cli/packages/core/src/agent/compact-session.ts
import type { MessagePart, MessageWithParts } from "@knorvia/contracts";
export declare function compactActiveSessionMessages(messages: MessageWithParts[], boundaryIndex: number, includePreservedSegment: boolean): MessageWithParts[];
export declare function isActiveCompactionBoundaryPart(part: MessagePart): boolean;

// Original public port/type owner: apps/cli/packages/core/src/agent/tool-part-order.ts
import type { ToolPart } from "@knorvia/contracts";
export declare function selectToolPartsForHistory(parts: ToolPart[]): ToolPart[];

// Original public port/type owner: apps/cli/packages/core/src/system-reminder/source.ts
type SystemReminderDeliveryChannel = "request_prefix" | "current_turn" | "tool_result" | "history_continuity" | "mid_turn_event" | "real_user";
type SystemReminderLifecycle = "request_prefix" | "per_current_turn" | "runtime_local" | "tool_result" | "resume_history" | "mid_turn_event" | "real_user";
type SystemReminderProviderVisibility = "provider_visible" | "provider_hidden";
export type SystemReminderPrefixSource = (typeof SYSTEM_REMINDER_PREFIX_SOURCES)[number];
export type SystemReminderPersistedSource = (typeof SYSTEM_REMINDER_PERSISTED_SOURCES)[number];
export type SystemReminderPerRequestSource = (typeof SYSTEM_REMINDER_PER_REQUEST_SOURCES)[number];
export type SystemReminderSource = SystemReminderPrefixSource | SystemReminderPersistedSource | SystemReminderPerRequestSource;
interface SystemReminderSourceDescriptor {
    source: SystemReminderSource;
    channel: SystemReminderDeliveryChannel;
    lifecycle: SystemReminderLifecycle;
    isMeta: boolean;
    providerVisibility: SystemReminderProviderVisibility;
    evidenceLabel: string;
}
export declare function getSystemReminderDescriptor(source: SystemReminderSource): SystemReminderSourceDescriptor;
export declare function wrapSystemReminderForSource(source: SystemReminderSource, body: string | readonly string[]): string;

// Original public port/type owner: apps/cli/packages/core/src/system-reminder/prompt-attachment.ts
import { type ModelMessageContentBlock } from "@knorvia/contracts";
export interface PromptAttachmentReminderInput {
    content?: string;
    kind?: "file" | "inline_text" | "attachment";
    label?: string;
    preview?: {
        partialViewNotice?: string;
        startLine?: number;
        totalLines?: number;
        truncated?: boolean;
    };
    partialViewNotice?: string;
    startLine?: number;
    totalLines?: number;
    truncated?: boolean;
}
export declare function buildPromptAttachmentReminderBodies(input: PromptAttachmentReminderInput): string[];

import type { FilePart, ModelMessageContentBlock, ToolArtifactStorePort } from "@knorvia/contracts";
export declare function filePartToContentBlock(part: FilePart, artifactStore: ToolArtifactStorePort | undefined): Promise<ModelMessageContentBlock>;
export declare function projectPersistedToolMediaContent(value: unknown, attachmentBlocks: ModelMessageContentBlock[]): ModelMessageContentBlock[] | undefined;
