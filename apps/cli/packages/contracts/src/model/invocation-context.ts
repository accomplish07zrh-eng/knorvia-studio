// SPDX-License-Identifier: Apache-2.0
// 调用级执行上下文：runtime 在统一模型调用边界写入，adapter 在同一条异步链上读取。
// 组织方式：先把上下文与其从属材料（鉴权、依赖）声明清楚，再放 AsyncLocalStorage 与三个入口；
// 异步迭代器的每一步都被放回同一上下文里跑，await 之后不会丢上下文。

import { AsyncLocalStorage } from "node:async_hooks";
import type { KnorviaProviderAccountAccess } from "@knorvia/shared";
import type { ModelApiCallObservation } from "../telemetry/index.js";
import type { TraceContext } from "../tracing/tracer.js";
import type {
  ModelRequestAdmission,
  ModelRequestSessionType,
  ModelRetryBudget,
  ModelStatusSink,
  ModelStreamRecoveryStatus,
} from "./index.js";

// Runtime 与 Adapter 之间的调用级执行信息。它不属于业务 ModelRequest，也不允许普通调用方据此
// 改变 Provider 或模型身份：只有 runtime 能在统一模型调用边界设置它，adapter 只读。

/** 一次模型调用的执行上下文；字段全部可选，缺失表示该能力不参与本次调用。 */
export interface ModelInvocationContext {
  metadata?: Record<string, unknown>;
  modelCall?: ModelApiCallObservation;
  modelRequestSessionType?: ModelRequestSessionType;
  /** 重试预算档位；runtime 按 taskType 决定，adapter 据此放宽瞬态失败的放弃条件。 */
  modelRetryBudget?: ModelRetryBudget;
  /** 准入端口；runtime 从 deps 带入，adapter 每次尝试先 acquire。 */
  modelRequestAdmission?: ModelRequestAdmission;
  statusSink?: ModelStatusSink;
  traceContext?: TraceContext;
  streamIdleTimeoutRetryNumber?: number;
  streamRecovery?: ModelStreamRecoveryStatus;
  preserveProviderStreamBoundaries?: boolean;
  refreshRuntimeHeadersBeforeAttempt?: (input: {
    accountAccess?: KnorviaProviderAccountAccess;
    attempt: number;
    reason?: "model-request";
    abortSignal?: AbortSignal;
    providerId: string;
    modelId: string;
    traceContext?: TraceContext;
  }) => Promise<{
    headersApplied: boolean;
    requestAuth?: ModelRequestAuth;
  }>;
}

/** Adapter 为单个物理请求 attempt 使用的动态鉴权材料。 */
export interface ModelRequestAuth {
  apiKey?: string;
  headers?: Record<string, string>;
}

/** 解析一次 attempt 鉴权所需的输入。 */
export interface ModelRequestAuthSourceInput {
  attempt: number;
  abortSignal?: AbortSignal;
  providerId: string;
  modelId: string;
  traceContext?: TraceContext;
}

/** Model 创建时绑定、在每个物理请求 attempt 前解析的执行作用域鉴权来源。 */
export interface ModelRequestAuthSource {
  resolve(input: ModelRequestAuthSourceInput): Promise<ModelRequestAuth | undefined>;
}

/** 模型调用的依赖注入位；`requestAuth` 存在即表示本次 Model 必须拿到请求级鉴权。 */
export interface ModelRequestDependencies {
  /** 属性存在表示当前 Model 必须取得请求级鉴权；Source 缺失同样 fail-closed。 */
  requestAuth?: {
    source?: ModelRequestAuthSource;
  };
}

/** 调用上下文的存储槽；每个异步链一份，不做跨链共享。 */
const invocationScope = new AsyncLocalStorage<ModelInvocationContext>();

/** 读当前调用上下文；不在 `runWithModelInvocationContext` 内时返回 undefined。 */
export function getCurrentModelInvocationContext(): ModelInvocationContext | undefined {
  return invocationScope.getStore();
}

/** 异步可迭代对象的判定：只看 `Symbol.asyncIterator` 是不是函数。 */
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const iteratorFactory = (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator];
  return typeof iteratorFactory === "function";
}

/**
 * 把异步迭代器的每一步都放回给定上下文里执行。
 * 直接 `run(context, () => source)` 只在创建迭代器时生效，之后每次 `next()` 都会脱离上下文；
 * 所以这里逐个方法包一层。
 */
function wrapAsyncIterableWithContext(
  context: ModelInvocationContext,
  source: AsyncIterable<unknown>,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      const upstream = source[Symbol.asyncIterator]();
      return {
        next: (value?: unknown) =>
          invocationScope.run(context, () => upstream.next(value as never)),
        return: (value?: unknown) =>
          invocationScope.run(context, () =>
            upstream.return
              ? upstream.return(value as never)
              : Promise.resolve({ done: true, value }),
          ),
        throw: (error?: unknown) =>
          invocationScope.run(context, () =>
            upstream.throw ? upstream.throw(error) : Promise.reject(error),
          ),
      };
    },
  };
}

/** 在给定上下文里执行 `run`；返回异步可迭代对象时会把上下文延续到每一次迭代。 */
export function runWithModelInvocationContext<T>(context: ModelInvocationContext, run: () => T): T {
  const outcome = invocationScope.run(context, run);
  if (!isAsyncIterable(outcome)) return outcome;
  return wrapAsyncIterableWithContext(context, outcome) as T;
}
