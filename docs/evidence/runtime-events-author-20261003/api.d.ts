import { SessionEventType } from "../deps.js";
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function createEvent(this: AgentRuntimeInternal, type: SessionEventType, payload: unknown, traceContext: TraceContext): SessionEvent;
export declare function appendEvent(this: AgentRuntimeInternal, event: SessionEvent, traceContext: TraceContext): Promise<void>;
export declare function notifyEventSinks(this: AgentRuntimeInternal, event: SessionEvent, traceContext: TraceContext): Promise<void>;
export declare function isSessionPersisted(this: AgentRuntimeInternal): boolean;
export declare function ensureSessionPersisted(this: AgentRuntimeInternal, input: string, traceContext: TraceContext): Promise<void>;
