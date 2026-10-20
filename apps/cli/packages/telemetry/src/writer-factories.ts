// SPDX-License-Identifier: Apache-2.0
// Writer 工厂：把契约里那些「每个 Span 一套方法」的接口，映射到同一个 SpanWriter 上。
//
// 这里只有闭包与查表，没有继承层级：
//  - 领域方法 → 一次 set / event；
//  - 终态方法 → 一次 finishXxx；
//  - finishUnhandled → 交给 classifyErrorCategory。
// 每种 Span 的差异体现在「多写哪些属性」，而不是「多一个类」。
import type { Attributes } from "@opentelemetry/api";
import type {
  AgentStepSpanWriter,
  AgentStepTraceStart,
  AgentTelemetryCancellationReason,
  AgentTelemetryErrorCategory,
  AgentTurnSpanWriter,
  CommandExecutionSpanWriter,
  CommandFailureStage,
  CompactionFailureStage,
  ContextCompactionSpanWriter,
  DetachedFailureStage,
  DetachedOperationSpanWriter,
  ModelAttemptFailureStage,
  ModelAttemptSpanWriter,
  ModelAttemptTraceStart,
  ModelCallFailureStage,
  ModelCallSpanWriter,
  ModelReasoningControlType,
  ModelReasoningState,
  ToolExecutionSpanWriter,
  ToolFailureStage,
} from "@knorvia/contracts/telemetry";
import {
  compactAttributes,
  finiteNonNegative,
  integer,
  safeEnum,
  safeIdentifier,
  safeString,
} from "./gates.js";
import { SpanWriter } from "./span-writer.js";
import {
  commandCompatibilityAttributes,
  httpResponseCompatibilityAttributes,
  modelResponseCompatibilityAttributes,
} from "./compatibility-adapters.js";
import { sanitizeErrorMessage } from "./error-sanitizer.js";

/** 失败分类：状态码优先，其次错误码子串，其余 unknown；取消优先于一切。 */
const STATUS_CATEGORIES: ReadonlyArray<readonly [number, AgentTelemetryErrorCategory]> = [
  [401, "authentication"],
  [403, "authentication"],
  [408, "timeout"],
  [429, "rate_limit"],
  [504, "timeout"],
];

const CODE_CATEGORIES: ReadonlyArray<readonly [readonly string[], AgentTelemetryErrorCategory]> = [
  [["timeout"], "timeout"],
  [["network", "econn", "enotfound", "tls"], "network"],
];

/** 异常 → 错误类别。 */
export function classifyErrorCategory(error: unknown): AgentTelemetryErrorCategory {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "cancelled";
    if ((error as Error & { code?: unknown }).code === "ABORT_ERR") return "cancelled";
  }
  if (error === null || typeof error !== "object") return "unknown";
  const record = error as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : record.statusCode;
  for (const [code, category] of STATUS_CATEGORIES) {
    if (status === code) return category;
  }
  const text = String(record.code ?? "").toLowerCase();
  for (const [needles, category] of CODE_CATEGORIES) {
    if (needles.some((needle) => text.includes(needle))) return category;
  }
  return "unknown";
}

/** command 的首输出 Metric 出口。 */
export interface FirstOutputSink {
  recordCommandFirstOutput(durationMs: number, labels: Attributes): void;
}

/** 模型侧的 Metric 出口：三件与计数有关的事。 */
export interface ModelMetricSink {
  recordModelAttemptDetail(labels: Attributes, detail: AttemptDetail): void;
  recordModelCallAttempts(attemptCount: number, labels: Attributes): void;
  recordModelTokenDelta(tokenType: TokenKind, delta: number, labels: Attributes): void;
}

export interface AttemptDetail {
  firstContentMs?: number;
  firstProviderEventMs?: number;
  firstTextMs?: number;
  stallCount: number;
  streamMaxIdleMs: number;
}

export type TokenKind = "cache_read" | "cache_write" | "input" | "output" | "reasoning";

