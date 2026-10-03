import type { KnorviaApiRetryStatus } from "./task-types-core.js";

function recordFrom(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function integerFrom(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum
    ? value
    : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeKnorviaApiRetryStatus(
  value: unknown,
): KnorviaApiRetryStatus | null | undefined {
  if (value === null) return null;

  const fields = recordFrom(value);
  if (Object.keys(fields).length === 0) return undefined;

  const attempt =
    integerFrom(fields.attempt, 1) ?? Math.max((integerFrom(fields.nextAttempt, 1) ?? 2) - 1, 1);
  const retryLimit =
    integerFrom(fields.maxRetries, 0) ?? (integerFrom(fields.maxAttempts, 1) ?? attempt + 1) - 1;

  return {
    kind: "api_retry",
    attempt,
    maxRetries: Math.max(retryLimit, attempt),
    retryDelayMs: integerFrom(fields.retryDelayMs, 0) ?? integerFrom(fields.delayMs, 0) ?? 0,
    errorStatus: integerFrom(fields.errorStatus, 0) ?? integerFrom(fields.statusCode, 0) ?? null,
    error:
      stringFrom(fields.error) ??
      stringFrom(fields.message) ??
      stringFrom(fields.reason) ??
      "Model retry scheduled",
  };
}

export function knorviaApiRetryFromModelNetworkStatusPayload(
  payload: Record<string, unknown>,
): KnorviaApiRetryStatus | null | undefined {
  switch (payload.type) {
    case "model_retry_scheduled":
      return normalizeKnorviaApiRetryStatus(payload);
    case "model_request_started": {
      const recovery = knorviaApiRetryFromStreamRecoveryPayload(payload.streamRecovery);
      if (recovery !== undefined) return recovery;

      // 兼容普通适配器重试：下一次请求开始不代表恢复成功，需等待有效进度再清除重试状态。
      return (integerFrom(payload.attempt, 1) ?? 1) <= 1 ? null : undefined;
    }
    case "model_request_completed":
      return null;
    case "model_request_failed":
      return payload.retryable === true ? undefined : null;
    default:
      return undefined;
  }
}

export function isKnorviaModelRetryRecoveryProgressPayload(
  payload: Record<string, unknown>,
): boolean {
  switch (payload.kind) {
    case "text_delta":
    case "reasoning_delta":
      return typeof payload.delta === "string" && Boolean(payload.delta);
    case "tool_input_start":
    case "tool_input_end":
    case "tool_call":
      return typeof payload.toolCallId === "string" && Boolean(payload.toolCallId);
    case "tool_input_delta":
      return (
        typeof payload.toolCallId === "string" &&
        Boolean(payload.toolCallId) &&
        typeof payload.delta === "string" &&
        Boolean(payload.delta)
      );
    default:
      return false;
  }
}

export function knorviaApiRetryFromStreamRecoveryPayload(
  value: unknown,
): KnorviaApiRetryStatus | undefined {
  const fields = recordFrom(value);
  const attempt = integerFrom(fields.retryNumber, 1);
  if (attempt === undefined) return undefined;

  // 流恢复有独立的 retryNumber 计数，不能使用适配器的 attempt 推断流恢复次数。
  return {
    kind: "api_retry",
    attempt,
    maxRetries: Math.max(integerFrom(fields.maxRetries, 0) ?? attempt, attempt),
    retryDelayMs: 0,
    errorStatus: null,
    error: stringFrom(fields.message) ?? "Model stream recovery retry started",
  };
}
