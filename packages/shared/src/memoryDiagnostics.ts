export const MEMORY_SAMPLE_INTERVAL_MS = 60000;
export const MEMORY_SAMPLE_HEAP_DELTA_RATIO = 0.05;
export const MEMORY_SAMPLE_NATIVE_DELTA_RATIO = 0.1;
export const MEMORY_SAMPLE_HEARTBEAT_MS = 300000;

export type MemorySampleRole = "main" | "renderer" | "utility_host" | "agent_node";

export type MemorySampleWriteReason = "first" | "changed" | "heartbeat";

export interface MemorySampleFields {
  rssKb?: number;
  heapUsedKb?: number;
  heapTotalKb?: number;
  externalKb?: number;
  arrayBuffersKb?: number;
}

export interface MemorySample extends MemorySampleFields {
  role: MemorySampleRole;
  counters: Record<string, number>;
}

export interface MemorySampleWriteGateOptions {
  heapDeltaRatio?: number;
  nativeDeltaRatio?: number;
  heartbeatMs?: number;
}

export interface MemorySampleWriteGate {
  evaluate(sample: MemorySample, nowMs: number): MemorySampleWriteReason | null;
}

export function createMemorySampleWriteGate(
  options: MemorySampleWriteGateOptions = {},
): MemorySampleWriteGate {
  const nativeRatio = options.nativeDeltaRatio ?? MEMORY_SAMPLE_NATIVE_DELTA_RATIO;
  const ratios = {
    heapUsedKb: options.heapDeltaRatio ?? MEMORY_SAMPLE_HEAP_DELTA_RATIO,
    rssKb: nativeRatio,
    externalKb: nativeRatio,
  };
  const heartbeat = options.heartbeatMs ?? MEMORY_SAMPLE_HEARTBEAT_MS;
  let written: MemorySample | undefined;
  let writtenAt = 0;

  return {
    evaluate(sample, nowMs) {
      let decision: MemorySampleWriteReason | null = null;

      if (written === undefined) {
        decision = "first";
      } else {
        const previous = written;
        const memoryKeys = Object.keys(ratios) as Array<keyof typeof ratios>;
        const memoryChanged = memoryKeys.some((key) => {
          const before = previous[key];
          const after = sample[key];
          return (
            before !== undefined &&
            after !== undefined &&
            Math.abs(after - before) > Math.max(before, 1) * ratios[key]
          );
        });
        let countersChanged = false;
        if (!memoryChanged) {
          const counterKeys = new Set([
            ...Object.keys(previous.counters),
            ...Object.keys(sample.counters),
          ]);
          for (const key of counterKeys) {
            if (sample.counters[key] !== previous.counters[key]) {
              countersChanged = true;
              break;
            }
          }
        }

        if (memoryChanged || countersChanged) {
          decision = "changed";
        } else if (nowMs - writtenAt >= heartbeat) {
          decision = "heartbeat";
        }
      }

      if (decision !== null) {
        written = { ...sample, counters: { ...sample.counters } };
        writtenAt = nowMs;
      }
      return decision;
    },
  };
}

export function bytesToKb(bytes: number): number {
  return Math.round(bytes / 1024);
}

export function memoryUsageToSampleFields(usage: {
  rss?: number;
  heapUsed?: number;
  heapTotal?: number;
  external?: number;
  arrayBuffers?: number;
}): MemorySampleFields {
  const fields: MemorySampleFields = {};
  const mappings = [
    ["rss", "rssKb"],
    ["heapUsed", "heapUsedKb"],
    ["heapTotal", "heapTotalKb"],
    ["external", "externalKb"],
    ["arrayBuffers", "arrayBuffersKb"],
  ] as const;

  for (const [source, destination] of mappings) {
    const amount = usage[source];
    if (typeof amount === "number") {
      fields[destination] = bytesToKb(amount);
    }
  }
  return fields;
}

export function formatMemorySampleLine(
  sample: MemorySample,
  reason: MemorySampleWriteReason,
): string {
  const parts = ["[memory]", "role=" + sample.role, "reason=" + reason];
  const orderedFields: Array<keyof MemorySampleFields> = [
    "rssKb",
    "heapUsedKb",
    "heapTotalKb",
    "externalKb",
    "arrayBuffersKb",
  ];

  for (const field of orderedFields) {
    const amount = sample[field];
    if (typeof amount === "number" && Number.isFinite(amount)) {
      parts.push(field + "=" + Math.round(amount));
    }
  }
  for (const key of Object.keys(sample.counters).sort()) {
    const amount = sample.counters[key];
    if (typeof amount === "number" && Number.isFinite(amount)) {
      parts.push(key + "=" + Math.round(amount));
    }
  }
  return parts.join(" ");
}

export type MemoryDiagnosticsProvider = () => Record<string, number>;

export interface MemoryDiagnosticsRegistry {
  register(
    name: string,
    provider: MemoryDiagnosticsProvider,
  ): {
    dispose(): void;
  };
  collect(): Record<string, number>;
}

export function createMemoryDiagnosticsRegistry(): MemoryDiagnosticsRegistry {
  const providers = new Map<string, MemoryDiagnosticsProvider>();

  return {
    register(name, provider) {
      providers.set(name, provider);
      return {
        dispose() {
          if (providers.get(name) === provider) {
            providers.delete(name);
          }
        },
      };
    },
    collect() {
      const collected: Record<string, number> = {};
      for (const [name, provider] of providers) {
        try {
          const entries = Object.entries(provider());
          for (const [key, amount] of entries) {
            if (typeof amount === "number" && Number.isFinite(amount)) {
              collected[name + "." + key] = amount;
            }
          }
        } catch {
          // 单个提供者调用或读取失败不能中断其他诊断，已收集的条目仍然保留。
        }
      }
      return collected;
    },
  };
}
