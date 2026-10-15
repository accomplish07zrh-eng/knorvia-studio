// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export class TerminalStreamChunkError extends Error {
  readonly adapterError: AiSdkModelAdapterError;
  constructor(adapterError: AiSdkModelAdapterError) {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
export function calculateRetryDelay(
  retry: ResolvedAiSdkModelRetryOptions,
  attempt: number,
  retryAfterMs?: number,
): number {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function sleep(delayMs: number, abortSignal?: AbortSignal): Promise<void> {
  throw new Error("not implemented: apps-cli-packages-01-model");
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
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function toAdapterError(
  error: unknown,
  failure: ClassifiedModelFailure,
  statusContext: ModelStatusContext,
  attempt: number,
  additionalContext: Record<string, unknown> = {},
): AiSdkModelAdapterError {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
