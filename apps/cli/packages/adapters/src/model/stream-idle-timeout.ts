// SPDX-License-Identifier: Apache-2.0
// 流空闲超时：额度 = 基础 + 重试号 × 30 秒增量（基础 ≤ 0 视为禁用）；读取下一条时把
// 「迭代 / 取消 / 计时」三者竞速，先到先生效。超时错误带 idleMs/timeoutMs 两字段，
// 识别兼容 duck typing（code 命中即算）。增量与错误文案是协议面，逐字保持。

export { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";
import { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";

const RETRY_INCREMENT_MS = 30_000; // 每次重试叠加的增量
const TIMEOUT_ERROR_NAME = "ModelStreamIdleTimeoutError";
const TIMEOUT_ERROR_CODE = "MODEL_STREAM_IDLE_TIMEOUT";
const ABORT_ONCE = { once: true };
type TimerHandle = ReturnType<typeof setTimeout>;

export function resolveModelStreamIdleTimeoutMs(allowance: {
  baseTimeoutMs?: number; // 基础额度（缺省取契约默认）
  retryNumber?: number; // 重试递增号
}): number {
  const base = allowance.baseTimeoutMs ?? DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS;
  const usable = Number.isFinite(base) && base > 0;
  const retry = Math.max(0, Math.floor(allowance.retryNumber ?? 0));
  return usable ? base + retry * RETRY_INCREMENT_MS : 0;
}

class ModelStreamIdleTimeoutError extends Error {
  readonly code = TIMEOUT_ERROR_CODE;
  readonly idleMs!: number; // 观察到的空闲毫秒
  readonly timeoutMs!: number; // 生效额度

  constructor(span: { idleMs: number; timeoutMs: number }) {
    super(`Model stream produced no event for ${span.idleMs}ms`);
    Object.assign(this, {
      name: TIMEOUT_ERROR_NAME,
      idleMs: span.idleMs,
      timeoutMs: span.timeoutMs,
    });
  }
}

export function isModelStreamIdleTimeoutError(
  candidate: unknown,
): candidate is ModelStreamIdleTimeoutError {
  if (candidate instanceof ModelStreamIdleTimeoutError) return true;
  const record =
    typeof candidate === "object" && candidate !== null
      ? (candidate as { code?: unknown })
      : undefined;
  return record?.code === TIMEOUT_ERROR_CODE;
}

interface LinkedAbortController {
  controller: AbortController; // 关联后的控制器
  signal: AbortSignal; // 关联后的信号
  cleanup(): void; // 解除父监听
}

export function createLinkedAbortController(parent?: AbortSignal): LinkedAbortController {
  const controller: AbortController = new AbortController();
  const state = { detached: false };
  const forward = () => controller.abort(parent?.reason);
  const detach = () => {
    if (state.detached) return;
    state.detached = true;
    parent?.removeEventListener("abort", forward);
  };
  if (parent?.aborted) forward();
  else parent?.addEventListener("abort", forward, ABORT_ONCE);
  return { controller, signal: controller.signal, cleanup: detach };
}

interface ReadAllowance {
  abortController: AbortController; // 取消控制器（超时时以超时错误中止）
  onTimeout?: (error: ModelStreamIdleTimeoutError) => void | Promise<void>; // 超时观察回调
  timeoutMs: number; // 生效额度（≤ 0 禁用）
}

export async function readNextWithStreamIdleTimeout<T>(
  iterator: AsyncIterator<T>,
  allowance: ReadAllowance,
): Promise<IteratorResult<T>> {
  const signal = allowance.abortController.signal;
  const rejection = () => signal.reason ?? new DOMException("Aborted", "AbortError");
  if (signal.aborted) throw rejection();
  let timer: TimerHandle | undefined;
  let detachAbort: (() => void) | undefined;
  try {
    // 一次性竞速容器：迭代、取消、计时三方先到先得
    return await new Promise<IteratorResult<T>>((settle, reject) => {
      let done = false;
      const finish = (apply: () => void) => {
        if (done) return;
        done = true;
        apply();
      };
      function onAbort() {
        const reason = rejection();
        if (!isModelStreamIdleTimeoutError(reason)) finish(() => reject(reason));
      }
      detachAbort = () => signal.removeEventListener("abort", onAbort);
      signal.addEventListener("abort", onAbort, ABORT_ONCE);
      iterator
        .next()
        .then((step) => finish(() => settle(step)))
        .catch((error) => finish(() => reject(error)));
      if (allowance.timeoutMs > 0) {
        timer = setTimeout(async () => {
          const timeout = new ModelStreamIdleTimeoutError({
            idleMs: allowance.timeoutMs,
            timeoutMs: allowance.timeoutMs,
          });
          allowance.abortController.abort(timeout);
          try {
            await allowance.onTimeout?.(timeout);
          } finally {
            finish(() => reject(timeout));
          }
        }, allowance.timeoutMs);
      }
    });
  } finally {
    // 清理计时与监听：任何出口都不留悬挂
    if (timer !== undefined) clearTimeout(timer);
    if (detachAbort) detachAbort();
  }
}
