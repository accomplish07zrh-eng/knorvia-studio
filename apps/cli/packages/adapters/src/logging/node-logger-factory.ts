// SPDX-License-Identifier: Apache-2.0
// 日志工厂：解析环境与覆盖项，产出 logger 并只放行一次保留清理。
//
// 解析顺序：显式覆盖项 → 环境变量（KNORVIA_LOG_DIR / KNORVIA_LOG_CONSOLE）→ 默认值；
// 级别同理（minLevel → 运行时环境 → 是否直跑源码）。
// 清理只在进程内放行一次，重复调用返回 undefined。
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

/** 运行时环境 → 默认级别；未列出的环境再按是否直跑源码判断。 */
const LEVEL_BY_RUNTIME: Record<string, LogLevel> = {
  development: Level.Debug,
  production: Level.Info,
  test: Level.Info,
};

/** 工厂状态：级别可被 setLevel 改写，清理只放行一次。 */
interface Gate {
  cleanupStarted: boolean;
  minimum: LogLevel;
}

export function getDefaultLogDir(): string {
  return join(resolveKnorviaDataRoot(), "cli", "log");
}

/** `tsx` 直跑源码（argv 指向 .ts 且在 packages/cli/src 下）时给 Debug。 */
function fromSourceTree(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith(".ts") && entry.includes(join("packages", "cli", "src"));
}

function levelFromEnv(env: NodeJS.ProcessEnv): LogLevel {
  const runtime = normalizeKnorviaRuntimeEnv(env[KNORVIA_RUNTIME_ENV_KEY]);
  const mapped = runtime === undefined ? undefined : LEVEL_BY_RUNTIME[runtime];
  if (mapped !== undefined) return mapped;
  return fromSourceTree() ? Level.Debug : Level.Info;
}

/** 控制台输出开关：显式对象优先，其次显式 true，最后看环境变量。 */
function resolveConsoleStream(
  options: NodeLoggerFactoryOptions,
): NodeJS.WritableStream | undefined {
  if (typeof options.console === "object") return options.console.stream;
  const enabled =
    options.console === true || options.env?.[KNORVIA_LOG_CONSOLE_KEY] === CONSOLE_FLAG;
  return enabled ? process.stderr : undefined;
}

export function createNodeLoggerFactory(options: NodeLoggerFactoryOptions = {}): NodeLoggerFactory {
  const gate: Gate = {
    cleanupStarted: false,
    minimum: options.minLevel ?? levelFromEnv(options.env ?? process.env),
  };
  const logDir = options.logDir ?? options.env?.[KNORVIA_LOG_DIR_KEY] ?? getDefaultLogDir();
  const stream = resolveConsoleStream(options);
  const redactor = options.redactor ?? new DefaultLogRedactor();

  const buildLogger = (category: string, defaultContext?: LogContext): Logger =>
    new NodeFileLogger({
      category,
      consoleStream: stream,
      defaultContext,
      getMinLevel: () => gate.minimum,
      includeErrorStack: options.includeErrorStack,
      logDir,
      redactor,
    });

  return {
    getLogDir: () => logDir,
    setLevel: (level) => {
      gate.minimum = level;
    },
    withContext: (context) => buildLogger(ROOT_CATEGORY, context),
    createLogger: (category) => buildLogger(category),
    scheduleLogRetentionCleanup: (request = {}) => {
      if (gate.cleanupStarted) return undefined;
      gate.cleanupStarted = true;
      const logger = request.logger ?? buildLogger(CLEANUP_CATEGORY, { module: CLEANUP_MODULE });
      return scheduleCleanup({ ...request, logDir, logger });
    },
  };
}
