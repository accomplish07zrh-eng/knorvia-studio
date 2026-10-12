// SPDX-License-Identifier: Apache-2.0
// 文件 logger：级别门控、上下文合并、JSONL 落盘与控制台回声。
import type { LogContext, LogLevel, Logger, LogRedactor } from "@knorvia/contracts";
import { LogLevel as Level } from "@knorvia/contracts";
import { projectLogEntry } from "./entry.js";
import { appendLogRecord } from "./file-sink.js";
import { formatConsoleLine, toSerializableEntry } from "./serialize.js";

/**
 * 写入路径与不变式：
 * 1) 级别门控读 `getMinLevel()` 的实时值，宿主调高级别后已构造的 logger 立即生效；
 * 2) 上下文按「父上下文 ← 本次 context」浅合并，`child()` 只叠加不替换；
 * 3) 先投影 LogEntry 再序列化，JSONL 与控制台行来自同一份条目，不会出现两套字段；
 * 4) 落盘失败由 file-sink 按 void 合同吞掉，日志绝不阻断主流程。
 *
 * 对外形状 `FileLoggerInput` 与内部配置解耦：前者是契约字段名，后者可自由演进。
 */

/**
 * 构造入参（对外形状，字段名固定，B114 直接以字面量构造）：
 * 只有 defaultContext 与 includeErrorStack 可省略。
 */
export interface FileLoggerInput {
  category: string;
  consoleStream?: NodeJS.WritableStream;
  defaultContext?: LogContext;
  getMinLevel: () => LogLevel;
  includeErrorStack?: boolean;
  logDir: string;
  redactor: LogRedactor;
}

/** 内部配置：字段名与入参解耦，`child()` 只覆盖上下文。 */
interface FileLoggerSettings {
  baseContext: LogContext;
  consoleSink?: NodeJS.WritableStream;
  levelGate: () => LogLevel;
  masker: LogRedactor;
  scope: string;
  targetDir: string;
  withStack: boolean;
}

/** 入参 → 内部配置：补齐可省略项（空上下文、不带栈）。 */
function internalize(input: FileLoggerInput): FileLoggerSettings {
  const settings = {} as FileLoggerSettings;
  settings.baseContext = input.defaultContext ?? {};
  settings.consoleSink = input.consoleStream;
  settings.levelGate = input.getMinLevel;
  settings.masker = input.redactor;
  settings.scope = input.category;
  settings.targetDir = input.logDir;
  settings.withStack = input.includeErrorStack ?? false;
  return settings;
}

/** 一次写入的载荷：JSON 行与控制台行一起算好，落盘只做 IO。 */
interface Rendered {
  consoleLine: string;
  json: string;
}

function renderPayload(
  settings: FileLoggerSettings,
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
  error: Error | undefined,
): Rendered {
  const merged = Object.assign({}, settings.baseContext, context);
  const record = projectLogEntry(settings.scope, level, message, merged, error, settings.withStack);
  return {
    consoleLine: formatConsoleLine(record) + "\n",
    json: JSON.stringify(toSerializableEntry(record, settings.masker)),
  };
}

export class NodeFileLogger implements Logger {
  private readonly settings: FileLoggerSettings;

  constructor(input: FileLoggerInput) {
    this.settings = internalize(input);
  }

  debug(message: string, context?: LogContext): void {
    this.emit(Level.Debug, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.emit(Level.Info, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.emit(Level.Warn, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.emit(Level.Error, message, context, error);
  }

  /** 派生 logger：复制父配置，只把上下文叠加进去。 */
  child(context: LogContext): Logger {
    const parent = this.settings;
    return new NodeFileLogger({
      category: parent.scope,
      consoleStream: parent.consoleSink,
      defaultContext: { ...parent.baseContext, ...context },
      getMinLevel: parent.levelGate,
      includeErrorStack: parent.withStack,
      logDir: parent.targetDir,
      redactor: parent.masker,
    });
  }

  /** 单次写入：级别门控 → 组合载荷 → JSONL 落盘 → 控制台一行。 */
  private emit(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const settings = this.settings;
    if (level < settings.levelGate.call(this)) return;
    const rendered = renderPayload(settings, level, message, context, error);
    appendLogRecord(settings.targetDir, rendered.json);
    settings.consoleSink?.write(rendered.consoleLine);
  }
}
