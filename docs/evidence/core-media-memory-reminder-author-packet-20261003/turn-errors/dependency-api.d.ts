// Body-free collaborator/type fragments; original module ownership, not standalone compilation.
// Original type owner: apps/cli/packages/contracts/src/errors/index.ts
interface Options {
    cause?: Error;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
}
export interface CoreError extends Error {
    type: CoreErrorType;
    code: string;
    message: string;
    cause?: Error;
    context?: Record<string, unknown>;
    recoverable: boolean;
    retryable: boolean;
    timestamp: Date;
}
export declare function createCoreError(type: CoreErrorType, message: string, options?: Options): CoreError;
export declare function isCoreError(error: unknown): error is CoreError;
// Original type owner: apps/cli/packages/core/src/errors/error-payload.ts
export declare function withErrorPayloadRole(context: Record<string, unknown> | undefined, role: ErrorPayloadRole): Record<string, unknown>;
export declare function projectExecutionErrorPayload(error: unknown, fallbackMessage?: any): any;
export declare const CoreErrorType: typeof import("../deps.js").CoreErrorType;
export declare const SessionEventType: typeof import("../deps.js").SessionEventType;
export declare const ErrorPayloadRole: typeof import("../../errors/error-payload.js").ErrorPayloadRole;
export declare const createModelUsageSummaryFromEvents: typeof import("../deps.js").createModelUsageSummaryFromEvents;
export declare const traceContextToLogContext: typeof import("../deps.js").traceContextToLogContext;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/model-errors.ts
export declare function isModelContextExceededError(error: unknown): boolean;
