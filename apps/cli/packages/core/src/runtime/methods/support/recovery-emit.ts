// SPDX-License-Identifier: Apache-2.0
// 恢复事件组与失败分类：Started 一条 + 锚点三连（进入序=完成序），pending identity 在三事件
// 全部落盘后才写。失败分类沿 cause 链下钻：先分超时/网络，再按 Error 与否归流错/未知。
import { SessionEventType } from "../../deps.js";
import type { MessageId, SessionEvent, ToolCallId, TraceContext } from "../../deps.js";
import { createStreamRecoveryAnchorId, createStreamingToolAttemptId } from "../../helpers/index.js";

/** 助手消息标识（短别名）。 */
type AssistantId = MessageId;

/** 工具调用标识（短别名）。 */
type CallId = ToolCallId;

/** 锚点兜底后缀（无已提交工具时，锚在上一条消息上）。 */
const PREVIOUS_MESSAGE_ANCHOR_SUFFIX = "previous-message-anchor";

/** 重试事件里的流模式取值（逐字常量）。 */
const STREAM_MODE = "sse";

/** 瞬变错误码集合（命中即可重试；单行化仅为排版）。 */
const TRANSIENT_CODES = new Set(
  "model_request_timeout model_rate_limited model_server_error model_network_error MODEL_REQUEST_TIMEOUT MODEL_RATE_LIMITED MODEL_SERVER_ERROR MODEL_NETWORK_ERROR".split(
    " ",
  ),
);

/** 瞬变原因串集合（命中即可重试；单行化仅为排版）。 */
const TRANSIENT_REASONS = new Set(
  "stream_idle_timeout rate_limited server_error network_error timeout".split(" "),
);

/** 超时类错误名（逐字常量）。 */
const TIMEOUT_ERROR_NAME = "ModelStreamIdleTimeoutError";

/** 失败归类的取值面。 */
type FailureKind =
  | "provider_timeout"
  | "provider_network_error"
  | "provider_stream_error"
  | "unknown";

/** 超时族判定表：原因串与错误码各一张集合，消息特征一条模式。 */
const TIMEOUT_REASONS = new Set("stream_idle_timeout".split(" "));
const TIMEOUT_CODES = new Set("model_request_timeout MODEL_REQUEST_TIMEOUT".split(" "));
const TIMEOUT_MESSAGE_PATTERN = /\btimeout|timed out|stalled\b/i;

/** 网络族判定表：同超时族口径。 */
const NETWORK_REASONS = new Set("network_error".split(" "));
const NETWORK_CODES = new Set("model_network_error MODEL_NETWORK_ERROR".split(" "));
const NETWORK_MESSAGE_PATTERN = /\bECONNRESET|EPIPE|ETIMEDOUT\b/i;

/** 可重试消息特征（忽略大小写）。 */
const RETRYABLE_MESSAGE_PATTERN =
  /\b(stream idle|stream stalled|timeout|timed out|ECONNRESET|EPIPE|ETIMEDOUT)\b/i;

type ErrorFields = Record<string, unknown>;
type EventSink = SessionEvent[];
type TraceHandle = TraceContext;

const asFields = (value: unknown): ErrorFields | undefined =>
  typeof value === "object" && value !== null ? (value as ErrorFields) : undefined;

const readableString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** 沿 cause 链迭代记录（含环检测与深度上限）。 */
function* causeChain(error: unknown): IterableIterator<ErrorFields> {
  const seen = new Set<ErrorFields>();
  let cursor = error;
  for (let depth = 0; depth <= 6; depth += 1) {
    const record = asFields(cursor);
    if (!record || seen.has(record)) return;
    seen.add(record);
    yield record;
    cursor = record.cause;
  }
}

/** 失败归类：超时 / 网络 / 流错 / 未知。 */
export function classifyFailureKind(error: unknown): FailureKind {
  for (const record of causeChain(error)) {
    const context = asFields(record.context);
    const reason = readableString(record.reason) ?? readableString(context?.reason);
    const code = readableString(record.code) ?? readableString(context?.code);
    const name = readableString(record.name);
    const message = readableString(record.message);
    // 超时族：原因串、错误码、错误名、消息特征任一命中。
    const timeoutHit =
      (reason !== undefined && TIMEOUT_REASONS.has(reason)) ||
      (code !== undefined && TIMEOUT_CODES.has(code)) ||
      name === TIMEOUT_ERROR_NAME ||
      (message !== undefined && TIMEOUT_MESSAGE_PATTERN.test(message));
    if (timeoutHit) return "provider_timeout";
    // 网络族：原因串、错误码、消息特征任一命中。
    const networkHit =
      (reason !== undefined && NETWORK_REASONS.has(reason)) ||
      (code !== undefined && NETWORK_CODES.has(code)) ||
      (message !== undefined && NETWORK_MESSAGE_PATTERN.test(message));
    if (networkHit) return "provider_network_error";
  }
  return error instanceof Error ? "provider_stream_error" : "unknown";
}

/** 可重试判定：显式 retryable、瞬变码/原因、超时错误名、消息特征任一命中。 */
export function isRetryableFailure(error: unknown): boolean {
  for (const record of causeChain(error)) {
    if (record.retryable === true) return true;
    const context = asFields(record.context);
    if (context?.retryable === true) return true;
    const code = readableString(record.code) ?? readableString(context?.code);
    if (code !== undefined && TRANSIENT_CODES.has(code)) return true;
    const reason = readableString(record.reason) ?? readableString(context?.reason);
    if (reason !== undefined && TRANSIENT_REASONS.has(reason)) return true;
    if (record.name === TIMEOUT_ERROR_NAME) return true;
    const message = readableString(record.message);
    if (message !== undefined && RETRYABLE_MESSAGE_PATTERN.test(message)) return true;
  }
  return false;
}

