import type { Logger, ModelInputMessage, TraceContext } from "../deps.js";
interface CompactMediaPlaceholderProjection {
    messages: ModelInputMessage[];
    replacedMediaCount: number;
}
export declare function projectCompactMediaForRetry(messages: readonly ModelInputMessage[]): CompactMediaPlaceholderProjection;
export declare function logCompactMediaRetryProjection(logger: Logger | undefined, traceContext: TraceContext, projection: CompactMediaPlaceholderProjection): void;
export {};
