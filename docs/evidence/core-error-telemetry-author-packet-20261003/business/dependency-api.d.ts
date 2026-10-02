import type { CoreErrorType } from "../deps.js";
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

// ./data.js
export declare function isPlainRecord(value: unknown): value is Record<string, unknown>;
