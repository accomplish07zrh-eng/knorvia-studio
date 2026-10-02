// Bounded signatures from distinct original modules; opaque aliases remain original module types.
import type { TraceContext as ContractTraceContext, LogContext as ContractLogContext } from "../deps.js";
import type { CoreError, CoreErrorType } from "../deps.js";
export declare function createCoreError(type: CoreErrorType, message: string, options?: Options): CoreError;
export declare function isCoreError(error: unknown): error is CoreError;
export declare function isPlainRecord(value: unknown): value is Record<string, unknown>;
export declare function stringProperty(record: Record<string, unknown>, key: string): string | undefined;
interface ProviderBusinessMetadataFailure {
    message: string;
    providerCode?: string;
    responseBodySummary?: Record<string, unknown>;
}
export declare function findProviderBusinessFailureInMetadata(providerMetadata: Record<string, unknown> | undefined): ProviderBusinessMetadataFailure | undefined;
export declare function createCoreErrorFromProviderBusinessLike(error: unknown): ReturnType<typeof createCoreError> | undefined;

interface Options { cause?: Error; context?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean; }
