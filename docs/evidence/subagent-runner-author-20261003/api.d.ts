import { type BackgroundResultOriginMeta, type Logger, type SessionEvent, type SessionId, type SubagentPort, type SubagentRunOptions, type TraceContext } from "@knorvia/contracts";
import { type AgentProfile } from "./profile.js";
import { type RuntimeTaskMessageSink, type RuntimeTaskRegistry } from "../runtime-task/registry.js";
export interface ExploreSubagentRuntimeRequest {
    agentId: string;
    agentType: string;
    allowedTools: readonly string[];
    background: boolean;
    disallowedTools?: readonly string[];
    sessionId: SessionId;
    description: string;
    maxTurns?: number;
    onSessionReady?: () => Promise<void>;
    permissionMode?: AgentProfile["permissionMode"];
    prompt: string;
    profile: AgentProfile;
    registerMessageSink?: (sink: RuntimeTaskMessageSink) => void;
    reportActivity?: () => void;
    resumeFromStore?: boolean;
    systemPrompt?: string;
    workingDirectory: string;
    workspaceRoot: string;
    traceContext: TraceContext;
}
export interface ExploreSubagentRuntimeResult {
    response: string;
    traceId: TraceContext["traceId"];
    events: SessionEvent[];
}
export interface ParentTaskNotificationCommand {
    originMeta: BackgroundResultOriginMeta;
    text: string;
    traceContext: TraceContext;
    taskId: string;
}
export type EnqueueParentTaskNotification = (notification: ParentTaskNotificationCommand) => undefined;
export interface ExploreSubagentPortOptions {
    runExploreAgent: (request: ExploreSubagentRuntimeRequest, options?: SubagentRunOptions) => Promise<ExploreSubagentRuntimeResult>;
    emitParentEvent: (event: SessionEvent, traceContext: TraceContext) => Promise<void>;
    enqueueParentTaskNotification?: EnqueueParentTaskNotification;
    outputRootDir?: string;
    profiles?: readonly AgentProfile[];
    builtInModelSelectionOverrides?: Partial<Record<"general-purpose" | "Explore", import("@knorvia/shared").ModelSelection>>;
    runtimeTaskRegistry?: RuntimeTaskRegistry;
    createAgentId?: () => string;
    getAllowedTools?: (profile: AgentProfile) => readonly string[];
    inactivityTimeoutMs?: number;
    autoBackgroundMs?: number;
    logger?: Logger;
}
export declare function createExploreSubagentPort(options: ExploreSubagentPortOptions): SubagentPort;
