// SPDX-License-Identifier: Apache-2.0
// 日志契约：级别常量、日志条目形状与 logger 端口。
// 组织方式：级别名清单只列一次，数值表与「数值 → 名称」表都由它推出；条目与端口的声明在下方分组。

import type { TraceId } from "../interfaces/shared.js";

/** 级别名（小写）：数组下标即级别数值，顺序即严重度顺序。 */
const LOG_LEVEL_NAMES = ["debug", "info", "warn", "error"] as const;

/** 级别数值常量：`{ Debug: 0, Info: 1, Warn: 2, Error: 3 }`。 */
export const LogLevel = Object.fromEntries(
  LOG_LEVEL_NAMES.map((name, index) => [name.charAt(0).toUpperCase() + name.slice(1), index]),
) as unknown as {
  readonly Debug: 0;
  readonly Info: 1;
  readonly Warn: 2;
  readonly Error: 3;
};

/** 级别数值的联合类型。 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** 数值 → 大写名称的映射：`{ 0: "DEBUG", 1: "INFO", 2: "WARN", 3: "ERROR" }`。 */
export const LogLevelName = Object.fromEntries(
  LOG_LEVEL_NAMES.map((name, index) => [index, name.toUpperCase()]),
) as unknown as {
  readonly 0: "DEBUG";
  readonly 1: "INFO";
  readonly 2: "WARN";
  readonly 3: "ERROR";
};

/** 一次日志调用的产物；调用方按需要填身份字段，便于把日志挂回 trace。 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  levelName: string;
  event?: string;
  module?: string;
  message: string;
  traceId?: TraceId;
  sessionId?: string;
  turnId?: string;
  spanId?: string;
  parentSpanId?: string;
  toolCallId?: string;
  durationMs?: number;
  status?: "started" | "waiting" | "completed" | "failed" | "cancelled";
  context?: Record<string, unknown>;
  error?: LogError;
}

/** 错误的可序列化投影：保留原始原因链，但不带宿主对象。 */
export interface LogError {
  name: string;
  message: string;
  code?: string;
  type?: string;
  stack?: string;
  context?: Record<string, unknown>;
  cause?: LogError;
}

/** 一条日志携带的上下文；允许附加自定义键，因此是开放形状。 */
export interface LogContext {
  traceId?: TraceId;
  sessionId?: string;
  turnId?: string;
  spanId?: string;
  parentSpanId?: string;
  toolCallId?: string;
  event?: string;
  module?: string;
  durationMs?: number;
  status?: "started" | "waiting" | "completed" | "failed" | "cancelled";
  [key: string]: unknown;
}

/** 业务代码只依赖这个端口；落盘、采样与级别过滤由实现决定。 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  child(context: LogContext): Logger;
}

/** 建 logger 的工厂：按分类建，或给已有 logger 叠加固定上下文。 */
export interface LoggerFactory {
  createLogger(category: string): Logger;
  withContext(context: LogContext): Logger;
  setLevel(level: LogLevel): void;
}

/** 敏感字段脱敏端口；实现负责决定哪些键需要打码。 */
export interface LogRedactor {
  redact(value: unknown): unknown;
}
