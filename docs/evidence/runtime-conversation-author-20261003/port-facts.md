# Conversation binding facts

MessageWithParts {info:MessageInfo,parts:MessagePart[]}; MessageInfo has id:MessageId,role:user|assistant|system (other roles possible). Inline pasted image uses attachment.contentBlock.source?.kind, not attachment.source. ModelMessageContent is string or array of blocks; text {type:text,text:string}; image {type:image,source?:{kind:inline|...,...}},video {type:video,...}; other blocks preserved. attachment.metadata.preview may include text:string plus partialViewNotice/startLine/totalLines/truncated. Pass metadata.preview SAME object to prompt helper. attachment.source?.text.value is the read-like label.

API seam agent/session-history-hydrator.d.ts
```ts
export declare function activeSessionMessages(messages: MessageWithParts[], options?: {
    branchCutAfterMessageId?: MessageId;
    includeCompactPreservedSegment?: boolean;
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}): MessageWithParts[];
```
API seam system-reminder/prompt-attachment.d.ts
```ts
export declare function buildPromptAttachmentBlocks(input: PromptAttachmentReminderInput): ModelMessageContentBlock[];
export declare function buildPromptAttachmentReminderBodies(input: PromptAttachmentReminderInput): string[];
```
API seam agent/message-history.d.ts
```ts
export declare function realUserRuntimeMetadata(): RuntimeMessageMetadata;
export declare function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry;
export declare function createRuntimeAssistantEntry(content: string, toolCalls?: readonly ToolCallInput[], reasoning?: readonly ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): RuntimeMessageMessageEntry;
```
