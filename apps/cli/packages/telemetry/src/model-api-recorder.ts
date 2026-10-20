// SPDX-License-Identifier: Apache-2.0
// 模型调用的观测入口：契约形状与全部对外行为。
//
// 构造入参是合同 interface.md 冻结的面，因此它集中声明在 model-contract.ts；
// 事件 → 契约对象的映射在 model-descriptors；在册与治理在 call-registry。
// 本模块只负责三件事：拿到事件、把字段搬到 writer、把结算交给登记表。
import type {
  ModelNetworkStatusEvent,
  ModelRequestCompletedStatusEvent,
  ModelRequestFailedStatusEvent,
  ModelStatusSink,
} from "@knorvia/contracts/model";
import { ModelFailureReason } from "@knorvia/contracts/model";
import type {
  AgentTelemetryErrorCategory,
  ModelAttemptFailureStage,
  ModelAttemptSpanWriter,
  ModelExecutionTelemetryPort,
  ModelReasoningObservation,
} from "@knorvia/contracts/telemetry";
import { CallRecord, CallRegistry } from "./call-registry.js";
import { ProviderEndpointIdentityCache } from "./provider-endpoint.js";
import {
  attemptStartOf,
  callStartOf,
  isStreaming,
  operationFromRoute,
  targetOf,
} from "./model-descriptors.js";
import type { ModelApiTelemetryStatusSinkOptions } from "./model-contract.js";

export type { ModelApiTelemetryStatusSinkOptions };

/** 默认的调用龄与在册量上限。 */
const DEFAULT_MAX_AGE_MS = 30 * 60_000;
const DEFAULT_MAX_ACTIVE = 1_000;

/** started 事件的窄类型：只用到它携带的调用与尝试字段。 */
type ModelRequestStarted = Extract<ModelNetworkStatusEvent, { type: "model_request_started" }>;

/** 替身错误的形状：与 Provider 抛出的对象同名同义。 */
interface ProviderErrorShape {
  code?: string;
  message: string;
  name: string;
  statusCode?: number;
}

/** 失败原因 → 错误类别；未列出的原因归 unknown。 */
const REASON_CATEGORIES: Readonly<
  Partial<Record<ModelFailureReason, AgentTelemetryErrorCategory>>
> = {
  [ModelFailureReason.AuthFailed]: "authentication",
  [ModelFailureReason.ContextExceeded]: "provider",
  [ModelFailureReason.InvalidRequest]: "configuration",
  [ModelFailureReason.NetworkError]: "network",
  [ModelFailureReason.ProviderNotConfigured]: "configuration",
  [ModelFailureReason.ProviderOverloaded]: "provider",
  [ModelFailureReason.ProxyError]: "provider",
  [ModelFailureReason.RateLimited]: "rate_limit",
  [ModelFailureReason.ServerError]: "provider",
  [ModelFailureReason.StaleConnection]: "network",
  [ModelFailureReason.StreamIdleTimeout]: "timeout",
  [ModelFailureReason.Timeout]: "timeout",
  [ModelFailureReason.TlsError]: "network",
};

/** 一条「事件字段 → writer 方法」的搬运规则；取不到值时跳过。 */
interface FieldRule<E> {
  apply: (writer: ModelAttemptSpanWriter, event: E) => void;
}

/** 完成事件的搬运表：顺序即写入顺序。 */
const COMPLETION_RULES: readonly FieldRule<ModelRequestCompletedStatusEvent>[] = [
  { apply: (w, e) => e.providerRequestId && w.setProviderRequestId(e.providerRequestId) },
  { apply: (w, e) => e.finishReason && w.setFinishReason(e.finishReason) },
  { apply: (w, e) => e.usage?.inputTokens !== undefined && w.setInputTokens(e.usage.inputTokens) },
  {
    apply: (w, e) => e.usage?.outputTokens !== undefined && w.setOutputTokens(e.usage.outputTokens),
  },
  {
    apply: (w, e) =>
      e.usage?.reasoningTokens !== undefined && w.setReasoningTokens(e.usage.reasoningTokens),
  },
  {
    apply: (w, e) =>
      e.usage?.cacheReadTokens !== undefined && w.setCacheReadTokens(e.usage.cacheReadTokens),
  },
  {
    apply: (w, e) =>
      e.usage?.cacheWriteTokens !== undefined && w.setCacheWriteTokens(e.usage.cacheWriteTokens),
  },
  { apply: (w, e) => w.setStreamOutputCommitted(e.streamOutputCommitted ?? false) },
];

/** 失败事件的搬运表：顺序即写入顺序，取消与失败共用同一份事实。 */
const FAILURE_RULES: readonly FieldRule<ModelRequestFailedStatusEvent>[] = [
  { apply: (w, e) => e.statusCode !== undefined && w.setHttpStatusCode(e.statusCode) },
  { apply: (w, e) => e.providerRequestId && w.setProviderRequestId(e.providerRequestId) },
  { apply: (w, e) => e.providerErrorCode && w.setProviderErrorCode(e.providerErrorCode) },
  { apply: (w, e) => e.providerErrorMessage && w.setProviderErrorMessage(e.providerErrorMessage) },
  { apply: (w, e) => e.retryAfterMs !== undefined && w.setRetryAfterMs(e.retryAfterMs) },
  { apply: (w, e) => w.setStreamOutputCommitted(e.streamOutputCommitted ?? false) },
];

