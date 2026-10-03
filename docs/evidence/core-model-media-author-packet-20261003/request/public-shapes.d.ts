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

// RuntimeInputPresentation existing contract union:
// user_steer, coordinator_steer, coordinator_input, subagent_reply_steer,
// subagent_reply, task_notification_steer, task_notification.
// RuntimeMessageSource/SystemReminderSource stay existing imported types/registry.
// Extension enumerable fields may occur and survive only specified shallow spreads.

import type { RuntimeMessageMessageEntry } from "../../agent/message-history.js";
type SystemReminderDeliveryChannel = "request_prefix" | "current_turn" | "tool_result" | "history_continuity" | "mid_turn_event" | "real_user";
type SystemReminderLifecycle = "request_prefix" | "per_current_turn" | "runtime_local" | "tool_result" | "resume_history" | "mid_turn_event" | "real_user";
type SystemReminderProviderVisibility = "provider_visible" | "provider_hidden";
interface SystemReminderSourceDescriptor {
    source: SystemReminderSource;
    channel: SystemReminderDeliveryChannel;
    lifecycle: SystemReminderLifecycle;
    isMeta: boolean;
    providerVisibility: SystemReminderProviderVisibility;
    evidenceLabel: string;
}
