// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

// 截止时间与超时约定：
// 一、createMcpDeadline 只接受非负整数毫秒；负数按 0 处理，避免「已过期」与「无预算」混淆。
// 二、remainingMcpDeadlineMs 到期即抛 McpTimeoutError，调用方可据此区分超时与传输失败。
// 三、waitWithinMcpDeadline 到期时同步抛出，且优先于 signal；同时观察来源任务的后续拒绝。
// 四、withTimeout 已取消的 signal 立即拒绝，不设定时器，也不改变来源任务。
// 五、结算只允许发生一次（claimSettlement）：超时、取消、来源完成三者竞争同一开关。
// 六、无论哪条路径结算，都会清定时器并摘掉 abort 监听器，避免监听器泄漏。
// 七、借用来源任务时必须吞掉其拒绝，否则会产生未处理拒绝告警。
export class McpTimeoutError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "McpTimeoutError";
  }
}

export interface McpDeadline {
  expiresAt: number;
  timeoutMs: number;
}

function discardRejection(): void {}

function watchSourceRejection(source: Promise<unknown>): void {
  // 早退也要观察借用任务的拒绝；回调不捕获等待者状态，也不改变其他消费者。
  void source.catch(discardRejection);
}

function abortError(cancelSignal?: AbortSignal): Error {
  const reason: unknown = cancelSignal?.reason;
  return reason instanceof Error ? reason : new Error("Operation aborted");
}

export function createMcpDeadline(timeoutMs: number): McpDeadline {
  const duration = Math.max(0, Math.floor(timeoutMs));
  return { expiresAt: Date.now() + duration, timeoutMs: duration };
}

export function remainingMcpDeadlineMs(deadline: McpDeadline, expiryMessage: string): number {
  const leftMs = deadline.expiresAt - Date.now();
  if (leftMs <= 0) throw new McpTimeoutError(expiryMessage);
  return leftMs;
}

export function waitWithinMcpDeadline<T>(
  source: Promise<T>,
  deadline: McpDeadline,
  expiryMessage: string,
  cancelSignal?: AbortSignal,
): Promise<T> {
  let leftMs: number;
  try {
    leftMs = remainingMcpDeadlineMs(deadline, expiryMessage);
  } catch (cause) {
    // 到期仍同步抛出并优先于 cancelSignal；仅补上已有及未来源拒绝的观察。
    watchSourceRejection(source);
    throw cause;
  }
  return withTimeout(source, leftMs, expiryMessage, cancelSignal);
}

export function withTimeout<T>(
  source: Promise<T>,
  timeoutMs: number,
  expiryMessage: string,
  cancelSignal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (cancelSignal?.aborted) {
      watchSourceRejection(source);
      reject(abortError(cancelSignal));
      return;
    }

    let settling = true;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    function claimSettlement(): boolean {
      if (!settling) return false;
      settling = false;
      if (deadlineTimer !== undefined) {
        clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
      }
      cancelSignal?.removeEventListener("abort", abortListener);
      return true;
    }
    function abortListener(): void {
      if (claimSettlement()) reject(abortError(cancelSignal));
    }

    deadlineTimer = setTimeout(() => {
      if (claimSettlement()) reject(new McpTimeoutError(expiryMessage));
    }, timeoutMs);
    cancelSignal?.addEventListener("abort", abortListener, { once: true });
    void source.then(
      (value) => {
        if (claimSettlement()) resolve(value);
      },
      (reason: unknown) => {
        if (claimSettlement()) reject(reason);
      },
    );
  });
}
// 计时与清理细节（排障用）：
// 一、定时器与 abort 监听器都在结算时同步释放，不留悬挂引用。
// 二、来源任务完成后若已超时，其结果被丢弃但拒绝仍被观察，避免未处理拒绝。
// 三、错误对象保持原样向上抛：超时用 McpTimeoutError，取消用 signal.reason（非 Error 时包装）。
// 四、deadline 是不可变结构：只有 expiresAt 与 timeoutMs 两个字段，调用方自行克隆。
// 五、waitWithinMcpDeadline 不改 deadline，多次调用按同一截止时间重复判定。
// 六、所有导出函数都不吞错：要么返回值，要么按上述两类错误抛出。