/** 里程碑类事件（首包、首内容、首文本、停滞）→ writer 方法。 */
const MILESTONES: Readonly<
  Partial<
    Record<
      ModelNetworkStatusEvent["type"],
      (writer: ModelAttemptSpanWriter, event: ModelNetworkStatusEvent) => void
    >
  >
> = {
  model_first_content: (writer) => writer.markFirstContent(),
  model_first_provider_event: (writer) => writer.markFirstProviderEvent(),
  model_first_text: (writer) => writer.markFirstText(),
  model_stream_stalled: (writer, event) => {
    if (event.type === "model_stream_stalled") writer.markStreamStalled(event.idleMs);
  },
};

/**
 * 进程级模型调用观测 Sink。
 * Sink 位于模型状态 fan-out 内，任何同步异常都会阻断 Provider 状态持久化，
 * 因此所有处理都包在 try 里，失败只降级成一次告警。
 */
export class ModelApiTelemetryStatusSink implements ModelStatusSink {
  readonly #registry: CallRegistry;
  readonly #endpoints = new ProviderEndpointIdentityCache();
  readonly #modelExecution: ModelExecutionTelemetryPort;
  readonly #now: () => number;
  readonly #onWarning: ModelApiTelemetryStatusSinkOptions["onWarning"];

  constructor(options: ModelApiTelemetryStatusSinkOptions) {
    this.#modelExecution = options.modelExecution;
    this.#now = options.now ?? Date.now;
    this.#onWarning = options.onWarning;
    this.#registry = new CallRegistry({
      maxActive: positiveInteger(options.maxActiveCalls, DEFAULT_MAX_ACTIVE),
      maxAgeMs: positiveInteger(options.maxActiveCallAgeMs, DEFAULT_MAX_AGE_MS),
      now: this.#now,
      onWarning: (message, context) => this.#warn(message, context),
    });
  }

  publish(event: ModelNetworkStatusEvent): void {
    this.#observe(event, undefined);
  }

  /** Transport 捕获到的原始异常走这里：与 publish 同一处理路径，只是多带异常本身。 */
  publishFailure(event: ModelRequestFailedStatusEvent, error: unknown): void {
    this.#observe(event, error);
  }

  /** 进程关闭：全部放弃。 */
  shutdown(): void {
    this.#registry.evictAll();
  }

  /** 会话关闭：只清理这个会话名下的调用。 */
  abandonSession(sessionId: string): void {
    this.#registry.evictSession(sessionId);
  }

  /** 在册调用数：容量与泄漏排查的唯一读数。 */
  get activeCallCount(): number {
    return this.#registry.size;
  }

  /**
   * 所有处理都在这里兜底：Sink 位于模型状态 fan-out 内，任何同步异常都会阻断
   * Provider 状态持久化与主链路，因此只允许降级成告警。
   */
  #observe(event: ModelNetworkStatusEvent, failureError: unknown): void {
    const guarded = () => this.#dispatch(event, failureError);
    try {
      guarded();
    } catch (error) {
      this.#warn("Model telemetry status processing failed", {
        errorType: error instanceof Error ? error.name : typeof error,
        eventType: event.type,
      });
    }
  }

  /**
   * 分派：started 开新调用或新尝试；其余事件只更新已登记的调用。
   * 未登记调用的事件直接丢弃——Sink 不补建 Span。
   */
  #dispatch(event: ModelNetworkStatusEvent, failureError: unknown): void {
    this.#registry.sweepExpired();
    const modelCall = event.modelCall;
    if (!modelCall) return;
    const known = this.#registry.get(modelCall.logicalCallId);
    const now = this.#now();

    if (event.type === "model_request_started") {
      const call = known ?? this.#openCall(event);
      call.touch(now);
      this.#startAttempt(call, event);
      return;
    }
    if (known === undefined) return;
    known.touch(now);
    this.#applyEvent(known, event, failureError);
  }

  /** 首次 started 建 writer；后续 started 复用同一调用并开新尝试。 */
  #openCall(event: ModelRequestStarted): CallRecord {
    this.#registry.makeRoom();
    const modelCall = event.modelCall!;
    const target = targetOf(event, this.#endpoints);
    const writer = this.#modelExecution.startCall(callStartOf(event, target, isStreaming(event)));
    const record = new CallRecord(
      { logicalCallId: modelCall.logicalCallId, sessionId: event.sessionId, writer },
      this.#now(),
    );
    this.#registry.add(record);
    return record;
  }

  /** 首次尝试用 initial；重试用 retry 并带上一次 requestId 与延迟。 */
  #startAttempt(call: CallRecord, event: ModelRequestStarted): void {
    // 同一 requestId 只登记一次：重复的 started 不产生第二次尝试。
    if (call.attempts.has(event.requestId)) return;
    const target = targetOf(event, this.#endpoints);
    const writer = call.writer.startAttempt(
      attemptStartOf({
        apiOperation: operationFromRoute(target.providerRoute),
        attemptNumber: event.attempt,
        maxAttempts: event.maxAttempts,
        previousRequestId: event.attempt <= 1 ? undefined : call.lastRequestId,
        requestId: event.requestId,
        retryDelayMs: call.retryDelayMs,
        target,
        transport: event.transport,
      }),
    );
    applyEffectiveReasoning(writer, target.reasoning);
    call.rememberAttempt(event.requestId, writer);
  }

  /** 已登记调用上的事实：里程碑、停滞、重试计划、完成与失败。 */
  #applyEvent(call: CallRecord, event: ModelNetworkStatusEvent, failureError: unknown): void {
    const attempt = call.attempts.get(event.requestId);
    const milestone = MILESTONES[event.type];
    if (milestone !== undefined) {
      if (attempt !== undefined) milestone(attempt, event);
      return;
    }
    if (event.type === "model_retry_scheduled") {
      call.retryDelayMs = event.delayMs;
      return;
    }
    if (event.type !== "model_request_completed" && event.type !== "model_request_failed") return;
    if (!attempt) return;
    if (event.type === "model_request_completed") {
      applyRules(attempt, event, COMPLETION_RULES);
      attempt.finishCompleted();
      this.#settleCall(call, "completed");
      return;
    }
    applyRules(attempt, event, FAILURE_RULES);
    if (event.reason === ModelFailureReason.Cancelled) {
      attempt.finishCancelled("abort_signal");
      this.#settleCall(call, "cancelled");
      return;
    }
    attempt.finishFailed(
      failureStageOf(event),
      categoryOf(event.reason),
      failureError ?? substituteError(event),
    );
    call.forgetAttempt(event.requestId);
    if (event.retryable) return;
    this.#settleCall(call, "failed", event, failureError);
  }

  /** 调用侧结算：完成/取消直接收尾，失败还要写出类别与替身错误。 */
  #settleCall(
    call: CallRecord,
    outcome: "cancelled" | "completed" | "failed",
    event?: ModelRequestFailedStatusEvent,
    failureError?: unknown,
  ): void {
    if (outcome === "completed") call.writer.finishCompleted();
    else if (outcome === "cancelled") call.writer.finishCancelled("abort_signal");
    else if (event !== undefined) {
      call.writer.finishFailed(
        "attempts",
        categoryOf(event.reason),
        failureError ?? substituteError(event),
      );
    }
    call.forgetAttempt(call.lastRequestId ?? "");
    this.#registry.drop(call.logicalCallId);
  }

  #warn(message: string, context: Record<string, unknown>): void {
    try {
      this.#onWarning?.(message, context);
    } catch {
      // 观测健康回调同样属于旁路。
    }
  }
}