/** 每个 writer 工厂都能拿到的公共部件。 */
export interface FactoryTools {
  metrics: ModelMetricSink;
  /** 创建 attempt 子 Span 的回调（由运行时提供）。 */
  startAttempt: (call: ModelCallState, input: ModelAttemptTraceStart) => ModelAttemptSpanWriter;
}

/** 逻辑调用对 attempt 的可见状态。 */
export interface ModelCallState {
  logicalCallId: string | undefined;
  modelRole: string | undefined;
  noteAttemptFailed(): void;
  operation: string | undefined;
}

/** turn 的 writer：结果类型是唯一额外的属性。 */
export function turnWriter(core: SpanWriter): AgentTurnSpanWriter {
  return {
    captureCausation: () => core.captureCausation(),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: (resultType = "other") =>
      core.finishCompleted(() => core.set("knorvia.agent_turn.result_type", resultType)),
    finishFailed: (stage, category, error) => core.finishFailed(stage, category, error),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
  };
}

/** step 的 writer：终结原因是 Metric 标签的一部分。 */
export function stepWriter(core: SpanWriter): AgentStepSpanWriter {
  return {
    captureCausation: () => core.captureCausation(),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: (terminalReason) => {
      core.labels.terminal_reason = terminalReason;
      core.finishCompleted(() => core.set("knorvia.agent_step.terminal_reason", terminalReason));
    },
    finishDiscarded: () => core.finishDomain("discarded"),
    finishFailed: (stage, category, error) => core.finishFailed(stage, category, error),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
  };
}

/** tool 的 writer：权限状态、输出体量与 command 子 Span。 */
export function toolWriter(
  core: SpanWriter,
  startCommand: (
    input: Parameters<ToolExecutionSpanWriter["startCommand"]>[0],
  ) => CommandExecutionSpanWriter,
): ToolExecutionSpanWriter {
  let permissionAsked = false;
  return {
    captureCausation: () => core.captureCausation(),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: () => core.finishCompleted(),
    finishDenied: (reason) =>
      core.finishDomain("denied", () =>
        core.set("knorvia.tool_execution.permission_denial_reason", reason),
      ),
    finishFailed: (stage: ToolFailureStage, category, error) =>
      core.finishFailed(stage, category, error),
    markPermissionRequested: () => {
      if (permissionAsked) return;
      permissionAsked = true;
      core.event("permission_requested");
    },
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
    setOutputBytes: (bytes) =>
      core.set("knorvia.tool_execution.output_bytes", finiteNonNegative(bytes)),
    setOutputTruncated: (truncated) =>
      core.set("knorvia.tool_execution.output_truncated", truncated),
    setPermissionDecision: (decision) => {
      core.set("knorvia.tool_execution.permission_decision", decision);
      if (permissionAsked && decision !== "not_required") {
        core.event("permission_decided", { decision });
      }
    },
    startCommand: (input) => startCommand(input),
  };
}

/** command 的 writer：首个输出时刻既是属性也是终态 Metric。 */
export function commandWriter(core: SpanWriter, sink: FirstOutputSink): CommandExecutionSpanWriter {
  let firstOutputMs: number | undefined;
  // 首输出的耗时是「终结时才成立」的指标：终结前上报一次，之后不再重复。
  const reportFirstOutput = () => {
    if (firstOutputMs === undefined) return;
    sink.recordCommandFirstOutput(firstOutputMs, compactAttributes({ ...core.labels }));
  };
  return {
    captureCausation: () => core.captureCausation(),
    finishBackgrounded: () => {
      reportFirstOutput();
      core.finishDomain("backgrounded");
    },
    finishCancelled: (reason: AgentTelemetryCancellationReason) => {
      reportFirstOutput();
      core.finishCancelled(reason);
    },
    finishCompleted: () => {
      reportFirstOutput();
      core.finishCompleted();
    },
    finishFailed: (stage: CommandFailureStage, category, error) => {
      reportFirstOutput();
      core.finishFailed(stage, category, error);
    },
    markFirstOutput: () => {
      if (firstOutputMs !== undefined) return;
      firstOutputMs = core.elapsed();
      core.set("knorvia.command_execution.first_output_ms", firstOutputMs);
      core.event("first_output");
    },
    markTerminationRequested: (reason) => core.event("termination_requested", { reason }),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
    setExitCode: (exitCode) => {
      const normalized = integer(exitCode);
      core.set("knorvia.command_execution.exit_code", normalized);
      core.setAll(commandCompatibilityAttributes({ exitCode: normalized }));
    },
    setOutputBytes: (bytes) =>
      core.set("knorvia.command_execution.output_bytes", finiteNonNegative(bytes)),
    setSignal: (signal) => {
      const normalized = safeIdentifier(signal);
      core.set("knorvia.command_execution.signal", normalized);
      core.setAll(commandCompatibilityAttributes({ signal: normalized }));
    },
    setTimedOut: (timedOut) => core.set("knorvia.command_execution.timed_out", timedOut),
  };
}

