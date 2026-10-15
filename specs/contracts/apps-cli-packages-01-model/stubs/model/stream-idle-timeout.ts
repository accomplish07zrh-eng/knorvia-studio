// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";
export function resolveModelStreamIdleTimeoutMs(options: {
  baseTimeoutMs?: number;
  retryNumber?: number;
}): number {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function isModelStreamIdleTimeoutError(
  error: unknown,
): error is ModelStreamIdleTimeoutError {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function createLinkedAbortController(parentSignal?: AbortSignal): LinkedAbortController {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export async function readNextWithStreamIdleTimeout<T>(
  iterator: AsyncIterator<T>,
  options: {
    abortController: AbortController;
    onTimeout?: (error: ModelStreamIdleTimeoutError) => void | Promise<void>;
    timeoutMs: number;
  },
): Promise<IteratorResult<T>> {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
