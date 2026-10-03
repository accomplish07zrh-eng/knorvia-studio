import {
  SessionEventType,
  STREAM_RECOVERY_DISCARDED_ERROR_NAME,
  STREAM_RECOVERY_DISCARDED_FINISH,
  TurnMachineImpl,
} from "../deps.js";
import type { MessageId, Model, ToolCallId, TraceContext } from "../deps.js";
import { createStreamRecoveryAnchorId, createStreamingToolAttemptId } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";

export const START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE =
  "Start Plan is busy and automatic model stream recovery reached the maximum retry count.";

const STREAM_RECOVERY_MAX_RETRIES = 10;
const START_PLAN_BUSY_MAIN_TURN_ADMISSION_RETRY_DELAYS_MS = [1_000, 2_000] as const;
const MAX_ERROR_CAUSE_DEPTH = 6;

interface StreamRecoveryAttempt {
  maxRetries: number;
  retryNumber: number;
}

type ErrorFields = Record<string, unknown>;

function errorFields(value: unknown): ErrorFields | undefined {
  return typeof value === "object" && value !== null ? (value as ErrorFields) : undefined;
}

function presentString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function* errorRecords(error: unknown): IterableIterator<ErrorFields> {
  const seen = new Set<ErrorFields>();
  let current = error;
  for (let depth = 0; depth <= MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    const record = errorFields(current);
    if (!record || seen.has(record)) return;
    seen.add(record);
    yield record;
    current = record.cause;
  }
}

function busyCode(code: string | undefined): boolean {
  return code === "3008" || code === "3009" || code === "3010";
}

export function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean {
  return state.streamRecoveryRetryCount < STREAM_RECOVERY_MAX_RETRIES;
}

export function beginStreamRecoveryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt {
  state.streamRecoveryRetryCount += 1;
  return { retryNumber: state.streamRecoveryRetryCount, maxRetries: STREAM_RECOVERY_MAX_RETRIES };
}

export function beginStartPlanBusyAdmissionRetryAttempt(
  state: RegularTurnLoopState,
): StreamRecoveryAttempt {
  state.streamRecoveryRetryCount += 1;
  return {
    retryNumber: state.streamRecoveryRetryCount,
    maxRetries: START_PLAN_BUSY_MAIN_TURN_ADMISSION_RETRY_DELAYS_MS.length,
  };
}

export function isStartPlanBusyStreamRecoveryFailure(error: unknown): boolean {
  for (const record of errorRecords(error)) {
    const context = errorFields(record.context);
    const code =
      presentString(record.providerCode) ??
      presentString(context?.providerCode) ??
      presentString(record.code) ??
      presentString(context?.code);
    if (busyCode(code)) return true;
  }
  return false;
}

export function createStartPlanBusyAutoRetryExhaustedError(error: unknown): Error {
  let providerCode = "3010";
  for (const record of errorRecords(error)) {
    const context = errorFields(record.context);
    const candidates = [
      presentString(record.providerCode),
      presentString(context?.providerCode),
      presentString(record.code),
      presentString(context?.code),
    ];
    const selected = candidates.find(busyCode);
    if (selected !== undefined) {
      providerCode = selected;
      break;
    }
  }
  const exhausted = new Error(START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE, {
    cause: error instanceof Error ? error : undefined,
  }) as Error & { code: string; context: ErrorFields };
  exhausted.name = "StartPlanBusyAutoRetryExhaustedError";
  exhausted.code = "model_rate_limited";
  exhausted.context = {
    providerCode,
    reason: "rate_limited",
    retryable: false,
    startPlanBusyAutoRetryExhausted: true,
  };
  return exhausted;
}

export function getStartPlanBusyAdmissionRetryDelayMs(input: {
  error: unknown;
  providerId: string;
  state: RegularTurnLoopState;
  turnNumber: number;
}): number | undefined {
  if (input.turnNumber <= 0) return undefined;
  if (
    input.providerId !== "account:bigmodel-start-plan" &&
    input.providerId !== "account:zai-start-plan"
  )
    return undefined;
  if (!isStartPlanBusyStreamRecoveryFailure(input.error)) return undefined;
  return START_PLAN_BUSY_MAIN_TURN_ADMISSION_RETRY_DELAYS_MS[input.state.streamRecoveryRetryCount];
}

