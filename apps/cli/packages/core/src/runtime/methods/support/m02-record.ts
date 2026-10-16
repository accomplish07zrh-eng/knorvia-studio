// SPDX-License-Identifier: Apache-2.0
// 日志出口，以及把若干已排好序的对象按先后叠成一份载荷。

export function assignKeys<T extends object>(pairs: ReadonlyArray<readonly [string, unknown]>): T {
  const record: Record<string, unknown> = {};
  for (const [key, value] of pairs) record[key] = value;
  return record as T;
}

/** 按参数顺序叠键。同名键留在第一次出现的位置，值用后面的覆盖。 */
export function layer<T extends object>(...parts: ReadonlyArray<object | null | undefined>): T {
  const bag: Record<string, unknown> = {};
  for (const part of parts) {
    if (part == null) continue;
    for (const name of Object.keys(part)) bag[name] = Reflect.get(part, name);
  }
  return bag as T;
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

/** 把单个字段收成对象类型，公开结构用交叉拼出来，而不是再排一列同名属性。 */
export type Col<K extends string, V> = { [P in K]: V };

/** 可选字段版本，缺省与 `?` 相同。 */
export type Opt<K extends string, V> = { [P in K]?: V };

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