/** 恢复事件组的最小状态视图。 */
export interface RecoveryEventState {
  /** 事件数组（append 完成后才压入）。 */
  events: EventSink;
  /** 恢复请求身份（三事件落盘后写）。 */
  pendingStreamRecoveryRequest?: unknown;
}

/** 恢复事件的公共入参。 */
export interface RecoveryEventOptions {
  /** 助手消息 id。 */
  assistantMessageId: AssistantId;
  /** 失败请求 id（可缺）。 */
  failedRequestId?: string;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** 尝试信息 + 丢弃统计 + 锚点理由。 */
export interface RetryEventFacts {
  /** 丢弃的推理字节数。 */
  discardedReasoningBytes: number;
  /** 丢弃的文本字节数。 */
  discardedTextBytes: number;
  /** 预算上限。 */
  maxRetries: number;
  /** 锚点理由串。 */
  reason: "latest_committed_tool_result" | "no_tool_committed";
  /** 本次序号。 */
  retryNumber: number;
  /** 已提交工具表。 */
  toolCallIds: CallId[];
}

/** 恢复事件的运行时端口面。 */
export interface RecoveryEventPorts {
  /** 建事件端口。 */
  createEvent(type: string, payload: unknown, traceContext: TraceHandle): SessionEvent;
  /** 持久化端口。 */
  appendEvent(event: SessionEvent, traceContext: TraceHandle): Promise<void>;
}

/** 发 StreamRecoveryStarted：载荷字段序即契约，append 完成才入事件数组。 */
export async function emitStreamRecoveryStarted(
  ports: RecoveryEventPorts,
  state: RecoveryEventState,
  options: RecoveryEventOptions,
  error: unknown,
  attempt: { maxRetries: number; retryNumber: number },
): Promise<void> {
  const payload: ErrorFields = {};
  payload.attemptId = createStreamingToolAttemptId(options.assistantMessageId);
  payload.assistantMessageId = options.assistantMessageId;
  payload.failureKind = classifyFailureKind(error);
  payload.message = error instanceof Error ? error.message : String(error);
  payload.retryNumber = attempt.retryNumber;
  payload.maxRetries = attempt.maxRetries;
  if (options.failedRequestId) payload.failedRequestId = options.failedRequestId;
  const event = ports.createEvent(
    SessionEventType.StreamRecoveryStarted,
    payload,
    options.traceContext,
  );
  await ports.appendEvent(event, options.traceContext);
  state.events.push(event);
}

/** 锚点选择：末位已提交工具优先，否则锚上一条消息。 */
const anchorOf = (assistantMessageId: AssistantId, toolCallIds: CallId[]): string => {
  const lastCall = toolCallIds.at(-1);
  return lastCall
    ? createStreamRecoveryAnchorId(assistantMessageId, lastCall)
    : `${assistantMessageId}:${PREVIOUS_MESSAGE_ANCHOR_SUFFIX}`;
};

/** 发锚点三连（AnchorSelected → TailDiscarded → RetryStarted）并落 pending identity。 */
export async function emitStreamRecoveryRetryEvents(
  ports: RecoveryEventPorts,
  state: RecoveryEventState,
  options: RecoveryEventOptions,
  facts: RetryEventFacts,
): Promise<void> {
  const anchorId = anchorOf(options.assistantMessageId, facts.toolCallIds);
  const attemptId = createStreamingToolAttemptId(options.assistantMessageId);

  const selectedPayload: ErrorFields = {};
  selectedPayload.attemptId = attemptId;
  selectedPayload.anchorId = anchorId;
  selectedPayload.reason = facts.reason;
  selectedPayload.committedToolCallIds = facts.toolCallIds;
  const selected = ports.createEvent(
    SessionEventType.StreamRecoveryAnchorSelected,
    selectedPayload,
    options.traceContext,
  );

  const discardedPayload: ErrorFields = {};
  discardedPayload.attemptId = attemptId;
  discardedPayload.anchorId = anchorId;
  discardedPayload.assistantMessageId = options.assistantMessageId;
  discardedPayload.discardedReasoningBytes = facts.discardedReasoningBytes;
  discardedPayload.discardedTextBytes = facts.discardedTextBytes;
  discardedPayload.discardedToolCallIds = [];
  const discarded = ports.createEvent(
    SessionEventType.StreamRecoveryTailDiscarded,
    discardedPayload,
    options.traceContext,
  );

  const retryPayload: ErrorFields = {};
  retryPayload.attemptId = attemptId;
  retryPayload.anchorId = anchorId;
  retryPayload.retryNumber = facts.retryNumber;
  retryPayload.maxRetries = facts.maxRetries;
  retryPayload.streamMode = STREAM_MODE;
  if (options.failedRequestId) retryPayload.failedRequestId = options.failedRequestId;
  const retry = ports.createEvent(
    SessionEventType.StreamRecoveryRetryStarted,
    retryPayload,
    options.traceContext,
  );

  await ports.appendEvent(selected, options.traceContext);
  state.events.push(selected);
  await ports.appendEvent(discarded, options.traceContext);
  state.events.push(discarded);
  await ports.appendEvent(retry, options.traceContext);
  state.events.push(retry);

  const pending: ErrorFields = {};
  pending.attemptId = attemptId;
  pending.anchorId = anchorId;
  pending.maxRetries = facts.maxRetries;
  pending.retryNumber = facts.retryNumber;
  if (options.failedRequestId) pending.recoveredFromRequestId = options.failedRequestId;
  state.pendingStreamRecoveryRequest = pending;
}
