type HostStructuredLogLevel = "info" | "warn" | "error";

interface HostStructuredLog {
  level: HostStructuredLogLevel;
  source: string;
  message: string;
}

interface HostLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface RawStreamLog {
  kind: "stdout" | "stderr";
  message: string;
}

interface EmitStructuredLogEntry extends HostStructuredLog {
  timestamp: string;
}

class HostLogRelayOwner {
  private phase: "raw" | "structured" = "raw";
  private readonly pending: RawStreamLog[] = [];

  public constructor(
    private readonly label: string,
    private readonly logger: HostLogger,
    private readonly publish?: (entry: EmitStructuredLogEntry) => void,
  ) {}

  public accept(kind: RawStreamLog["kind"], message: string): void {
    if (this.phase === "raw") this.pending.push({ kind, message });
  }

  public structured(entry: HostStructuredLog): void {
    // 结构化来源一旦出现即获得日志权威；后续抛错也不重新回放原始流造成重复。
    this.phase = "structured";
    this.pending.length = 0;
    const projected = {
      ...entry,
      timestamp: new Date().toLocaleTimeString(undefined, {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
      }),
    } satisfies EmitStructuredLogEntry;
    const level =
      projected.level === "error" ? "error" : projected.level === "warn" ? "warn" : "info";
    const line = `[host-log] (${this.label}) [${projected.source}] ${projected.message}`;
    this.logger[level](line);
    const publish = this.publish;
    publish?.(projected);
  }

  public flush(): void {
    if (this.phase === "structured") {
      this.pending.length = 0;
      return;
    }
    // 用 live buffer 索引保留重入添加；失败时整批仍留存，沿用既有回放边界。
    for (let index = 0; index < this.pending.length; index++) this.render(this.pending[index]!);
    this.pending.length = 0;
  }

  private render(record: RawStreamLog): void {
    if (record.kind === "stdout") {
      this.logger.info(`[host-stdout] (${this.label}):`, record.message);
      return;
    }
    const warning = /^\(node:\d+\)\s+(?:ExperimentalWarning|DeprecationWarning|Warning):/u.test(
      record.message.trimStart(),
    );
    if (warning) {
      const firstLine =
        record.message.trimStart().split(/\r?\n/u)[0]?.trimEnd() ?? record.message.trim();
      this.logger.warn(`[host-stderr] (${this.label}):`, firstLine);
    } else {
      this.logger.error(`[host-stderr] (${this.label}):`, record.message);
    }
  }
}

export function createHostLogRelay(
  label: string,
  logger: HostLogger,
  emitStructuredLogToRenderer?: (entry: EmitStructuredLogEntry) => void,
) {
  const relay = new HostLogRelayOwner(label, logger, emitStructuredLogToRenderer);
  return {
    onStdout(message: string): void {
      relay.accept("stdout", message);
    },
    onStderr(message: string): void {
      relay.accept("stderr", message);
    },
    onStructuredLog(entry: HostStructuredLog): void {
      relay.structured(entry);
    },
    flushRawLogs(): void {
      relay.flush();
    },
  };
}