/** 逐条应用搬运规则：某条取不到值就跳过，不影响后续字段。 */
function applyRules<E>(
  writer: ModelAttemptSpanWriter,
  event: E,
  rules: readonly FieldRule<E>[],
): void {
  for (const rule of rules) rule.apply(writer, event);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

/** 有效 reasoning 事实：状态与控制总是写，level/budget 只有给出时才写。 */
function applyEffectiveReasoning(
  writer: ModelAttemptSpanWriter,
  reasoning: ModelReasoningObservation,
): void {
  writer.setEffectiveReasoningState(reasoning.effectiveState);
  writer.setEffectiveReasoningControl(reasoning.effectiveControl);
  if (reasoning.effectiveLevel) writer.setEffectiveReasoningLevel(reasoning.effectiveLevel);
  if (reasoning.effectiveBudgetTokens !== undefined) {
    writer.setEffectiveReasoningBudgetTokens(reasoning.effectiveBudgetTokens);
  }
}

/** 失败阶段：`prepare` 阶段的失败发生在配置期，不发生在请求期。 */
function failureStageOf(event: ModelRequestFailedStatusEvent): ModelAttemptFailureStage {
  if (event.errorPhase === "prepare") return "configuration";
  return event.errorPhase ?? "unhandled";
}

function categoryOf(reason: ModelRequestFailedStatusEvent["reason"]): AgentTelemetryErrorCategory {
  return REASON_CATEGORIES[reason] ?? "unknown";
}

/**
 * 没有原始异常时用事件字段构造替身；正文仍会经过脱敏器，
 * 因此这里可以放心带上 Provider 给的消息。
 */
function substituteError(event: ModelRequestFailedStatusEvent): ProviderErrorShape {
  // 字段逐个赋值：四个字段的取值优先级各不相同，写成一行反而看不清。
  const shape = {} as ProviderErrorShape;
  shape.code = event.providerErrorCode ?? event.errorCode;
  shape.message = event.providerErrorMessage ?? event.message;
  shape.name = event.exceptionType ?? "ModelProviderError";
  shape.statusCode = event.statusCode;
  return shape;
}