/** compaction 的 writer：token 用量与回退事件。 */
export function compactionWriter(core: SpanWriter): ContextCompactionSpanWriter {
  return {
    captureCausation: () => core.captureCausation(),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: () => core.finishCompleted(),
    finishDiscarded: () => core.finishDomain("discarded"),
    finishFailed: (stage: CompactionFailureStage, category, error) =>
      core.finishFailed(stage, category, error),
    markFallbackSelected: (reason) => core.event("fallback_selected", { reason: safeEnum(reason) }),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
    setInputTokens: (tokens) =>
      core.set("knorvia.context_compaction.input_tokens", finiteNonNegative(tokens)),
    setOutputTokens: (tokens) =>
      core.set("knorvia.context_compaction.output_tokens", finiteNonNegative(tokens)),
  };
}

/** detached 的 writer：结果类型。 */
export function detachedWriter(core: SpanWriter): DetachedOperationSpanWriter {
  return {
    captureCausation: () => core.captureCausation(),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: () => core.finishCompleted(),
    finishFailed: (stage: DetachedFailureStage, category, error) =>
      core.finishFailed(stage, category, error),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
    setResultType: (resultType) => core.set("knorvia.detached_operation.result_type", resultType),
  };
}

/** model_call 的 writer：尝试计数与重试状态。 */
export function modelCallWriter(
  core: SpanWriter,
  startAttempt: (call: ModelCallState, input: ModelAttemptTraceStart) => ModelAttemptSpanWriter,
  state: ModelCallState,
): ModelCallSpanWriter {
  return {
    captureCausation: () => core.captureCausation(),
    finishAbandoned: (reason) => core.abandonBy(reason),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: () => core.finishCompleted(),
    finishFailed: (stage: ModelCallFailureStage, category, error) =>
      core.finishFailed(stage, category, error),
    markFallbackSelected: (reason) =>
      core.event("fallback_selected", { reason: safeString(reason, 128) }),
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => core.finishThrown(error, classifyErrorCategory(error))),
    startAttempt: (input) => startAttempt(state, input),
  };
}

