// @knorvia/shared:
type ArtifactUri = `knorvia-artifact://${string}` | `zcode-artifact://${string}`;
export declare function isArtifactUri(value: string | null | undefined): value is ArtifactUri;

// ../deps.js (same original public trace/log types; no wrapper implementation):
import type { TraceContext as ContractTraceContext, LogContext as ContractLogContext } from "@knorvia/contracts";
export declare function traceContextToLogContext(context: ContractTraceContext): ContractLogContext;

// MediaBudgetProjection/ResolvedTurnAttachment actual imports are type-only; shapes supplied separately.
