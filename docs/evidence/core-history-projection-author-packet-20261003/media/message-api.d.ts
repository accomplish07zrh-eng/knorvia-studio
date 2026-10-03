import type { ModelMessageContent, ModelCacheControl, Model, ModelReasoningContentBlock } from "@knorvia/contracts";
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
