import type { MessageId, SyntheticUserMessageSource, TraceContext, TurnInputIntentMetadata, WorkflowLaunchMeta } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ControlOnlyTurnRuntimeCommand } from "../command-queue.js";
type ControlTurnPublication = {
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
};
type WorkflowLaunchUserMessage = {
    messageID: MessageId;
    text: string;
    meta: WorkflowLaunchMeta;
    traceContext: TraceContext;
};
type ExternalUserPromptOptions = {
    goalSummaryTargetID?: string;
    traceContext?: TraceContext;
    intent?: TurnInputIntentMetadata;
};
export declare function emitControlOnlyUserTurn(this: AgentRuntimeInternal, options: ControlTurnPublication): Promise<void>;
export declare function runControlOnlyTurnCommand(this: AgentRuntimeInternal, command: ControlOnlyTurnRuntimeCommand): Promise<void>;
export declare function recordExternalUserPrompt(this: AgentRuntimeInternal, input: string, options?: ExternalUserPromptOptions): Promise<MessageId>;
export declare function persistWorkflowLaunchUserMessage(this: AgentRuntimeInternal, options: WorkflowLaunchUserMessage): Promise<void>;
export {};
//# sourceMappingURL=control-only-turn.d.ts.map