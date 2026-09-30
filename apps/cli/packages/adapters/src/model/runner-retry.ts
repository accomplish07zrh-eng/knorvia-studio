// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { AiSdkModelAdapterError } from "./errors.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import type { ModelStatusContext } from "./runner-status.js";
export class TerminalStreamChunkError extends Error {
  readonly adapterError: AiSdkModelAdapterError;
  constructor(adapterError: AiSdkModelAdapterError) {
    super(adapterError.message, { cause: adapterError });
    this.name = "TerminalStreamChunkError";
    this.adapterError = adapterError;
  }
}
export function calculateRetryDelay(
  retry: ResolvedAiSdkModelRetryOptions,
  attempt: number,
  retryAfterMs?: number,
): number {
  const raw = retry.baseDelayMs * retry.backoffFactor ** Math.max(0, attempt - 1);
  let delay = Math.min(retry.maxDelayMs, raw);
  if (
    retryAfterMs !== undefined &&
    retryAfterMs >= 0 &&
    (retryAfterMs <= 300_000 || retryAfterMs < raw)
  )
    delay = retryAfterMs;
  return Math.max(0, Math.round(retry.jitter ? delay * (0.5 + Math.random() * 0.5) : delay));
}
export function sleep(delayMs: number, abortSignal?: AbortSignal): Promise<void> {
  if (abortSignal?.aborted)
    return Promise.reject(abortSignal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, delayMs));
    function done() {
      cleanup();
      resolve();
    }
    function abort() {
      cleanup();
      reject(abortSignal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    function cleanup() {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", abort);
    }
    abortSignal?.addEventListener("abort", abort, { once: true });
  });
}
export function logRetryDelayDecision(input: {
  attempt: number;
  canRetry: boolean;
  delayMs?: number;
  failure: ClassifiedModelFailure;
  logger?: Logger;
  responseHeaders: Record<string, string>;
  statusContext: ModelStatusContext;
}): void {
  input.logger?.debug("Model retry decision", {
    attempt: input.attempt,
    canRetry: input.canRetry,
    delayMs: input.delayMs,
    reason: input.failure.reason,
    requestId: input.statusContext.requestId,
  });
}
export function toAdapterError(
  error: unknown,
  failure: ClassifiedModelFailure,
  statusContext: ModelStatusContext,
  attempt: number,
  additionalContext: Record<string, unknown> = {},
): AiSdkModelAdapterError {
  if (error instanceof AiSdkModelAdapterError)
    return error.enrichContext({ ...statusContext, attempt, ...additionalContext });
  return new AiSdkModelAdapterError(failure.code, failure.message, {
    cause: error,
    context: {
      ...statusContext,
      attempt,
      reason: failure.reason,
      retryReason: failure.retryReason,
      retryable: failure.retryable,
      statusCode: failure.statusCode,
      retryAfterMs: failure.retryAfterMs,
      ...additionalContext,
    },
  });
}