/** model_attempt 的 writer：token 增量、首包时间与流停滞。 */
export function modelAttemptWriter(
  core: SpanWriter,
  sink: ModelMetricSink,
  onFailed: () => void,
): ModelAttemptSpanWriter {
  const usage = { cache_read: 0, cache_write: 0, input: 0, output: 0, reasoning: 0 };
  const marks: { content?: number; providerEvent?: number; text?: number } = {};
  const stalls = { count: 0, maxIdleMs: 0 };
  const accumulate = (kind: TokenKind, reported: number, attribute: string) => {
    const normalized = finiteNonNegative(reported);
    if (normalized === undefined) return;
    const delta = normalized - usage[kind];
    if (delta < 0) return;
    usage[kind] = normalized;
    core.guard(() => sink.recordModelTokenDelta(kind, delta, core.labels));
    core.set(attribute, normalized);
  };
  return {
    captureCausation: () => core.captureCausation(),
    finishAbandoned: (reason) => core.abandonBy(reason),
    finishCancelled: (reason: AgentTelemetryCancellationReason) => core.finishCancelled(reason),
    finishCompleted: () => core.finishCompleted(),
    finishFailed: (stage: ModelAttemptFailureStage, category, error) => {
      onFailed();
      core.finishFailed(stage, category, error);
    },
    markFirstContent: () => {
      if (marks.content !== undefined) return;
      marks.content = core.elapsed();
      core.set("knorvia.model_attempt.time_to_first_content_ms", marks.content);
      core.event("first_content");
    },
    markFirstProviderEvent: () => {
      if (marks.providerEvent !== undefined) return;
      marks.providerEvent = core.elapsed();
      core.set("knorvia.model_attempt.time_to_first_provider_event_ms", marks.providerEvent);
      core.event("first_provider_event");
    },
    markFirstText: () => {
      if (marks.text !== undefined) return;
      marks.text = core.elapsed();
      core.set("knorvia.model_attempt.time_to_first_text_ms", marks.text);
      core.event("first_text");
    },
    markStreamStalled: (idleMs) => {
      const normalized = finiteNonNegative(idleMs);
      if (normalized === undefined) return;
      stalls.count += 1;
      stalls.maxIdleMs = Math.max(stalls.maxIdleMs, normalized);
      core.event("stream_stalled", { idle_ms: normalized });
    },
    run: <T>(execute: () => T) =>
      core.run(execute, (error) => {
        onFailed();
        core.finishThrown(error, classifyErrorCategory(error));
      }),
    setCacheReadTokens: (tokens) =>
      accumulate("cache_read", tokens, "knorvia.model_attempt.cache_read_tokens"),
    setCacheWriteTokens: (tokens) =>
      accumulate("cache_write", tokens, "knorvia.model_attempt.cache_write_tokens"),
    setEffectiveReasoningBudgetTokens: (tokens) =>
      core.set(
        "knorvia.model_attempt.reasoning_effective_budget_tokens",
        finiteNonNegative(tokens),
      ),
    setEffectiveReasoningControl: (control: ModelReasoningControlType) =>
      core.set("knorvia.model_attempt.reasoning_effective_control", safeEnum(control)),
    setEffectiveReasoningLevel: (level) =>
      core.set("knorvia.model_attempt.reasoning_effective_level", safeString(level, 128)),
    setEffectiveReasoningState: (state: ModelReasoningState) =>
      core.set("knorvia.model_attempt.reasoning_effective_state", safeEnum(state)),
    setFinishReason: (reason) => {
      const value = safeString(reason, 128);
      core.set("knorvia.model_attempt.finish_reason", value);
      core.setAll(modelResponseCompatibilityAttributes({ finishReason: value }));
    },
    setHttpStatusCode: (statusCode) => {
      core.set("knorvia.model_attempt.http_status_code", integer(statusCode));
      core.setAll(httpResponseCompatibilityAttributes(statusCode));
    },
    setInputTokens: (tokens) => {
      accumulate("input", tokens, "knorvia.model_attempt.input_tokens");
      core.setAll(modelResponseCompatibilityAttributes({ inputTokens: tokens }));
    },
    setOutputTokens: (tokens) => {
      accumulate("output", tokens, "knorvia.model_attempt.output_tokens");
      core.setAll(modelResponseCompatibilityAttributes({ outputTokens: tokens }));
    },
    setProviderErrorCode: (code) =>
      core.set("knorvia.model_attempt.provider_error_code", safeString(code, 128)),
    setProviderErrorMessage: (message) =>
      core.set("knorvia.model_attempt.provider_error_message", sanitizeErrorMessage(message)),
    setProviderRequestId: (requestId) =>
      core.set("knorvia.model_attempt.provider_request_id", safeString(requestId, 256)),
    setReasoningTokens: (tokens) =>
      accumulate("reasoning", tokens, "knorvia.model_attempt.reasoning_tokens"),
    setResponseModel: (model) => {
      const value = safeString(model.model, 128);
      core.set("knorvia.model_attempt.response_model", value);
      core.setAll(modelResponseCompatibilityAttributes({ responseModel: value }));
    },
    setRetryAfterMs: (delayMs) =>
      core.set("knorvia.model_attempt.retry_after_ms", finiteNonNegative(delayMs)),
    setStreamOutputCommitted: (committed) =>
      core.set("knorvia.model_attempt.stream_output_committed", committed),
  };
}
