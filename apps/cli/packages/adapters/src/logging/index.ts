// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Contract-based reimplementation; prior source exposure is recorded in licensing/evidence.

import { join } from "node:path";
import type { LogContext, LogLevel, Logger, LoggerFactory, LogRedactor } from "@knorvia/contracts";
import { LogLevel as Level } from "@knorvia/contracts";
import { KNORVIA_RUNTIME_ENV_KEY, normalizeKnorviaRuntimeEnv } from "@knorvia/shared";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { projectLogEntry } from "./entry.js";
import { appendLogRecord } from "./file-sink.js";
import {
  scheduleLogRetentionCleanup as scheduleCleanup,
  type LogRetentionScheduleOptions,
  type LogRetentionTimer,
} from "./retention.js";
import { DefaultLogRedactor, formatConsoleLine, toSerializableEntry } from "./serialize.js";

export {
  LOG_CLEANUP_STARTUP_DELAY_MS,
  LOG_RETENTION_DAYS,
  cleanupLogRetention,
  formatLocalLogDate,
  scheduleLogRetentionCleanup,
} from "./retention.js";
export type {
  LogRetentionCleanupOptions,
  LogRetentionCleanupResult,
  LogRetentionScheduleOptions,
  LogRetentionTimer,
} from "./retention.js";
export { DefaultLogRedactor } from "./serialize.js";
export type { SerializableLogEntry, SerializedLogError } from "./serialize.js";

/** 工厂入参：环境、目录、级别、控制台输出、错误栈与脱敏器都可覆盖。 */
export interface NodeLoggerFactoryOptions {
  env?: NodeJS.ProcessEnv;
  logDir?: string;
  minLevel?: LogLevel;
  console?: boolean | { stream: NodeJS.WritableStream };
  includeErrorStack?: boolean;
  redactor?: LogRedactor;
}

export type NodeLogRetentionScheduleOptions = Pick<
  LogRetentionScheduleOptions,
  "delayMs" | "logger" | "now" | "retentionDays" | "setTimeout"
>;

export interface NodeLoggerFactory extends LoggerFactory {
  getLogDir(): string;
  scheduleLogRetentionCleanup(
    options?: NodeLogRetentionScheduleOptions,
  ): LogRetentionTimer | undefined;
}

/** logger 的固定配置：一次构造后不再变化，child() 只覆盖上下文。 */
type LoggerSettings = {
  category: string;
  consoleStream?: NodeJS.WritableStream;
  defaultContext: LogContext;
  getMinLevel: () => LogLevel;
  includeErrorStack: boolean;
  logDir: string;
  redactor: LogRedactor;
};

type LoggerSettingsInput = Omit<LoggerSettings, "defaultContext" | "includeErrorStack"> & {
  defaultContext?: LogContext;
  includeErrorStack?: boolean;
};

const KNORVIA_LOG_DIR_KEY = "KNORVIA_LOG_DIR";
const KNORVIA_LOG_CONSOLE_KEY = "KNORVIA_LOG_CONSOLE";
const CONSOLE_FLAG = "1";

export class NodeFileLogger implements Logger {
  private readonly settings: LoggerSettings;

  constructor(input: LoggerSettingsInput) {
    const settings = {} as LoggerSettings;
    settings.category = input.category;
    settings.consoleStream = input.consoleStream;
    settings.defaultContext = input.defaultContext ?? {};
    settings.getMinLevel = input.getMinLevel;
    settings.includeErrorStack = input.includeErrorStack ?? false;
    settings.logDir = input.logDir;
    settings.redactor = input.redactor;
    this.settings = settings;
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

  /** 单次写入：级别门控 → 合并上下文 → 投影 → JSONL 落盘 → 控制台一行。 */
  private emit(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const settings = this.settings;
    if (level < settings.getMinLevel.call(this)) return;
    const merged = Object.assign({}, settings.defaultContext, context);
    const entry = projectLogEntry(
      settings.category,
      level,
      message,
      merged,
      error,
      settings.includeErrorStack,
    );
    const json = JSON.stringify(toSerializableEntry(entry, settings.redactor));
    appendLogRecord(settings.logDir, json);
    settings.consoleStream?.write(formatConsoleLine(entry) + "\n");
  }
}

export function getDefaultLogDir(): string {
  return join(resolveKnorviaDataRoot(), "cli", "log");
}

/** 非 dev/prod/test 环境：`tsx` 直跑源码时给 Debug，其余给 Info。 */
function runningFromSource(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith(".ts") && entry.includes(join("packages", "cli", "src"));
}

function initialLevel(env: NodeJS.ProcessEnv): LogLevel {
  const runtime = normalizeKnorviaRuntimeEnv(env[KNORVIA_RUNTIME_ENV_KEY]);
  if (runtime === "development") return Level.Debug;
  if (runtime === "production" || runtime === "test") return Level.Info;
  return runningFromSource() ? Level.Debug : Level.Info;
}

export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory {
  const runtime = {
    cleanupStarted: false,
    minimum: options.minLevel ?? initialLevel(options.env ?? process.env),
  };
  const env = options.env;
  const logDir = options.logDir ?? env?.[KNORVIA_LOG_DIR_KEY] ?? getDefaultLogDir();
  const wantsConsole = options.console === true || env?.[KNORVIA_LOG_CONSOLE_KEY] === CONSOLE_FLAG;
  let stream: NodeJS.WritableStream | undefined;
  if (typeof options.console === "object") stream = options.console.stream;
  else if (wantsConsole) stream = process.stderr;
  const redactor = options.redactor ?? new DefaultLogRedactor();

  const makeLogger = (category: string, defaultContext?: LogContext): Logger =>
    new NodeFileLogger({
      category,
      consoleStream: stream,
      defaultContext,
      getMinLevel: () => runtime.minimum,
      includeErrorStack: options.includeErrorStack,
      logDir,
      redactor,
    });

  return {
    createLogger: (category) => makeLogger(category),
    getLogDir: () => logDir,
    scheduleLogRetentionCleanup: (request = {}) => {
      if (runtime.cleanupStarted) return undefined;
      runtime.cleanupStarted = true;
      return scheduleCleanup({
        ...request,
        logDir,
        logger: request.logger ?? makeLogger("knorvia", { module: "adapters.logging" }),
      });
    },
    setLevel: (level) => {
      runtime.minimum = level;
    },
    withContext: (context) => makeLogger("root", context),
  };
}
