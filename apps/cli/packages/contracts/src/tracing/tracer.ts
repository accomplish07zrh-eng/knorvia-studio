// SPDX-License-Identifier: Apache-2.0
// 追踪运行时入口。公开导出名与签名冻结在 contracts-02 的 interface.md（B2/B3）。
// 内部实现分三层：tracer-types.ts 只放协议声明；span-residence.ts 放 span 记录与结算
// 状态机；本文件放 ambient 上下文与构造/包装入口。
// 设计取舍（替换阶段的自主决定，不属于兼容面）：ambient 槽位只存一份引用，作用域结束即
// 释放；父标识解析集中在 resolveParentSpanId；同步与异步包装分开实现，异步路径用直接 then
// 保持「回调同步抛错仍同步抛出」的边界。
import { AsyncLocalStorage } from "node:async_hooks";
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import { createTraceId } from "../interfaces/shared.js";
import type { LogContext } from "../logging/logger.js";
import { ResidentSpan, createSpanIdentifier } from "./span-residence.js";
import type { Span, SpanAttributes, TraceContext, Tracer } from "./tracer-types.js";

export type {
  ExecutionContext,
  Span,
  SpanAttributes,
  TraceContext,
  Tracer,
} from "./tracer-types.js";

interface RootTraceOptions {
  traceId?: TraceId;
  queryId?: QueryId;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: SpanAttributes;
}

interface ChildTraceOptions {
  queryId?: QueryId;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: SpanAttributes;
}

// 进程内唯一的 ambient 槽位：所有跨模块的 traceId 传播都经过它。
const ambientScope = new AsyncLocalStorage<TraceContext>();

// 抛出值统一转成 Error，调用方读 span.error 时不必再判类型；
// 非 Error 的抛出值保留字符串形式，便于日志定位原始内容。
function asTraceError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  const description = String(thrown);
  return new Error(`trace scope threw a non-error value: ${description}`);
}

// 父 span 标识：优先取上下文自身的 spanId；跨进程传入的上下文可能只有 parentSpanId，
// 此时退化使用它，保证子 span 仍挂在调用链上而不是变成新的根。
function resolveParentSpanId(context: TraceContext | undefined): string | undefined {
  if (context === undefined) return undefined;
  const own = context.spanId;
  return own ?? context.parentSpanId;
}

// 统一构造：traceId 与父标识都从上下文推导，没有上下文时开新链。
function openSpan(
  name: string,
  context: TraceContext | undefined,
  onEnd?: (span: Span) => void,
): Span {
  const traceId = context?.traceId ?? createTraceId();
  const parentId = resolveParentSpanId(context);
  const span = new ResidentSpan(name, traceId, parentId, onEnd);
  return span;
}

// 同步包装：正常返回结算为 completed；回调抛错时以该错误结算后原样重抛，
// 保持原始错误对象与栈，不包装、不吞掉。
function runSynchronousSpan<T>(
  this: Tracer,
  name: string,
  fn: (span: Span) => T,
  parentContext?: TraceContext,
): T {
  const span = this.startSpan(name, parentContext);
  try {
    const value = fn(span);
    span.end();
    return value;
  } catch (thrown) {
    span.end(asTraceError(thrown));
    throw thrown;
  }
}

// 异步包装：直接 then，不用 async 包装，这样「回调同步抛错」仍然表现为同步抛错；
// 异步拒绝时先结算 span，再把原错误交给下游。
function runAsynchronousSpan<T>(
  this: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: TraceContext,
): Promise<T> {
  const span = this.startSpan(name, parentContext);
  const onCompleted = (value: T): T => {
    span.end();
    return value;
  };
  const onRejected = (thrown: unknown): never => {
    span.end(asTraceError(thrown));
    throw thrown;
  };
  const pending = fn(span);
  return pending.then(onCompleted, onRejected);
}

export function createTracer(name: string, onSpanEnd?: (span: Span) => void): Tracer {
  const tracer: Tracer = {
    name,
    startSpan(spanName: string, parentContext?: TraceContext): Span {
      return openSpan(spanName, parentContext, onSpanEnd);
    },
    withSpan: runSynchronousSpan,
    withSpanAsync: runAsynchronousSpan,
  };
  return tracer;
}

export function getCurrentTraceContext(): TraceContext | undefined {
  return ambientScope.getStore();
}

export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return ambientScope.run(context, fn);
}

export function runWithContextAsync<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
  return ambientScope.run(context, fn);
}

// 在 ambient 上下文里开子 span；没有 ambient 上下文时按新根处理。
export function createSpan(name: string): Span {
  const ambient = getCurrentTraceContext();
  return openSpan(name, ambient);
}

export function createRootTraceContext(options: RootTraceOptions = {}): TraceContext {
  const context: TraceContext = {
    traceId: options.traceId ?? createTraceId(),
    queryId: options.queryId,
    spanId: createSpanIdentifier(),
    sessionId: options.sessionId,
    turnId: options.turnId,
    attributes: options.attributes,
  };
  return context;
}

// 子上下文：traceId 必须沿用父链；queryId/sessionId/turnId 缺省继承；
// attributes 按父→子合并（子覆盖同键）；父 spanId 同时写入 parentSpanId 与 parentId。
export function createChildTraceContext(
  parent: TraceContext,
  options: ChildTraceOptions = {},
): TraceContext {
  const merged = { ...parent.attributes, ...options.attributes };
  const context: TraceContext = {
    traceId: parent.traceId,
    queryId: options.queryId ?? parent.queryId,
    spanId: createSpanIdentifier(),
    parentSpanId: parent.spanId,
    parentId: parent.spanId,
    sessionId: options.sessionId ?? parent.sessionId,
    turnId: options.turnId ?? parent.turnId,
    attributes: merged,
  };
  return context;
}

// 追踪上下文 → 日志上下文：六个标识字段平铺，属性表展开在同一层。
export function traceContextToLogContext(context: TraceContext): LogContext {
  const identifiers = {
    traceId: context.traceId,
    queryId: context.queryId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  };
  const logContext: LogContext = { ...identifiers, ...context.attributes };
  return logContext;
}
