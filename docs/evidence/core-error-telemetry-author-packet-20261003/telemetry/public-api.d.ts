import type { Logger, ModelInputMessage, TraceContext } from "../deps.js";
import type { MediaBudgetProjection } from "./media-budget.js";
import type { ResolvedTurnAttachment } from "../types.js";
export declare function logResolvedTurnAttachments(logger: Logger | undefined, traceContext: TraceContext, attachments: readonly ResolvedTurnAttachment[]): void;
export declare function logModelRequestMediaSummary(logger: Logger | undefined, traceContext: TraceContext, input: {
    incomingMessages: readonly ModelInputMessage[];
    mediaProjection: MediaBudgetProjection;
    providerMessages: readonly ModelInputMessage[];
}): void;
