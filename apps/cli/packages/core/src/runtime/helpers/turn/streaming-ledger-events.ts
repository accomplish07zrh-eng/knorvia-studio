// SPDX-License-Identifier: Apache-2.0
// 流式工具账本与恢复锚点事件（B33）。
// 账本载荷：只读 = 元数据 readOnly 且副作用范围为 none（元数据缺失给 undefined）、「破坏性」
// 「并发安全」「副作用范围」三项工具元数据、attempt id（`<助手消息id>:end-of-stream`）、
// 工具调用 id/名、状态、执行时机（缺省 end_of_stream）与时间戳；同一助手消息多次调用共用同一
// attempt id（重试语义）。锚点载荷 id 为 `<助手消息id>:<工具调用id>:tool-result`，kind 按
// 成功与否取 tool_result/tool_error，提交列表只含本工具调用。
// 两者都**先创建事件、再 await 追加、再压入调用方事件数组**并返回该事件；工具不在注册表时按
// 缺失元数据处理（各字段 undefined）不抛；追加异常向上冒泡。
import { SessionEventType } from "../../deps.js";
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
} from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";

// id 拼接后缀与缺省执行时机（协议面，逐字冻结）。 //attempt id 后缀
const END_OF_STREAM_ATTEMPT_SUFFIX = "end-of-stream";
const TOOL_RESULT_ANCHOR_SUFFIX = "tool-result"; // 锚点 id 后缀
const DEFAULT_EXECUTION_TIMING: StreamingToolExecutionTiming = "end_of_stream";

export interface EmitLedgerUpdateOptions {
  assistantMessageId: /* 助手消息 id：attempt id 的前半段 */ MessageId;
  toolCall: /* 本次工具调用（id + 名） */ ToolCall;
  status: /* 账本状态 */ StreamingToolLedgerStatus;
  input?: /* 调用输入快照 */ Record<string, unknown>;
  startedAt?: /* 开始时刻 */ Date;
  committedAt?: /* 提交时刻 */ Date;
  resultPartId?: /* 结果分片 id */ PartId;
  recoveryAnchorId?: /* 恢复锚点 id */ string;
  blockedReason?: /* 阻断原因 */ string;
  executionTiming?: /* 执行时机，缺省 end_of_stream */ StreamingToolExecutionTiming;
}

export interface EmitRecoveryAnchorOptions {
  assistantMessageId: /* 助手消息 id */ MessageId;
  toolCallId: /* 工具调用 id */ ToolCallId;
  toolName: /* 工具名 */ string;
  success: /* 成功 → tool_result，失败 → tool_error */ boolean;
  resultPartId?: /* 结果分片 id */ PartId;
  committedAt: /* 提交时刻 */ Date;
}

// 两类 id 都用 `:` 拼接（跨平台一致），同一助手消息多次调用共用 attempt id。
export function createStreamingToolAttemptId(assistantMessageId: MessageId): string {
  return [assistantMessageId, END_OF_STREAM_ATTEMPT_SUFFIX].join(":");
}

export const createStreamRecoveryAnchorId = (
  ownerMessageId: MessageId,
  callId: ToolCallId,
): string => [ownerMessageId, callId, TOOL_RESULT_ANCHOR_SUFFIX].join(":");

// 投递序列（行为契约）：先创建事件、再 await 追加、再压入调用方事件数组。
async function deliverEvent(
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  trace: TraceContext,
  event: SessionEvent,
): Promise<SessionEvent> {
  await runtime.appendEvent(event, trace);
  events.push(event);
  return event;
}

// 账本载荷装配：注册表缺该工具时元数据各字段为 undefined。
function buildLedgerPayload(
  runtime: AgentRuntimeInternal,
  request: EmitLedgerUpdateOptions,
): StreamingToolLedgerPayload {
  const registryEntry = runtime.registry.get(request.toolCall.name);
  const toolMetadata = registryEntry?.metadata;
  const permissionScope = registryEntry?.permission?.sideEffectScope;
  const sideEffectScope: ModelToolSideEffectScope | undefined =
    permissionScope ?? toolMetadata?.sideEffectScope;
  // 保持两次 metadata 读取；725d8d8 证明合并读取会改变观察（顺序语义）。
  let readOnly: boolean | undefined;
  if (toolMetadata?.readOnly !== undefined) {
    readOnly = toolMetadata.readOnly && sideEffectScope === "none";
  }
  const registryFacts = {
    readOnly,
    destructive: toolMetadata?.destructive,
    concurrentSafe: toolMetadata?.concurrentSafe,
    sideEffectScope,
  };
  const callIdentity = {
    attemptId: createStreamingToolAttemptId(request.assistantMessageId),
    assistantMessageId: request.assistantMessageId,
    toolCallId: request.toolCall.id as ToolCallId,
    toolName: request.toolCall.name,
    status: request.status,
    executionTiming: request.executionTiming ?? DEFAULT_EXECUTION_TIMING,
  };
  return {
    ...registryFacts,
    ...callIdentity,
    input: request.input,
    startedAt: request.startedAt,
    committedAt: request.committedAt,
    resultPartId: request.resultPartId,
    recoveryAnchorId: request.recoveryAnchorId,
    blockedReason: request.blockedReason,
  };
}

export const emitStreamingToolLedgerUpdate = async (
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  trace: TraceContext,
  request: EmitLedgerUpdateOptions,
): Promise<SessionEvent> => {
  const payload = buildLedgerPayload(runtime, request);
  const event = runtime.createEvent(SessionEventType.StreamingToolLedgerUpdated, payload, trace);
  return deliverEvent(runtime, events, trace, event);
};

export const emitStreamRecoveryAnchor = async (
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  trace: TraceContext,
  request: EmitRecoveryAnchorOptions,
): Promise<SessionEvent> => {
  const anchorIdentity = {
    anchorId: createStreamRecoveryAnchorId(request.assistantMessageId, request.toolCallId),
    attemptId: createStreamingToolAttemptId(request.assistantMessageId),
    kind: request.success ? ("tool_result" as const) : ("tool_error" as const),
  };
  const callIdentity = {
    assistantMessageId: request.assistantMessageId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    resultPartId: request.resultPartId,
  };
  const payload: StreamRecoveryAnchorPayload = {
    ...anchorIdentity,
    ...callIdentity,
    committedToolCallIds: [request.toolCallId],
    committedAt: request.committedAt,
  };
  const event = runtime.createEvent(SessionEventType.StreamRecoveryAnchorCreated, payload, trace);
  return deliverEvent(runtime, events, trace, event);
};