const transientCodes = new Set([
  "model_request_timeout",
  "model_rate_limited",
  "model_server_error",
  "model_network_error",
  "MODEL_REQUEST_TIMEOUT",
  "MODEL_RATE_LIMITED",
  "MODEL_SERVER_ERROR",
  "MODEL_NETWORK_ERROR",
]);
const transientReasons = new Set([
  "stream_idle_timeout",
  "rate_limited",
  "server_error",
  "network_error",
  "timeout",
]);

function retryableFailure(error: unknown): boolean {
  for (const record of errorRecords(error)) {
    if (record.retryable === true) return true;
    const context = errorFields(record.context);
    if (context?.retryable === true) return true;
    const code = presentString(record.code) ?? presentString(context?.code);
    if (code !== undefined && transientCodes.has(code)) return true;
    const reason = presentString(record.reason) ?? presentString(context?.reason);
    if (reason !== undefined && transientReasons.has(reason)) return true;
    if (record.name === "ModelStreamIdleTimeoutError") return true;
    const message = presentString(record.message);
    if (
      message !== undefined &&
      /\b(stream idle|stream stalled|timeout|timed out|ECONNRESET|EPIPE|ETIMEDOUT)\b/i.test(message)
    )
      return true;
  }
  return false;
}

function failureKind(
  error: unknown,
): "provider_timeout" | "provider_network_error" | "provider_stream_error" | "unknown" {
  for (const record of errorRecords(error)) {
    const context = errorFields(record.context);
    const reason = presentString(record.reason) ?? presentString(context?.reason);
    const code = presentString(record.code) ?? presentString(context?.code);
    const name = presentString(record.name);
    const message = presentString(record.message);
    if (
      reason === "stream_idle_timeout" ||
      code === "model_request_timeout" ||
      code === "MODEL_REQUEST_TIMEOUT" ||
      name === "ModelStreamIdleTimeoutError" ||
      (message !== undefined && /\btimeout|timed out|stalled\b/i.test(message))
    )
      return "provider_timeout";
    if (
      reason === "network_error" ||
      code === "model_network_error" ||
      code === "MODEL_NETWORK_ERROR" ||
      (message !== undefined && /\bECONNRESET|EPIPE|ETIMEDOUT\b/i.test(message))
    )
      return "provider_network_error";
  }
  return error instanceof Error ? "provider_stream_error" : "unknown";
}

export async function emitStreamRecoveryStarted(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  error: unknown,
  recoveryAttempt: StreamRecoveryAttempt,
): Promise<void> {
  const payload = {
    attemptId: createStreamingToolAttemptId(options.assistantMessageId),
    assistantMessageId: options.assistantMessageId,
    failureKind: failureKind(error),
    message: error instanceof Error ? error.message : String(error),
    retryNumber: recoveryAttempt.retryNumber,
    maxRetries: recoveryAttempt.maxRetries,
    ...(options.failedRequestId ? { failedRequestId: options.failedRequestId } : {}),
  };
  const event = runtime.createEvent(
    SessionEventType.StreamRecoveryStarted,
    payload,
    options.traceContext,
  );
  await runtime.appendEvent(event, options.traceContext);
  state.events.push(event);
}

