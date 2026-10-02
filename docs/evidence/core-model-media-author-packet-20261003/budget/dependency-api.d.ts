// Bounded signatures from distinct original modules; opaque aliases remain original module types.
import type { TraceContext as ContractTraceContext, LogContext as ContractLogContext } from "../deps.js";
import type { CoreError, CoreErrorType, ModelMessageContent, ModelInputMessage, TraceContext, LogContext } from "../deps.js";
import type { ModelMessageContentBlock } from "../deps.js";
export declare function createCoreError(type: CoreErrorType, message: string, options?: Options): CoreError;
export declare function modelMessageContentToText(content: ModelMessageContent): string;
export declare function traceContextToLogContext(context: ContractTraceContext): ContractLogContext;
export declare function officialCuaImageRefIndexesForUnavailableMedia(content: readonly ModelMessageContentBlock[], unavailableMediaIndexes: ReadonlySet<number>): Set<number>;
export declare function officialCuaRasterUnavailableBlock(): ModelMessageContentBlock;
export declare function findLatestRealUserMessageIndex(messages: RunModelTextRequestOptions["messages"]): number;

// ./media-capability.js (same allocated queue, public API only):
import type { Logger, ModelInputFormat, ModelInputMessage, TraceContext } from "../deps.js";
export interface MediaCapabilityProjection {
    messages: ModelInputMessage[];
    omittedImageCount: number;
    omittedMediaCount: number;
    omittedPdfCount: number;
    omittedVideoCount: number;
    retainedMediaCount: number;
}
export declare function projectMessagesForInputFormat(messages: ModelInputMessage[], inputFormat: ModelInputFormat): MediaCapabilityProjection;
export declare function logMediaCapabilityProjection(logger: Logger | undefined, traceContext: TraceContext, projection: MediaCapabilityProjection, options: {
    event: string;
    message: string;
    model: string;
}): void;

interface Options { cause?: Error; context?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean; }
