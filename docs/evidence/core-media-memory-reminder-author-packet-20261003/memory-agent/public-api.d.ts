import type { Model, ModelInputMessage, ModelToolContract, TraceContext } from "../deps.js";
import type { AgentTelemetryCausation, ModelApiOperation } from "@knorvia/contracts";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";
import type { ReadFileStateMap } from "../../tool/types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export interface ProjectMemoryAgentContext {
    causation?: AgentTelemetryCausation;
    memoryRoot: string;
    providerEntries: readonly RuntimeMessageEntry[];
    midConversationSystem: AgentRuntimeInternal["config"]["midConversationSystem"];
    model: Model;
    operation: ModelApiOperation;
    readFileState: ReadFileStateMap;
    tools: readonly ModelToolContract[];
    traceContext: TraceContext;
    workingDirectory: string;
    workspaceRoot: string;
}
export declare function captureProjectMemoryAgentContext(runtime: AgentRuntimeInternal, input: {
    memoryRoot: string;
    model?: Model;
    operation: ModelApiOperation;
    traceContext: TraceContext;
}): ProjectMemoryAgentContext;
export declare function buildProjectMemoryAgentProviderMessages(runtime: AgentRuntimeInternal, context: ProjectMemoryAgentContext, prompt: string): ModelInputMessage[];
export declare function createProjectMemoryAgentToolExecutor(runtime: AgentRuntimeInternal, context: ProjectMemoryAgentContext): any;
