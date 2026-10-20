// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 带超时的工具处理执行：把「handler + 上下文 + 期限 + 取消」合成一次可结算的调用。
//
// 三条结算路径，谁先到谁生效：
//   1. 进入时发现已取消 → 立即以 cancelled 拒绝；
//   2. 期限到期 → 以 timeout 错误 abort，再结算；
//   3. 调用方取消 → 若不是期限引发的 abort，则以 cancelled 结算。
//
// 取消错误按「是否已开始运行」分两档：运行中要带 cleanup 与工具名，未开始则只带文案。
import { CoreErrorType, createCoreError } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../../types.js";
import type { ToolDeadline } from "./pausable-deadline.js";

/** 一次带期限调用的全部输入。 */
export interface DeadlineExecution<TInput, TOutput> {
  context: ToolExecutionContext;
  /** 期限到期时用它 abort，让 handler 侧观察到同一个原因。 */
  controller: AbortController;
  deadline: ToolDeadline;
  entry: ToolEntry;
  handler: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
  input: TInput;
}

/** 取消错误的上下文片段：运行中才带 cleanup 与工具名。 */
const cancellationContext = (entry: ToolEntry): Record<string, unknown> => ({
  cancellation: entry.cancellation?.cleanup ?? "none",
  toolName: entry.metadata.name,
});

/** 构造取消错误。`running` 为 false 时表示还没开始跑，不必附上下文。 */
function cancellation(entry: ToolEntry, running: boolean): Error {
  const message = entry.cancellation?.userVisibleMessage ?? "Tool execution cancelled";
  if (!running) return createCoreError(CoreErrorType.ToolCancelled, message);
  return createCoreError(CoreErrorType.ToolCancelled, message, {
    context: cancellationContext(entry),
    recoverable: true,
  });
}

/** 构造超时错误：带上期限相关量化字段，便于事后判断是排队久还是跑得久。 */
function timeoutError(entry: ToolEntry, deadline: ToolDeadline, timeoutMs: number): Error {
  return createCoreError(
    CoreErrorType.ToolTimeout,
    `Tool execution timed out after ${timeoutMs}ms`,
    {
      context: { ...cancellationContext(entry), queuedMs: deadline.queuedMs, timeoutMs },
      recoverable: true,
    },
  );
}

/**
 * 一次调用的结算器。
 *
 * 把「只结算一次 + 清理期限与监听」收进对象：三条触发路径（期限、外部取消、handler 完成）
 * 都只是调用 `settle`，不各自重复清理逻辑。`timedOut` 记录 abort 的归属，
 * 让外部取消与期限互相不踩。
 */
class CallSettlement<TInput, TOutput> {
  readonly #request: DeadlineExecution<TInput, TOutput>;
  readonly #resolve: (value: TOutput) => void;
  readonly #reject: (reason: unknown) => void;
  #closed = false;
  #timedOut = false;

  constructor(
    request: DeadlineExecution<TInput, TOutput>,
    resolve: (value: TOutput) => void,
    reject: (reason: unknown) => void,
  ) {
    this.#request = request;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  /** 期限路径：先 abort（让 handler 看到原因），再结算。 */
  onDeadline(): void {
    this.#timedOut = true;
    const { controller, deadline, entry } = this.#request;
    const timeoutMs = deadline.timeoutMs ?? 0;
    const error = timeoutError(entry, deadline, timeoutMs);
    controller.abort(error);
    this.#settle(false, error);
  }

  /** 外部取消路径：期限已结算过就不再重复。 */
  onAbort(): void {
    if (this.#timedOut) return;
    this.#settle(false, cancellation(this.#request.entry, true));
  }

  /** handler 完成路径。 */
  onValue(value: TOutput): void {
    this.#settle(true, value);
  }

  /** handler 失败路径（含同步抛错）。 */
  onError(error: unknown): void {
    this.#settle(false, error);
  }

  /** 唯一出口：关闩锁、清期限、摘监听、交付结果。 */
  #settle(ok: boolean, payload: unknown): void {
    if (this.#closed) return;
    this.#closed = true;
    const { context, deadline } = this.#request;
    deadline.clear();
    context.abortSignal.removeEventListener("abort", this.onAbortBound);
    if (ok) this.#resolve(payload as TOutput);
    else this.#reject(payload);
  }

  /** 预先绑定：摘监听时必须传同一个引用，不能每次传新箭头函数。 */
  readonly onAbortBound = (): void => this.onAbort();
}

/**
 * 把两种入参形态归一：字段对象直接用，六个位置参数按序装配。
 * 位置参数形态是既有公开契约（调用方与契约测试都这么用），必须保留。
 */
const requestOf = <TInput, TOutput>(
  first: DeadlineExecution<TInput, TOutput> | DeadlineExecution<TInput, TOutput>["handler"],
  input?: TInput,
  context?: ToolExecutionContext,
  deadline?: ToolDeadline,
  controller?: AbortController,
  entry?: ToolEntry,
): DeadlineExecution<TInput, TOutput> =>
  typeof first === "function"
    ? {
        context: context as ToolExecutionContext,
        controller: controller as AbortController,
        deadline: deadline as ToolDeadline,
        entry: entry as ToolEntry,
        handler: first,
        input: input as TInput,
      }
    : first;

export async function executeWithTimeout<TInput, TOutput>(
  request: DeadlineExecution<TInput, TOutput>,
): Promise<TOutput>;
export async function executeWithTimeout<TInput, TOutput>(
  handler: DeadlineExecution<TInput, TOutput>["handler"],
  input: TInput,
  context: ToolExecutionContext,
  deadline: ToolDeadline,
  controller: AbortController,
  entry: ToolEntry,
): Promise<TOutput>;
export async function executeWithTimeout<TInput, TOutput>(
  first: DeadlineExecution<TInput, TOutput> | DeadlineExecution<TInput, TOutput>["handler"],
  input?: TInput,
  context?: ToolExecutionContext,
  deadline?: ToolDeadline,
  controller?: AbortController,
  entry?: ToolEntry,
): Promise<TOutput> {
  const {
    context: executionContext,
    deadline: executionDeadline,
    handler,
    input: executionInput,
  } = requestOf(first, input, context, deadline, controller, entry);
  const request = requestOf(first, input, context, deadline, controller, entry);
  return new Promise<TOutput>((resolve, reject) => {
    if (executionContext.abortSignal.aborted) {
      reject(cancellation(request.entry, false));
      return;
    }

    const settlement = new CallSettlement(request, resolve, reject);
    executionDeadline.start(() => settlement.onDeadline());
    executionContext.abortSignal.addEventListener("abort", settlement.onAbortBound);

    try {
      // 刻意用 then + catch 两段式：让「失败」比「成功」多花一个微任务，
      // 排队中的 abort 因此能先结算。契约测试锁定了这个优先级，不能合成单段双回调。
      handler(executionInput, executionContext)
        .then((value) => settlement.onValue(value))
        .catch((error: unknown) => settlement.onError(error));
    } catch (error) {
      // 同步抛错仍走同一结算门，避免留下未清的 timer。
      settlement.onError(error);
    }
  });
}
