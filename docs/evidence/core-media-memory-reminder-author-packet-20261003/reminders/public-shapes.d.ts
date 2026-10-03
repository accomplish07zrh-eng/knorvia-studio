// Selected actual shapes and opaque authoritative owner types. No dependency implementation.
// Original type owner: apps/cli/packages/core/src/agent/message-history.ts
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
export declare function systemReminderRuntimeMetadata(source: SystemReminderSource): RuntimeMessageMetadata;
export declare function legacySyntheticRuntimeMetadata(): RuntimeMessageMetadata;
export declare function todoReminderRuntimeMetadata(): RuntimeMessageMetadata;
export declare function isRuntimeAttachmentEntry(input: ModelInputMessage | RuntimeMessageEntry): input is RuntimeAttachmentEntry;
export type CollaborationMode=import("../deps.js").CollaborationMode;
export type OutputStylePromptConfig=import("../deps.js").OutputStylePromptConfig;
export type SyntheticUserMessageSource=import("../deps.js").SyntheticUserMessageSource;
export type TodoItem=import("../deps.js").TodoItem;
