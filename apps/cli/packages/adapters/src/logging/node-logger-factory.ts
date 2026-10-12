// SPDX-License-Identifier: Apache-2.0
// 日志工厂：解析环境与覆盖项，产出 logger 并只放行一次保留清理。
import { join } from "node:path";
import type { LogContext, LogLevel, Logger } from "@knorvia/contracts";
import { LogLevel as Level } from "@knorvia/contracts";
import { KNORVIA_RUNTIME_ENV_KEY, normalizeKnorviaRuntimeEnv } from "@knorvia/shared";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { NodeFileLogger } from "./file-logger.js";
import type { NodeLoggerFactory, NodeLoggerFactoryOptions } from "./logger-factory-types.js";
import { scheduleLogRetentionCleanup as scheduleCleanup } from "./retention.js";
import { DefaultLogRedactor } from "./serialize.js";

const KNORVIA_LOG_DIR_KEY = "KNORVIA_LOG_DIR";
const KNORVIA_LOG_CONSOLE_KEY = "KNORVIA_LOG_CONSOLE";
const CONSOLE_FLAG = "1";
const ROOT_CATEGORY = "root";
const CLEANUP_CATEGORY = "knorvia";
const CLEANUP_MODULE = "adapters.logging";

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

/** 控制台输出开关：显式对象优先，其次显式 true，最后看环境变量。 */
function consoleStreamFor(options: NodeLoggerFactoryOptions): NodeJS.WritableStream | undefined {
  if (typeof options.console === "object") return options.console.stream;
  const enabled =
    options.console === true || options.env?.[KNORVIA_LOG_CONSOLE_KEY] === CONSOLE_FLAG;
  return enabled ? process.stderr : undefined;
}

interface FactoryState {
  cleanupStarted: boolean;
  minimum: LogLevel;
}

export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory {
  const state: FactoryState = {
    cleanupStarted: false,
    minimum: options.minLevel ?? initialLevel(options.env ?? process.env),
  };
  const logDir = options.logDir ?? options.env?.[KNORVIA_LOG_DIR_KEY] ?? getDefaultLogDir();
  const stream = consoleStreamFor(options);
  const redactor = options.redactor ?? new DefaultLogRedactor();

  const makeLogger = (category: string, defaultContext?: LogContext): Logger =>
    new NodeFileLogger({
      category,
      consoleStream: stream,
      defaultContext,
      getMinLevel: () => state.minimum,
      includeErrorStack: options.includeErrorStack,
      logDir,
      redactor,
    });

  return {
    createLogger: (category) => makeLogger(category),
    getLogDir: () => logDir,
    scheduleLogRetentionCleanup: (request = {}) => {
      if (state.cleanupStarted) return undefined;
      state.cleanupStarted = true;
      const logger = request.logger ?? makeLogger(CLEANUP_CATEGORY, { module: CLEANUP_MODULE });
      return scheduleCleanup({ ...request, logDir, logger });
    },
    setLevel: (level) => {
      state.minimum = level;
    },
    withContext: (context) => makeLogger(ROOT_CATEGORY, context),
  };
}
