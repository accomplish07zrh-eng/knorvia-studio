// SPDX-License-Identifier: Apache-2.0
// 键序写入与日志出口。若干契约用 Object.keys 观察插入顺序，所以不靠字面量排键。

export function assignKeys<T extends object>(pairs: ReadonlyArray<readonly [string, unknown]>): T {
  const record: Record<string, unknown> = {};
  for (const [key, value] of pairs) record[key] = value;
  return record as T;
}

/** 条件键接在已有键后面。include 为假时键不出现。 */
export function putIf<T extends object>(
  record: T,
  key: string,
  value: unknown,
  include: boolean,
): T {
  if (include) (record as Record<string, unknown>)[key] = value;
  return record;
}

export function phrase(parts: readonly string[]): string {
  return parts.join("");
}

type LogLevel = "debug" | "info" | "warn";

/** 与 Logger 的 debug/info/warn 同形，避免回调参数逆变把运行时对象挡在外面。 */
type LogSink = (message: string, context?: import("@knorvia/contracts").LogContext) => void;

type LogHost = {
  logger?: {
    debug?: LogSink;
    info?: LogSink;
    warn?: LogSink;
  };
};

export function report(runtime: LogHost, level: LogLevel, message: string, fields: object): void {
  const logger = runtime.logger;
  const sink = logger?.[level];
  if (typeof sink !== "function") return;
  sink.call(logger, message, fields as import("@knorvia/contracts").LogContext);
}
