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
import { DefaultLogRedactor, formatConsoleLine, toSerializableEntry } from "./serialize.js";
import {
  scheduleLogRetentionCleanup,
  type LogRetentionScheduleOptions,
  type LogRetentionTimer,
} from "./retention.js";

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

type FileLoggerOptions = {
  category: string;
  defaultContext?: LogContext;
  getMinLevel: () => LogLevel;
  logDir: string;
  consoleStream?: NodeJS.WritableStream;
  includeErrorStack?: boolean;
  redactor: LogRedactor;
};

export class NodeFileLogger implements Logger {
  private readonly settings: FileLoggerOptions & {
    defaultContext: LogContext;
    includeErrorStack: boolean;
  };

  constructor(options: FileLoggerOptions) {
    this.settings = {
      category: options.category,
      defaultContext: options.defaultContext ?? {},
      getMinLevel: options.getMinLevel,
      logDir: options.logDir,
      consoleStream: options.consoleStream,
      includeErrorStack: options.includeErrorStack ?? false,
      redactor: options.redactor,
    };
  }

  debug(message: string, context?: LogContext): void {
    this.write(Level.Debug, message, context);
  }
  info(message: string, context?: LogContext): void {
    this.write(Level.Info, message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.write(Level.Warn, message, context);
  }
  error(message: string, error?: Error, context?: LogContext): void {
    this.write(Level.Error, message, context, error);
  }

  child(context: LogContext): Logger {
    return new NodeFileLogger({
      ...this.settings,
      defaultContext: { ...this.settings.defaultContext, ...context },
    });
  }

  private write(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const settings = this.settings;
    if (level < settings.getMinLevel.call(this)) return;
    const merged = { ...settings.defaultContext, ...context };
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

function initialLevel(env: NodeJS.ProcessEnv): LogLevel {
  switch (normalizeKnorviaRuntimeEnv(env[KNORVIA_RUNTIME_ENV_KEY])) {
    case "development":
      return Level.Debug;
    case "production":
    case "test":
      return Level.Info;
    default: {
      const entry = process.argv[1] ?? "";
      return entry.endsWith(".ts") && entry.includes(join("packages", "cli", "src"))
        ? Level.Debug
        : Level.Info;
    }
  }
}

export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory {
  const state = {
    minimum: options.minLevel ?? initialLevel(options.env ?? process.env),
    cleanupAdmitted: false,
  };
  const directory = options.logDir ?? options.env?.KNORVIA_LOG_DIR ?? getDefaultLogDir();
  let output: NodeJS.WritableStream | undefined;
  if (typeof options.console === "object") output = options.console.stream;
  else if (options.console === true || options.env?.KNORVIA_LOG_CONSOLE === "1")
    output = process.stderr;
  const redactor = options.redactor ?? new DefaultLogRedactor();
  const create = (category: string, defaultContext?: LogContext): Logger =>
    new NodeFileLogger({
      category,
      defaultContext,
      getMinLevel: () => state.minimum,
      logDir: directory,
      consoleStream: output,
      includeErrorStack: options.includeErrorStack,
      redactor,
    });
  return {
    createLogger: (category) => create(category),
    withContext: (context) => create("root", context),
    setLevel: (level) => {
      state.minimum = level;
    },
    getLogDir: () => directory,
    scheduleLogRetentionCleanup: (request = {}) => {
      if (state.cleanupAdmitted) return undefined;
      state.cleanupAdmitted = true;
      return scheduleLogRetentionCleanup({
        ...request,
        logDir: directory,
        logger: request.logger ?? create("knorvia", { module: "adapters.logging" }),
      });
    },
  };
}
