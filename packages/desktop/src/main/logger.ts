import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { formatTimestamp, redactDiagnosticValue } from "@knorvia/shared";
import { cleanupExpiredLogFiles, LOG_RETENTION_DAYS } from "./logRetention.js";
import { getAppConfigDir, maybeThrowInjectedFsFault } from "@knorvia/services/node";

type LogLevel = "debug" | "info" | "warn" | "error";

function activeLogDirectory(): string {
  const override =
    process.env.KNORVIA_ENV === "test"
      ? process.env.KNORVIA_E2E_RUNTIME_LOG_DIR?.trim()
      : undefined;
  return override || join(getAppConfigDir(), "logs");
}

function hasPipeClosedCode(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EPIPE"
  );
}

function handleStreamFailure(error: Error): void {
  // 父进程提前关闭管道会异步发出 EPIPE；只吞这个错误，其他流失败继续原样传播。
  if (!hasPipeClosedCode(error)) throw error;
}

function publishConsole(level: LogLevel, ...values: unknown[]): void {
  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try {
    output(...values);
  } catch (error) {
    if (!hasPipeClosedCode(error)) throw error;
  }
}

class PreparedLogRecord {
  public readonly date = new Date();
  public readonly prefix: string;
  public readonly values: unknown[];
  public readonly line: string;

  public constructor(level: LogLevel, source: string, args: unknown[]) {
    const timestamp = formatTimestamp(this.date);
    const pid = process.pid;
    this.values = args.map((value) => redactDiagnosticValue(value));
    const message = this.values
      .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
      .join(" ");
    this.line = `[${timestamp}] [${level}] [pid:${pid}] [${source}] ${message}\n`;
    this.prefix = `[${timestamp}] [pid:${pid}] [${source}]`;
  }

  public dailyFileName(): string {
    const year = this.date.getFullYear();
    const month = String(this.date.getMonth() + 1).padStart(2, "0");
    const day = String(this.date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}.log`;
  }
}

class MainDiagnosticSink {
  public initialize(): void {
    const directory = activeLogDirectory();
    mkdirSync(directory, { recursive: true });
    const retention = cleanupExpiredLogFiles(directory);
    if (retention.failedFiles.length > 0) {
      publishConsole(
        "warn",
        `[log-retention] failed to delete expired logs from ${directory}:`,
        retention.failedFiles,
        `retentionDays=${LOG_RETENTION_DAYS}`,
      );
    }
    process.stdout.on("error", handleStreamFailure);
    process.stderr.on("error", handleStreamFailure);
  }

  public emit(level: LogLevel, source: string, ...args: unknown[]): void {
    const record = new PreparedLogRecord(level, source, args);
    const directory = activeLogDirectory();
    mkdirSync(directory, { recursive: true });
    const filePath = join(directory, record.dailyFileName());
    publishConsole(level, record.prefix, ...record.values);
    try {
      maybeThrowInjectedFsFault({ operation: "appendFile", path: filePath });
      appendFileSync(filePath, record.line);
    } catch {
      // 文件日志是诊断输出：注入故障或写入失败不得改变应用操作的成功/失败。
    }
  }
}

const sink = new MainDiagnosticSink();
sink.initialize();

/** Main and renderer diagnostic entry points share the existing daily sink. */
export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") sink.emit("debug", "main", ...args);
  },
  info: (...args: unknown[]) => sink.emit("info", "main", ...args),
  warn: (...args: unknown[]) => sink.emit("warn", "main", ...args),
  error: (...args: unknown[]) => sink.emit("error", "main", ...args),
  fromRenderer: (level: LogLevel, args: unknown[]) => sink.emit(level, "renderer", ...args),
};
