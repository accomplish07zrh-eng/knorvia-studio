// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 截止时间与超时。四类动作：建 deadline、算剩余、在 deadline 内等待、给任意 Promise 加超时。
//
// 语义约定（改动前务必逐条确认）：
// 一、`createMcpDeadline` 只接受非负整数毫秒；负数按 0 处理 —— 避免「已过期」与「无预算」混淆；
// 二、`remainingMcpDeadlineMs` 到期即抛 McpTimeoutError，调用方据此区分超时与传输失败；
// 三、`waitWithinMcpDeadline` 到期时**同步抛出**，且优先于 signal；同时仍观察来源任务的后续拒绝；
// 四、`withTimeout` 遇到已取消的 signal 立即拒绝，**不设定时器**，也不改变来源任务；
// 五、结算只允许发生一次（`claimSettlement`）：超时、取消、来源完成三者竞争同一开关；
// 六、无论哪条路径结算，都会清定时器并摘掉 abort 监听器，避免监听器泄漏；
// 七、借用来源任务时必须吞掉其拒绝，否则会产生未处理拒绝告警。
//
// 错误保持原样向上抛：超时用 McpTimeoutError，取消用 signal.reason（非 Error 时包装）。

/** 超时错误：类型本身就是契约，调用方按它区分超时与传输失败。 */
export class McpTimeoutError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "McpTimeoutError";
  }
}

/** 不可变的截止时间结构：到期时刻（epoch 毫秒）与总预算（毫秒）。 */
export type McpDeadline = { expiresAt: number; timeoutMs: number };

/** 取消原因为空或不是 Error 时的兜底文案。 */
const ABORT_FALLBACK_TEXT = "Operation aborted";

/** 吞掉拒绝的空回调（复用同一函数，避免每次新建）。 */
function discardRejection(): void {}

/** 观察借用任务的拒绝：早退路径也要挂上，避免未处理拒绝告警。 */
function watchSourceRejection(source: Promise<unknown>): void {
  void source.catch(discardRejection);
}

/** 取取消原因：父 signal 给了 Error 就用它，否则包装成兜底错误。 */
function abortError(cancelSignal?: AbortSignal): Error {
  const reason: unknown = cancelSignal?.reason;
  return reason instanceof Error ? reason : new Error(ABORT_FALLBACK_TEXT);
}

/** 建一个截止时间：负数与小数量化到「不小于 0 的整数」。 */
export function createMcpDeadline(budgetMs: number): McpDeadline {
  const duration = Math.max(0, Math.floor(budgetMs));
  const deadline = {} as McpDeadline;
  deadline.expiresAt = Date.now() + duration;
  deadline.timeoutMs = duration;
  return deadline;
}

/**
 * 剩余毫秒；已到期则抛出给定的超时错误文案。
 *
 * 注意条件方向：必须是 `leftMs <= 0` 才抛。写成 `if (leftMs > 0) return; throw` 会在
 * **NaN** 上改变行为 —— `NaN <= 0` 与 `NaN > 0` 都是 false，前者不抛、后者抛出。
 * 而 expiresAt 可能因上游传错而成为 NaN，此时应把 NaN 原样交给调用方（测试
 * `preserves native NaN result` 就是守这条）。
 */
export function remainingMcpDeadlineMs(deadline: McpDeadline, expiryMessage: string): number {
  const leftMs = deadline.expiresAt - Date.now();
  if (leftMs <= 0) throw new McpTimeoutError(expiryMessage);
  return leftMs;
}

/** 在截止时间内等待来源任务；到期同步抛出（优先于 signal）。 */
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
    // 到期仍同步抛出并优先于 cancelSignal；仅补上对来源拒绝的观察。
    watchSourceRejection(source);
    throw cause;
  }
  return withTimeout(source, leftMs, expiryMessage, cancelSignal);
}

/** 结算开关：三个竞争者共用，谁先到谁生效，并在这里统一清资源。 */
function makeSettlement(
  cancelSignal: AbortSignal | undefined,
  listenerRef: { current: () => void },
) {
  const state = { pending: true, timer: undefined as ReturnType<typeof setTimeout> | undefined };
  const claim = (): boolean => {
    if (!state.pending) return false;
    state.pending = false;
    if (state.timer !== undefined) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    // 必须用与 addEventListener 相同的函数引用，否则摘不掉监听器。
    cancelSignal?.removeEventListener("abort", listenerRef.current);
    return true;
  };
  return { state, claim };
}

/** 给来源任务加超时：超时、取消、来源完成三者竞争同一个结算开关。 */
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

    // abortListener 与 claim 互相引用：用引用对象承接，保证挂载与摘除是同一函数。
    const listenerRef: { current: () => void } = { current: () => {} };
    const { state, claim } = makeSettlement(cancelSignal, listenerRef);
    const onAbort = (): void => {
      if (claim()) reject(abortError(cancelSignal));
    };
    listenerRef.current = onAbort;

    state.timer = setTimeout(() => {
      if (claim()) reject(new McpTimeoutError(expiryMessage));
    }, timeoutMs);
    cancelSignal?.addEventListener("abort", onAbort, { once: true });

    void source.then(
      (value) => {
        if (claim()) resolve(value);
      },
      (reason: unknown) => {
        if (claim()) reject(reason);
      },
    );
  });
}
