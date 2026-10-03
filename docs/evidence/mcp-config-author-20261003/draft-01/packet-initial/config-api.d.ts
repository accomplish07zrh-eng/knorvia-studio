import type { CollaborationMode, ExecutionShellSelection, Model, ModelSelection, ModelToolContract, PermissionBrokerRequest, ProjectId, SessionEvent, SessionEventSink, SessionEventStorePort, SessionId, SessionProjection, TraceContext, ToolExecutor, ToolRegistry, ContextBuilder } from "../deps.js";
import { type ChildClientPortsContext, type ClientFacingPorts } from "../helpers/child-client-ports.js";
import type { AgentRuntimeConfig, ActiveTurnInfo } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type SessionShellEnvironmentCandidate } from "./session-shell-environment.js";
export declare function setExecutionState(this: AgentRuntimeInternal, input: {
    mode?: string;
    planEnabled?: boolean;
}, traceContext?: TraceContext): Promise<void>;
export declare function updateConfig(this: AgentRuntimeInternal, patch: Pick<AgentRuntimeConfig, "mode" | "planEnabled" | "language" | "outputStyle">): void;
export declare function initializeSessionShellEnvironmentIfNeeded(this: AgentRuntimeInternal, selection: SessionShellEnvironmentCandidate): boolean;
export declare function getSessionShellSelection(this: AgentRuntimeInternal): ExecutionShellSelection | undefined;
export declare function getMode(this: AgentRuntimeInternal): CollaborationMode;
export declare function getPlanEnabled(this: AgentRuntimeInternal): boolean;
export declare function getSessionModelSelection(this: AgentRuntimeInternal): ModelSelection | undefined;
export declare function setSessionModelSelection(this: AgentRuntimeInternal, selection: ModelSelection | undefined): void;
export declare function getProjectId(this: AgentRuntimeInternal): ProjectId;
export declare function setWorkingDirectory(this: AgentRuntimeInternal, cwd: string): void;
export declare function ensureSessionPersistedForExternalActivity(this: AgentRuntimeInternal, input: string, options?: {
    traceContext?: TraceContext;
}): Promise<void>;
export declare function getActiveTurnInfo(this: AgentRuntimeInternal): ActiveTurnInfo | undefined;
export declare function getTools(this: AgentRuntimeInternal, model?: Model): ModelToolContract[];
export declare function invalidateToolCache(this: AgentRuntimeInternal): void;
export declare function getToolRegistry(this: AgentRuntimeInternal): ToolRegistry;
export declare function getToolExecutor(this: AgentRuntimeInternal): ToolExecutor;
export declare function subscribeEvents(this: AgentRuntimeInternal, sink: SessionEventSink): () => void;

export declare function getSessionEventStore(this: AgentRuntimeInternal): SessionEventStorePort;

export declare function notifyExternalChildSessionEvent(this: AgentRuntimeInternal, input: {
    childSessionId: SessionId;
    event: SessionEvent;
    traceContext?: TraceContext;
}): Promise<void>;

export declare function createChildClientPorts(this: AgentRuntimeInternal, context: ChildClientPortsContext): ClientFacingPorts;
export declare function getContextBuilder(this: AgentRuntimeInternal): ContextBuilder;
export declare function getPendingPermissionRequests(this: AgentRuntimeInternal): PermissionBrokerRequest[];
export declare function getProjection(this: AgentRuntimeInternal): Promise<SessionProjection>;
export declare function getSessionId(this: AgentRuntimeInternal): SessionId;
