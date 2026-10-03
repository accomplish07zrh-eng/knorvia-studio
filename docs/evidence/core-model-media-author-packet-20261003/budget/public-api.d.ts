import type { Logger, ModelInputFormat, ModelInputMessage, TraceContext } from "../deps.js";
import { type MediaCapabilityProjection } from "./media-capability.js";
export interface MediaBudgetProjection {
    messages: ModelInputMessage[];
    omittedMediaCount: number;
    projectedMediaBytes: number;
    retainedMediaCount: number;
    totalMediaBytes: number;
}
interface ModelMediaPolicyProjection {
    capabilityProjection: MediaCapabilityProjection;
    mediaBudgetProjection: MediaBudgetProjection;
    messages: ModelInputMessage[];
}
export declare function projectMessagesForModelMediaPolicy(messages: ModelInputMessage[], inputFormat: ModelInputFormat, options?: {
    latestRealUserMessageIndex?: number;
}): ModelMediaPolicyProjection;
interface MediaBudgetProjectionOptions {
    latestRealUserMessageIndex?: number;
    maxMediaBytes?: number;
    preserveLatestUserMedia?: boolean;
}
export declare function projectMessagesForMediaBudget(messages: ModelInputMessage[], options?: MediaBudgetProjectionOptions): MediaBudgetProjection;
export declare function logMediaBudgetProjection(logger: Logger | undefined, traceContext: TraceContext, projection: MediaBudgetProjection, options: {
    event: string;
    message: string;
}): void;
export {};
