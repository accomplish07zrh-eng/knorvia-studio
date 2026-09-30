// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
export { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";
import { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";
const RETRY_INCREMENT_MS = 30_000;
export function resolveModelStreamIdleTimeoutMs(options: {
  baseTimeoutMs?: number;
  retryNumber?: number;
}): number {
  const base = options.baseTimeoutMs ?? DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(base) || base <= 0) return 0;
  const retry = Math.max(0, Math.floor(options.retryNumber ?? 0));
  return base + retry * RETRY_INCREMENT_MS;
}
class ModelStreamIdleTimeoutError extends Error {
  readonly code = "MODEL_STREAM_IDLE_TIMEOUT";
  readonly idleMs: number;
  readonly timeoutMs: number;
  constructor(options: { idleMs: number; timeoutMs: number }) {
    super(`Model stream produced no event for ${options.idleMs}ms`);
    this.name = "ModelStreamIdleTimeoutError";
    this.idleMs = options.idleMs;
    this.timeoutMs = options.timeoutMs;
  }
}
export function isModelStreamIdleTimeoutError(
  error: unknown,
): error is ModelStreamIdleTimeoutError {
  return (
    error instanceof ModelStreamIdleTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "MODEL_STREAM_IDLE_TIMEOUT")
  );
}
interface LinkedAbortController {
  controller: AbortController;
  signal: AbortSignal;
  cleanup(): void;
}
export function createLinkedAbortController(parentSignal?: AbortSignal): LinkedAbortController {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  return {
    controller,
    signal: controller.signal,
    cleanup: () => parentSignal?.removeEventListener("abort", abort),
  };
}
export async function readNextWithStreamIdleTimeout<T>(
  iterator: AsyncIterator<T>,
  options: {
    abortController: AbortController;
    onTimeout?: (error: ModelStreamIdleTimeoutError) => void | Promise<void>;
    timeoutMs: number;
  },
): Promise<IteratorResult<T>> {
  const signal = options.abortController.signal;
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const pending: Promise<IteratorResult<T>>[] = [
      iterator.next(),
      new Promise<never>((_, reject) => {
        onAbort = () => {
          const reason = signal.reason ?? new DOMException("Aborted", "AbortError");
          if (!isModelStreamIdleTimeoutError(reason)) reject(reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ];
    if (options.timeoutMs > 0)
      pending.push(
        new Promise<never>((_, reject) => {
          timer = setTimeout(async () => {
            const error = new ModelStreamIdleTimeoutError({
              idleMs: options.timeoutMs,
              timeoutMs: options.timeoutMs,
            });
            options.abortController.abort(error);
            try {
              await options.onTimeout?.(error);
            } finally {
              reject(error);
            }
          }, options.timeoutMs);
        }),
      );
    return await Promise.race(pending);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