export async function emitStreamRecoveryRetryEvents(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  recovery: StreamRecoveryAttempt & {
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    reason: "latest_committed_tool_result" | "no_tool_committed";
    toolCallIds: ToolCallId[];
  },
): Promise<void> {
  const lastToolCallId = recovery.toolCallIds.at(-1);
  const anchorId = lastToolCallId
    ? createStreamRecoveryAnchorId(options.assistantMessageId, lastToolCallId)
    : `${options.assistantMessageId}:previous-message-anchor`;
  // 事件和 pending identity 分别读取 live options；725d8d8 保留缓存 identity 的失败。
  const selected = runtime.createEvent(
    SessionEventType.StreamRecoveryAnchorSelected,
    {
      attemptId: createStreamingToolAttemptId(options.assistantMessageId),
      anchorId,
      reason: recovery.reason,
      committedToolCallIds: recovery.toolCallIds,
    },
    options.traceContext,
  );
  const discarded = runtime.createEvent(
    SessionEventType.StreamRecoveryTailDiscarded,
    {
      attemptId: createStreamingToolAttemptId(options.assistantMessageId),
      anchorId,
      assistantMessageId: options.assistantMessageId,
      discardedReasoningBytes: recovery.discardedReasoningBytes,
      discardedTextBytes: recovery.discardedTextBytes,
      discardedToolCallIds: [],
    },
    options.traceContext,
  );
  const retry = runtime.createEvent(
    SessionEventType.StreamRecoveryRetryStarted,
    {
      attemptId: createStreamingToolAttemptId(options.assistantMessageId),
      anchorId,
      retryNumber: recovery.retryNumber,
      maxRetries: recovery.maxRetries,
      streamMode: "sse",
      ...(options.failedRequestId ? { failedRequestId: options.failedRequestId } : {}),
    },
    options.traceContext,
  );
  await runtime.appendEvent(selected, options.traceContext);
  state.events.push(selected);
  await runtime.appendEvent(discarded, options.traceContext);
  state.events.push(discarded);
  await runtime.appendEvent(retry, options.traceContext);
  state.events.push(retry);
  state.pendingStreamRecoveryRequest = {
    attemptId: createStreamingToolAttemptId(options.assistantMessageId),
    anchorId,
    maxRetries: recovery.maxRetries,
    retryNumber: recovery.retryNumber,
    ...(options.failedRequestId ? { recoveredFromRequestId: options.failedRequestId } : {}),
  };
}

export async function recoverPartialAssistantOutputFailure(input: {
  abortController: AbortController;
  assistantCreatedAt: number;
  discardedReasoningBytes: number;
  discardedTextBytes: number;
  error: unknown;
  options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    model: Model;
    traceContext: TraceContext;
  };
  runtime: AgentRuntimeInternal;
  state: RegularTurnLoopState;
  turnAbortListener: () => void;
}): Promise<boolean> {
  if (
    input.discardedReasoningBytes + input.discardedTextBytes <= 0 ||
    !retryableFailure(input.error)
  )
    return false;
  input.abortController.abort();
  const attempt = beginStreamRecoveryAttempt(input.state);
  await emitStreamRecoveryStarted(input.runtime, input.state, input.options, input.error, attempt);
  await input.runtime.persistAssistantMessage(
    input.options.assistantMessageId,
    input.state.currentUserMessageId,
    input.assistantCreatedAt,
    {
      completed: Date.now(),
      error: {
        name: STREAM_RECOVERY_DISCARDED_ERROR_NAME,
        data: {
          message: "Partial assistant output was discarded before a streaming retry.",
          retryNumber: attempt.retryNumber,
        },
      },
      finish: STREAM_RECOVERY_DISCARDED_FINISH,
    },
    input.options.traceContext,
    input.options.model,
  );
  input.state.modelResponse = "";
  input.state.modelStepCount += 1;
  recordModelHistoryRound(input.state);
  input.state.turnMachine = new TurnMachineImpl(input.state.turnMachine.receiveModelResponse(""));
  input.state.turnMachine = new TurnMachineImpl(input.state.turnMachine.aggregateResults());
  await emitStreamRecoveryRetryEvents(input.runtime, input.state, input.options, {
    ...attempt,
    discardedReasoningBytes: input.discardedReasoningBytes,
    discardedTextBytes: input.discardedTextBytes,
    reason: "no_tool_committed",
    toolCallIds: [],
  });
  input.state.turnAbortSignal.removeEventListener("abort", input.turnAbortListener);
  return true;
}
