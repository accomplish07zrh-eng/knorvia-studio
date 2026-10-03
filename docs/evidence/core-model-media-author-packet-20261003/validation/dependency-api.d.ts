// Bounded signatures from distinct original modules; opaque aliases remain original module types.
import type { TraceContext as ContractTraceContext, LogContext as ContractLogContext } from "../deps.js";
import type { CoreError, CoreErrorType, TraceContext, LogContext } from "../deps.js";
export declare function createCoreError(type: CoreErrorType, message: string, options?: Options): CoreError;
export declare function traceContextToLogContext(context: ContractTraceContext): ContractLogContext;

interface Options { cause?: Error; context?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean; }
