// 既有公开协议声明原样保留；声明搬家不构成新的原创或独立性决定。
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { Logger } from "../logging/logger.js";

export interface TraceContext {
  traceId: TraceId;
  queryId?: QueryId;
  spanId?: string;
  parentSpanId?: string;
  parentId?: string;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: Record<string, string | number | boolean>;
}

export interface ExecutionContext {
  trace: TraceContext;
  logger: Logger;
  abortSignal?: AbortSignal;
}

export interface Span {
  readonly traceId: TraceId;
  readonly spanId: string;
  readonly parentId?: string;
  readonly name: string;
  readonly startTime: Date;
  endTime?: Date;
  attributes: Record<string, string | number | boolean>;
  status: "running" | "completed" | "error";
  error?: Error;
  setAttribute(key: string, value: string | number | boolean): void;
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  end(error?: Error): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

export interface Tracer {
  readonly name: string;
  startSpan(name: string, parentContext?: TraceContext): Span;
  withSpan<T>(name: string, fn: (span: Span) => T, parentContext?: TraceContext): T;
  withSpanAsync<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    parentContext?: TraceContext,
  ): Promise<T>;
}
