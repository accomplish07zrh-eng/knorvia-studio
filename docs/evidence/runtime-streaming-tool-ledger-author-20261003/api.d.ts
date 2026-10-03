import type { MessageId, PartId, SessionEvent, StreamingToolExecutionTiming, StreamingToolLedgerStatus, ToolCall, ToolCallId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
interface EmitLedgerUpdateOptions {
    assistantMessageId: MessageId;
    toolCall: ToolCall;
    status: StreamingToolLedgerStatus;
    input?: Record<string, unknown>;
    startedAt?: Date;
    committedAt?: Date;
    resultPartId?: PartId;
    recoveryAnchorId?: string;
    blockedReason?: string;
    executionTiming?: StreamingToolExecutionTiming;
}
interface EmitRecoveryAnchorOptions {
    assistantMessageId: MessageId;
    toolCallId: ToolCallId;
    toolName: string;
    success: boolean;
    resultPartId?: PartId;
    committedAt: Date;
}
export declare function createStreamingToolAttemptId(assistantMessageId: MessageId): string;
export declare function createStreamRecoveryAnchorId(assistantMessageId: MessageId, toolCallId: ToolCallId): string;
export declare function emitStreamingToolLedgerUpdate(runtime: AgentRuntimeInternal, events: SessionEvent[], traceContext: TraceContext, options: EmitLedgerUpdateOptions): Promise<SessionEvent>;
export declare function emitStreamRecoveryAnchor(runtime: AgentRuntimeInternal, events: SessionEvent[], traceContext: TraceContext, options: EmitRecoveryAnchorOptions): Promise<SessionEvent>;
export {};
