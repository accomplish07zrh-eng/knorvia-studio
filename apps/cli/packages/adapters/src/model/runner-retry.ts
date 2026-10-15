// SPDX-License-Identifier: Apache-2.0
// 重试执行工具：退避延迟计算（Retry-After 优先 + 抖动）、可取消等待、重试决策 debug 日志、
// 以及把失败分类折成适配错误（补缺式 enrichContext）。延迟公式与日志文案逐字保持。

import type { Logger } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { AiSdkModelAdapterError } from "./errors.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import type { ModelStatusContext } from "./runner-status.js";

const CHUNK_ERROR_NAME = "TerminalStreamChunkError";

export class TerminalStreamChunkError extends Error {
  readonly adapterError: AiSdkModelAdapterError;

  constructor(wrapped: AiSdkModelAdapterError) {
    super(wrapped.message, { cause: wrapped });
    this.name = CHUNK_ERROR_NAME;
    this.adapterError = wrapped;
  }
}

export function calculateRetryDelay(
  settings: ResolvedAiSdkModelRetryOptions,
  round: number,
  retryAfterHint?: number,
): number {
  const exponent = Math.max(0, round - 1);
  const raw = settings.baseDelayMs * settings.backoffFactor ** exponent;
  let delay = Math.min(settings.maxDelayMs, raw);
  const hintUsable =
    retryAfterHint !== undefined &&
    retryAfterHint >= 0 &&
    (retryAfterHint <= 300_000 || retryAfterHint < raw);
  if (hintUsable) delay = retryAfterHint;
  const scaled = settings.jitter ? delay * (0.5 + Math.random() * 0.5) : delay;
  return Math.max(0, Math.round(scaled));
}

export function sleep(pauseMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((settle, reject) => {
    const abortReason = () => signal?.reason ?? new DOMException("Aborted", "AbortError");
    if (signal?.aborted) throw abortReason();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelWait = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", cancelWait);
      reject(abortReason());
    };
    timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", cancelWait);
        settle();
      },
      Math.max(0, pauseMs),
    );
    signal?.addEventListener("abort", cancelWait, { once: true });
  });
}

interface RetryDecisionLog {
  attempt: number; // 当前物理序号
  canRetry: boolean; // 本轮裁决结果
  delayMs?: number; // 拟退避毫秒
  failure: ClassifiedModelFailure; // 失败分类
  logger?: Logger; // 诊断日志口
  responseHeaders: Record<string, string>; // 响应头快照
  statusContext: ModelStatusContext; // 归因上下文
}

export function logRetryDelayDecision(decision: RetryDecisionLog): void {
  decision.logger?.debug("Model retry decision", {
    attempt: decision.attempt,
    canRetry: decision.canRetry,
    delayMs: decision.delayMs,
    reason: decision.failure.reason,
    requestId: decision.statusContext.requestId,
  });
}

export function toAdapterError(
  origin: unknown,
  verdict: ClassifiedModelFailure,
  contextBag: ModelStatusContext,
  round: number,
  extra: Record<string, unknown> = {},
): AiSdkModelAdapterError {
  if (origin instanceof AiSdkModelAdapterError) {
    return origin.enrichContext({ ...contextBag, attempt: round, ...extra });
  }
  const context = {
    ...contextBag,
    attempt: round,
    reason: verdict.reason,
    retryReason: verdict.retryReason,
    retryable: verdict.retryable,
    statusCode: verdict.statusCode,
    retryAfterMs: verdict.retryAfterMs,
    ...extra,
  };
  return new AiSdkModelAdapterError(verdict.code, verdict.message, { cause: origin, context });
}
