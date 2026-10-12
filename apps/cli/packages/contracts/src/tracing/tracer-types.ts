// SPDX-License-Identifier: Apache-2.0
// 追踪的公开协议声明。字段与可选性来自 contracts-02 的 interface.md（B2/B3），
// 内部实现按职责拆在 span-record.ts 与 tracer.ts 里。
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { Logger } from "../logging/logger.js";

/** span 属性只允许可安全序列化的标量，避免追踪数据把任意对象带进日志上下文。 */
export type SpanAttributes = Record<string, string | number | boolean>;

export interface TraceContext {
  traceId: TraceId;
  queryId?: QueryId;
  spanId?: string;
  parentSpanId?: string;
  parentId?: string;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: SpanAttributes;
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
  attributes: SpanAttributes;
  status: "running" | "completed" | "error";
  error?: Error;
  setAttribute(key: string, value: string | number | boolean): void;
  setAttributes(attributes: SpanAttributes): void;
  end(error?: Error): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
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
