// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger, ModelStatusSink } from "@knorvia/contracts";
import type { ModelStatusContext } from "./runner-status.js";
import { publishModelStatus } from "./runner-status.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import { calculateRetryDelay, sleep } from "./runner-retry.js";
export function canRetryEmptyCompletion(input: {
  abortSignal?: AbortSignal;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
}): boolean {
  return !input.abortSignal?.aborted && input.attempt < input.maxAttempts && input.retryCount < 1;
}
export async function scheduleEmptyCompletionRetry(input: {
  abortSignal?: AbortSignal;
  attempt: number;
  completedAt: number;
  errorPhase: "response" | "stream";
  logger?: Logger;
  requestHeaders: Record<string, string>;
  requestStatusSink?: ModelStatusSink;
  responseHeaders: Record<string, string>;
  retry: ResolvedAiSdkModelRetryOptions;
  retryBudgetAttempt: number;
  startedAt: number;
  statusContext: ModelStatusContext;
  statusSink?: ModelStatusSink;
  streamOutputCommitted?: boolean;
}): Promise<void> {
  const delayMs = calculateRetryDelay(input.retry, input.retryBudgetAttempt);
  await publishModelStatus(
    {
      ...input.statusContext,
      type: "model_retry_scheduled",
      timestamp: new Date().toISOString(),
      attempt: input.attempt,
      delayMs,
      nextAttempt: input.attempt + 1,
      reason: "stale_connection",
      message: "Provider returned an empty completion",
      requestHeaders: input.requestHeaders,
      responseHeaders: input.responseHeaders,
    } as never,
    {
      logger: input.logger,
      requestStatusSink: input.requestStatusSink,
      statusSink: input.statusSink,
    },
  );
  await sleep(delayMs, input.abortSignal);
}
