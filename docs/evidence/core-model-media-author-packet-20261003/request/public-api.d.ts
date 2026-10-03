import type { ModelInputMessage, RuntimeMessageEntry } from "../../agent/message-history.js";
export interface ProviderRequestMessageProjectionResult {
    messages: ModelInputMessage[];
    sourceEntries: Array<RuntimeMessageEntry | undefined>;
    diagnostics: {
        bubbledAttachmentEntryCount: number;
        latestRealUserMessageIndex?: number;
        strippedRuntimeMetaCount: number;
        cacheControlIndex?: number;
    };
}
export declare function buildProviderRequestMessages(input: {
    entries: readonly RuntimeMessageEntry[];
    applyCacheControl?: boolean;
    skipCacheWrite?: boolean;
    useMidConversationSystem?: boolean;
}): ProviderRequestMessageProjectionResult;
