import { AsyncLocalStorage } from "node:async_hooks";
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import { createTraceId } from "../interfaces/shared.js";
import type { LogContext } from "../logging/logger.js";
import { createResidentSpan, createSpanIdentifier } from "./span-residence.js";
import type { Span, TraceContext, Tracer } from "./tracer-types.js";
export type { ExecutionContext, Span, TraceContext, Tracer } from "./tracer-types.js";

const ambientTrace = new AsyncLocalStorage<TraceContext>();

function errorForSpan(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function synchronousSpanScope<T>(
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
  } catch (error) {
    span.end(errorForSpan(error));
    throw error;
  }
}

function asynchronousSpanScope<T>(
  this: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: TraceContext,
): Promise<T> {
  const span = this.startSpan(name, parentContext);
  // direct then 保留同步 callback throw 的既有边界，不用 async 包装改变错误时序。
  return fn(span).then(
    (value) => {
      span.end();
      return value;
    },
    (error: unknown) => {
      span.end(errorForSpan(error));
      throw error;
    },
  );
}

export function createTracer(name: string, onSpanEnd?: (span: Span) => void): Tracer {
  return {
    name,
    startSpan(spanName: string, parentContext?: TraceContext): Span {
      return createResidentSpan(
        spanName,
        parentContext?.traceId ?? createTraceId(),
        parentContext?.spanId ?? parentContext?.parentSpanId,
        onSpanEnd,
      );
    },
    withSpan: synchronousSpanScope,
    withSpanAsync: asynchronousSpanScope,
  };
}

export function getCurrentTraceContext(): TraceContext | undefined {
  return ambientTrace.getStore();
}

export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return ambientTrace.run(context, fn);
}

export async function runWithContextAsync<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
  return ambientTrace.run(context, fn);
}

export function createSpan(name: string): Span {
  const context = getCurrentTraceContext();
  return createResidentSpan(
    name,
    context?.traceId ?? createTraceId(),
    context?.spanId ?? context?.parentSpanId,
  );
}

export function createRootTraceContext(
  options: {
    traceId?: TraceId;
    queryId?: QueryId;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
  } = {},
): TraceContext {
  return {
    traceId: options.traceId ?? createTraceId(),
    queryId: options.queryId,
    spanId: createSpanIdentifier(),
    sessionId: options.sessionId,
    turnId: options.turnId,
    attributes: options.attributes,
  };
}

export function createChildTraceContext(
  parent: TraceContext,
  options: {
    queryId?: QueryId;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
  } = {},
): TraceContext {
  return {
    traceId: parent.traceId,
    queryId: options.queryId ?? parent.queryId,
    spanId: createSpanIdentifier(),
    parentSpanId: parent.spanId,
    parentId: parent.spanId,
    sessionId: options.sessionId ?? parent.sessionId,
    turnId: options.turnId ?? parent.turnId,
    attributes: { ...parent.attributes, ...options.attributes },
  };
}

export function traceContextToLogContext(context: TraceContext): LogContext {
  return {
    traceId: context.traceId,
    queryId: context.queryId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
    ...context.attributes,
  };
}
