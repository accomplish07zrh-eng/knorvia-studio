import type { MessageId, SyntheticUserMessageSource, TraceContext, TurnInputIntentMetadata, WorkflowLaunchMeta } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ControlOnlyTurnRuntimeCommand } from "../command-queue.js";
export declare function emitControlOnlyUserTurn(this: AgentRuntimeInternal, options: {
    messageId: MessageId;
    titleInput: string;
    historyText: string;
    turnInput: string;
    traceContext: TraceContext;
    inputId?: string;
    inputSource?: SyntheticUserMessageSource;
    workflowLaunch?: WorkflowLaunchMeta;
    intent?: TurnInputIntentMetadata;
    persistMessage: () => Promise<void>;
    afterTurnBoundary?: () => void;
}): Promise<void>;
export declare function persistWorkflowLaunchUserMessage(this: AgentRuntimeInternal, options: {
    messageID: MessageId;
    text: string;
    meta: WorkflowLaunchMeta;
    traceContext: TraceContext;
}): Promise<void>;
export declare function runControlOnlyTurnCommand(this: AgentRuntimeInternal, command: ControlOnlyTurnRuntimeCommand): Promise<void>;
export declare function recordExternalUserPrompt(this: AgentRuntimeInternal, input: string, options?: {
    goalSummaryTargetID?: string;
    traceContext?: TraceContext;
    intent?: TurnInputIntentMetadata;
}): Promise<MessageId>;
