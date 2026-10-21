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

/**
 * 瞬变错误的族表：每个族声明自己的错误码、原因串与消息特征。
 * 集合与判定都从这张表派生，避免同一批字面量在多处重复出现。
 */
const TRANSIENT_FAMILIES = {
  timeout: {
    codes: ["model_request_timeout", "MODEL_REQUEST_TIMEOUT"],
    message: /\btimeout|timed out|stalled\b/i,
    reasons: ["stream_idle_timeout"],
  },
  network: {
    codes: ["model_network_error", "MODEL_NETWORK_ERROR"],
    message: /\bECONNRESET|EPIPE|ETIMEDOUT\b/i,
    reasons: ["network_error"],
  },
  retryable: {
    codes: ["model_rate_limited", "MODEL_RATE_LIMITED"],
    message: /\b(stream idle|stream stalled|timeout|timed out|ECONNRESET|EPIPE|ETIMEDOUT)\b/i,
    reasons: ["rate_limited"],
  },
  server: {
    codes: ["model_server_error", "MODEL_SERVER_ERROR"],
    message: undefined,
    reasons: ["server_error"],
  },
} as const;

/** 族的全部错误码（去重后的并集）。 */
const TRANSIENT_CODES = new Set<string>(
  Object.values(TRANSIENT_FAMILIES).flatMap((family) => [...family.codes]),
);

/** 族的全部原因串（去重后的并集）。 */
const TRANSIENT_REASONS = new Set<string>([
  ...Object.values(TRANSIENT_FAMILIES).flatMap((family) => [...family.reasons]),
  "timeout",
]);

/** 超时类错误名（逐字常量）。 */
const TIMEOUT_ERROR_NAME = "ModelStreamIdleTimeoutError";

/** 失败归类的取值面。 */
type FailureKind =
  | "provider_timeout"
  | "provider_network_error"
  | "provider_stream_error"
  | "unknown";

/** 三个族的判定入口：都从 `TRANSIENT_FAMILIES` 取，不再重复声明字面量。 */
const familyMatchers = {
  timeout: matcherFor(TRANSIENT_FAMILIES.timeout),
  network: matcherFor(TRANSIENT_FAMILIES.network),
  retryable: matcherFor(TRANSIENT_FAMILIES.retryable),
};

/**
 * 按单个族生成三路判定（原因串 / 错误码 / 消息特征）。
 * 族里没有消息特征时，第三路恒为 false —— 与「不设该判据」等价。
 */
function matcherFor(family: {
  readonly codes: readonly string[];
  readonly message: RegExp | undefined;
  readonly reasons: readonly string[];
}) {
  const reasons = new Set<string>(family.reasons);
  const codes = new Set<string>(family.codes);
  return {
    byCode: (code: string | undefined) => code !== undefined && codes.has(code),
    byMessage: (message: string | undefined) =>
      message !== undefined && family.message !== undefined && family.message.test(message),
    byReason: (reason: string | undefined) => reason !== undefined && reasons.has(reason),
  };
}

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
    const timeout = familyMatchers.timeout;
    if (
      timeout.byReason(reason) ||
      timeout.byCode(code) ||
      name === TIMEOUT_ERROR_NAME ||
      timeout.byMessage(message)
    )
      return "provider_timeout";
    // 网络族：原因串、错误码、消息特征任一命中。
    const network = familyMatchers.network;
    if (network.byReason(reason) || network.byCode(code) || network.byMessage(message))
      return "provider_network_error";
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
    if (familyMatchers.retryable.byMessage(message)) return true;
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

/** attempt 标识：每次调用都从 live options 读取（缓存 identity 的失败有案底，勿优化）。 */
const nextAttemptTag = (options: RecoveryEventOptions): string =>
  createStreamingToolAttemptId(options.assistantMessageId);

/** 发锚点三连（AnchorSelected → TailDiscarded → RetryStarted）并落 pending identity。 */
export async function emitStreamRecoveryRetryEvents(
  ports: RecoveryEventPorts,
  state: RecoveryEventState,
  options: RecoveryEventOptions,
  facts: RetryEventFacts,
): Promise<void> {
  const anchorId = anchorOf(options.assistantMessageId, facts.toolCallIds);

  const selectedPayload: ErrorFields = {};
  selectedPayload.attemptId = nextAttemptTag(options);
  selectedPayload.anchorId = anchorId;
  selectedPayload.reason = facts.reason;
  selectedPayload.committedToolCallIds = facts.toolCallIds;
  const selected = ports.createEvent(
    SessionEventType.StreamRecoveryAnchorSelected,
    selectedPayload,
    options.traceContext,
  );

  const discardedPayload: ErrorFields = {};
  discardedPayload.attemptId = nextAttemptTag(options);
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
  retryPayload.attemptId = nextAttemptTag(options);
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
  pending.attemptId = nextAttemptTag(options);
  pending.anchorId = anchorId;
  pending.maxRetries = facts.maxRetries;
  pending.retryNumber = facts.retryNumber;
  if (options.failedRequestId) pending.recoveredFromRequestId = options.failedRequestId;
  state.pendingStreamRecoveryRequest = pending;
}
