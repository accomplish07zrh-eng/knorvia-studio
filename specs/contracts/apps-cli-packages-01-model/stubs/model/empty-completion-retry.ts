// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export function canRetryEmptyCompletion(input: {
  abortSignal?: AbortSignal;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
}): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
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
  throw new Error("not implemented: apps-cli-packages-01-model");
}
