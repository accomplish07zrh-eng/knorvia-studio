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
export declare function buildPromptAttachmentBlocks(input: PromptAttachmentReminderInput): ModelMessageContentBlock[];
export declare function buildPromptAttachmentReminderBodies(input: PromptAttachmentReminderInput): string[];
