// module runtime/permission-full-access.ts
import type { AgentRuntimeInternal } from "./internal.js";

export declare function grantPermissionFullAccess(this: AgentRuntimeInternal, interactionId: string, signal?: AbortSignal): Promise<string>;
//# sourceMappingURL=permission-full-access.d.ts.map
// module runtime/execution-state.ts
import { type ExecutionState } from "@knorvia/shared";
import { type TraceContext, type SessionId, type SessionEntryInfo } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "./internal.js";
export declare function readRuntimeExecutionState(runtime: AgentRuntimeInternal): ExecutionState;
export declare function buildExecutionStateEntry(sessionId: SessionId, state: ExecutionState): SessionEntryInfo;

export declare function applyRuntimeExecutionState(runtime: AgentRuntimeInternal, input: {
    mode?: string;
    planEnabled?: boolean;
}, cause: {
    source: "command" | "tool";
    toolCallId?: string;
    traceContext?: TraceContext;
}): Promise<ExecutionState>;
//# sourceMappingURL=execution-state.d.ts.map