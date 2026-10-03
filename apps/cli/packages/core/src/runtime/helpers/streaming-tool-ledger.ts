import { SessionEventType } from "../deps.js";
import type {
  MessageId,
  ModelToolSideEffectScope,
  PartId,
  SessionEvent,
  StreamRecoveryAnchorPayload,
  StreamingToolExecutionTiming,
  StreamingToolLedgerPayload,
  StreamingToolLedgerStatus,
  ToolCall,
  ToolCallId,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

const END_OF_STREAM_ATTEMPT_SUFFIX = "end-of-stream";
const TOOL_RESULT_ANCHOR_SUFFIX = "tool-result";
const DEFAULT_EXECUTION_TIMING: StreamingToolExecutionTiming = "end_of_stream";

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

export function createStreamingToolAttemptId(assistantMessageId: MessageId): string {
  return `${assistantMessageId}:${END_OF_STREAM_ATTEMPT_SUFFIX}`;
}

export function createStreamRecoveryAnchorId(
  assistantMessageId: MessageId,
  toolCallId: ToolCallId,
): string {
  return `${assistantMessageId}:${toolCallId}:${TOOL_RESULT_ANCHOR_SUFFIX}`;
}

export async function emitStreamingToolLedgerUpdate(
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  traceContext: TraceContext,
  options: EmitLedgerUpdateOptions,
): Promise<SessionEvent> {
  const entry = runtime.registry.get(options.toolCall.name);
  const metadata = entry?.metadata;
  const sideEffectScope: ModelToolSideEffectScope | undefined =
    entry?.permission?.sideEffectScope ?? metadata?.sideEffectScope;
  const payload: StreamingToolLedgerPayload = {
    // 保持两次 metadata 读取；725d8d8 证明合并读取会改变观察。
    readOnly:
      metadata?.readOnly === undefined
        ? undefined
        : metadata.readOnly && sideEffectScope === "none",
    destructive: metadata?.destructive,
    concurrentSafe: metadata?.concurrentSafe,
    sideEffectScope,
    attemptId: createStreamingToolAttemptId(options.assistantMessageId),
    assistantMessageId: options.assistantMessageId,
    toolCallId: options.toolCall.id as ToolCallId,
    toolName: options.toolCall.name,
    status: options.status,
    executionTiming: options.executionTiming ?? DEFAULT_EXECUTION_TIMING,
    input: options.input,
    startedAt: options.startedAt,
    committedAt: options.committedAt,
    resultPartId: options.resultPartId,
    recoveryAnchorId: options.recoveryAnchorId,
    blockedReason: options.blockedReason,
  };
  const event = runtime.createEvent(
    SessionEventType.StreamingToolLedgerUpdated,
    payload,
    traceContext,
  );
  await runtime.appendEvent(event, traceContext);
  events.push(event);
  return event;
}

export async function emitStreamRecoveryAnchor(
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  traceContext: TraceContext,
  options: EmitRecoveryAnchorOptions,
): Promise<SessionEvent> {
  const anchorId = createStreamRecoveryAnchorId(options.assistantMessageId, options.toolCallId);
  const payload: StreamRecoveryAnchorPayload = {
    anchorId,
    attemptId: createStreamingToolAttemptId(options.assistantMessageId),
    kind: options.success ? "tool_result" : "tool_error",
    assistantMessageId: options.assistantMessageId,
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    resultPartId: options.resultPartId,
    committedToolCallIds: [options.toolCallId],
    committedAt: options.committedAt,
  };
  const event = runtime.createEvent(
    SessionEventType.StreamRecoveryAnchorCreated,
    payload,
    traceContext,
  );
  await runtime.appendEvent(event, traceContext);
  events.push(event);
  return event;
}
