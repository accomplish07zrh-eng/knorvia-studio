import type { ModelInputMessage, ModelSelection, ModelToolCall, ModelToolContract, ModelUsage, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export interface WorkspaceGenerateTextInput {
    selection: ModelSelection;
    prompt?: string;
    messages?: ModelInputMessage[];
    tools?: ModelToolContract[];
    querySource: string;
    maxOutputTokens?: number;
}
export interface WorkspaceGenerateTextResult {
    text: string;
    selection: ModelSelection;
    finishReason: string;
    usage?: ModelUsage;
    toolCalls?: ModelToolCall[];
}
export interface ModelConnectivityTestInput {
    selection: ModelSelection;
}
export declare function testModelConnectivity(this: AgentRuntimeInternal, input: ModelConnectivityTestInput, options?: {
    abortSignal?: AbortSignal;
    traceContext?: TraceContext;
}): Promise<void>;
export declare function generateWorkspaceText(this: AgentRuntimeInternal, input: WorkspaceGenerateTextInput, options?: {
    abortSignal?: AbortSignal;
    traceContext?: TraceContext;
}): Promise<WorkspaceGenerateTextResult>;
