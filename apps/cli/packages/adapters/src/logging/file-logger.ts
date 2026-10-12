// SPDX-License-Identifier: Apache-2.0
// 文件 logger：级别门控、上下文合并、JSONL 落盘与控制台回声。
import type { LogContext, LogLevel, Logger, LogRedactor } from "@knorvia/contracts";
import { LogLevel as Level } from "@knorvia/contracts";
import { projectLogEntry } from "./entry.js";
import { appendLogRecord } from "./file-sink.js";
import { formatConsoleLine, toSerializableEntry } from "./serialize.js";

/** logger 的固定配置：构造后不再变化，`child()` 只覆盖上下文。 */
export interface FileLoggerSettings {
  category: string;
  consoleStream?: NodeJS.WritableStream;
  defaultContext: LogContext;
  getMinLevel: () => LogLevel;
  includeErrorStack: boolean;
  logDir: string;
  redactor: LogRedactor;
}

type FileLoggerInput = Omit<FileLoggerSettings, "defaultContext" | "includeErrorStack"> & {
  defaultContext?: LogContext;
  includeErrorStack?: boolean;
};

/** 补齐可省略项：默认上下文为空对象，默认不带错误栈。 */
function withDefaults(input: FileLoggerInput): FileLoggerSettings {
  const settings = {} as FileLoggerSettings;
  settings.category = input.category;
  settings.consoleStream = input.consoleStream;
  settings.defaultContext = input.defaultContext ?? {};
  settings.getMinLevel = input.getMinLevel;
  settings.includeErrorStack = input.includeErrorStack ?? false;
  settings.logDir = input.logDir;
  settings.redactor = input.redactor;
  return settings;
}

/** 一次写入的载体：条目、JSON 行与控制台行一起算好，落盘只做 IO。 */
interface Dispatch {
  consoleLine: string;
  json: string;
  record: ReturnType<typeof projectLogEntry>;
}

function composeDispatch(
  settings: FileLoggerSettings,
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
  error: Error | undefined,
): Dispatch {
  const merged = Object.assign({}, settings.defaultContext, context);
  const record = projectLogEntry(
    settings.category,
    level,
    message,
    merged,
    error,
    settings.includeErrorStack,
  );
  return {
    consoleLine: formatConsoleLine(record) + "\n",
    json: JSON.stringify(toSerializableEntry(record, settings.redactor)),
    record,
  };
}

export class NodeFileLogger implements Logger {
  private readonly settings: FileLoggerSettings;

  constructor(input: FileLoggerInput) {
    this.settings = withDefaults(input);
  }

  debug(message: string, context?: LogContext): void {
    this.dispatch(Level.Debug, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.dispatch(Level.Info, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.dispatch(Level.Warn, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.dispatch(Level.Error, message, context, error);
  }

  child(context: LogContext): Logger {
    const inherited = this.settings;
    return new NodeFileLogger({
      category: inherited.category,
      consoleStream: inherited.consoleStream,
      defaultContext: { ...inherited.defaultContext, ...context },
      getMinLevel: inherited.getMinLevel,
      includeErrorStack: inherited.includeErrorStack,
      logDir: inherited.logDir,
      redactor: inherited.redactor,
    });
  }

  /** 单次写入：级别门控 → 组合载荷 → JSONL 落盘 → 控制台一行。 */
  private dispatch(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const settings = this.settings;
    if (level < settings.getMinLevel.call(this)) return;
    const { consoleLine, json } = composeDispatch(settings, level, message, context, error);
    appendLogRecord(settings.logDir, json);
    settings.consoleStream?.write(consoleLine);
  }
}
