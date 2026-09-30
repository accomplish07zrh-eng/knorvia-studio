// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { Logger, LogContext, LogRedactor } from "@knorvia/contracts";
import {
  NodeFileLogger,
  DefaultLogRedactor,
  createNodeLoggerFactory,
  cleanupLogRetention,
  scheduleLogRetentionCleanup,
  formatLocalLogDate,
  getDefaultLogDir,
  LOG_RETENTION_DAYS,
  LOG_CLEANUP_STARTUP_DELAY_MS,
  type NodeLoggerFactory,
  type NodeLoggerFactoryOptions,
  type NodeLogRetentionScheduleOptions,
  type LogRetentionCleanupResult,
  type LogRetentionCleanupOptions,
  type LogRetentionScheduleOptions,
  type LogRetentionTimer,
  type SerializedLogError,
  type SerializableLogEntry,
} from "logging-under-test";

const redactor: LogRedactor = new DefaultLogRedactor();
const logger: Logger = new NodeFileLogger({
  category: "contract",
  getMinLevel: () => 0,
  logDir: "fixture",
  redactor,
});
const context: LogContext = { sessionId: "fixture", status: "cancelled" };
logger.debug("debug", context);
logger.info("info", context);
logger.warn("warn", context);
logger.error("error", new Error("fixture"), context);
const child: Logger = logger.child(context);
const factoryOptions: NodeLoggerFactoryOptions = { minLevel: 1, console: false, env: {} };
const factory: NodeLoggerFactory = createNodeLoggerFactory(factoryOptions);
factory.setLevel(2);
const directory: string = factory.getLogDir();
const log: Logger = factory.createLogger("fixture");
const contextual: Logger = factory.withContext(context);
const cleanupOptions: LogRetentionCleanupOptions = { logDir: "fixture", now: new Date(), logger };
const cleanup: Promise<LogRetentionCleanupResult> = cleanupLogRetention(cleanupOptions);
const schedule: LogRetentionScheduleOptions = {
  logDir: "fixture",
  now: () => new Date(),
  setTimeout: () => ({}),
};
const timer: LogRetentionTimer = scheduleLogRetentionCleanup(schedule);
const request: NodeLogRetentionScheduleOptions = { delayMs: 0, now: () => new Date() };
const maybeTimer: LogRetentionTimer | undefined = factory.scheduleLogRetentionCleanup(request);
const error: SerializedLogError = {
  name: "Error",
  message: "fixture",
  cause: { name: "Error", message: "cause" },
};
const entry: SerializableLogEntry = { message: "fixture", error };
const date: string = formatLocalLogDate(new Date());
const defaultDirectory: string = getDefaultLogDir();
const days: number = LOG_RETENTION_DAYS;
const delay: number = LOG_CLEANUP_STARTUP_DELAY_MS;
void [
  child,
  directory,
  log,
  contextual,
  cleanup,
  timer,
  maybeTimer,
  entry,
  date,
  defaultDirectory,
  days,
  delay,
];

// @ts-expect-error minimum level remains a numeric public enum
factory.setLevel("info");
// @ts-expect-error the public scheduler takes a date-producing function
factory.scheduleLogRetentionCleanup({ now: new Date() });
// @ts-expect-error direct cleanup takes a date, not a function
cleanupLogRetention({ logDir: "fixture", now: () => new Date() });
