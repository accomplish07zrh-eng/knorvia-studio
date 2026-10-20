// SPDX-License-Identifier: Apache-2.0

/** 采样节奏与阈值属于运维契约：面板与日志解析都按这些数值做判断。 */
const SAMPLE_TUNING = {
  intervalMs: 60_000,
  heapDeltaRatio: 0.05,
  nativeDeltaRatio: 0.1,
  heartbeatMs: 300_000,
} as const;

export const MEMORY_SAMPLE_INTERVAL_MS = SAMPLE_TUNING.intervalMs;
export const MEMORY_SAMPLE_HEAP_DELTA_RATIO = SAMPLE_TUNING.heapDeltaRatio;
export const MEMORY_SAMPLE_NATIVE_DELTA_RATIO = SAMPLE_TUNING.nativeDeltaRatio;
export const MEMORY_SAMPLE_HEARTBEAT_MS = SAMPLE_TUNING.heartbeatMs;

const SAMPLE_ROLES = ["main", "renderer", "utility_host", "agent_node"] as const;

export type MemorySampleRole = (typeof SAMPLE_ROLES)[number];

const WRITE_REASONS = ["first", "changed", "heartbeat"] as const;

export type MemorySampleWriteReason = (typeof WRITE_REASONS)[number];

/** process.memoryUsage() 的原始字段名；协议字段名统一追加 Kb 后缀。 */
const USAGE_READINGS = ["rss", "heapUsed", "heapTotal", "external", "arrayBuffers"] as const;

type UsageReading = (typeof USAGE_READINGS)[number];

type MemoryFieldName = `${UsageReading}Kb`;

const FIELD_ORDER = USAGE_READINGS.map((reading) => `${reading}Kb`) as readonly MemoryFieldName[];

/** 进程内存的 KB 快照；字段缺省表示该运行时没有这一项。 */
type MemoryFields = Partial<Record<MemoryFieldName, number>>;

export type MemorySampleFields = MemoryFields;

type SampleIdentity = { role: MemorySampleRole; counters: Record<string, number> };

export type MemorySample = MemoryFields & SampleIdentity;

type GateOptions = {
  heapDeltaRatio?: number;
  nativeDeltaRatio?: number;
  heartbeatMs?: number;
};

export type MemorySampleWriteGateOptions = GateOptions;

export type MemorySampleWriteGate = {
  evaluate(sample: MemorySample, nowMs: number): MemorySampleWriteReason | null;
};

type RatioTable = Partial<Record<MemoryFieldName, number>>;

/** 堆与原生内存用不同阈值：堆增长通常是泄漏信号，原生增长更常见于短时缓存。 */
const ratioTable = (options: GateOptions): RatioTable => ({
  heapUsedKb: options.heapDeltaRatio ?? SAMPLE_TUNING.heapDeltaRatio,
  rssKb: options.nativeDeltaRatio ?? SAMPLE_TUNING.nativeDeltaRatio,
  externalKb: options.nativeDeltaRatio ?? SAMPLE_TUNING.nativeDeltaRatio,
});

/** 相对基准的增幅比较；基准钳到 1 以避免小数值被放大成噪声。 */
function grewBeyondThreshold(before: number, after: number, ratio: number): boolean {
  const reference = Math.max(before, 1);
  const delta = Math.abs(after - before);
  return delta > reference * ratio;
}

function memoryGrew(previous: MemorySample, next: MemorySample, ratios: RatioTable): boolean {
  return FIELD_ORDER.some((field) => {
    const ratio = ratios[field];
    const before = previous[field];
    const after = next[field];
    const comparable = before !== undefined && after !== undefined && ratio !== undefined;
    return comparable ? grewBeyondThreshold(before, after, ratio) : false;
  });
}

function counterDeltas(previous: MemorySample, next: MemorySample): string[] {
  const keys = new Set([...Object.keys(previous.counters), ...Object.keys(next.counters)]);
  return [...keys].filter((key) => previous.counters[key] !== next.counters[key]);
}

/**
 * 写入门：只在「首个样本 / 内存或计数器变化 / 心跳到期」时允许落盘，
 * 避免高频采样把诊断日志写满；状态由闭包持有，gate 本身不读时钟。
 */
export function createMemorySampleWriteGate(options: GateOptions = {}): MemorySampleWriteGate {
  const ratios = ratioTable(options);
  const heartbeatMs = options.heartbeatMs ?? SAMPLE_TUNING.heartbeatMs;
  let snapshot: MemorySample | undefined;
  let snapshotAt = 0;

  const accept = (sample: MemorySample, nowMs: number): void => {
    snapshot = { ...sample, counters: { ...sample.counters } };
    snapshotAt = nowMs;
  };

  const classify = (sample: MemorySample, nowMs: number): MemorySampleWriteReason | null => {
    if (snapshot === undefined) return "first";
    const previous = snapshot;
    if (memoryGrew(previous, sample, ratios)) return "changed";
    if (counterDeltas(previous, sample).length > 0) return "changed";
    return nowMs - snapshotAt >= heartbeatMs ? "heartbeat" : null;
  };

  return {
    evaluate: (sample, nowMs) => {
      const reason = classify(sample, nowMs);
      if (reason !== null) accept(sample, nowMs);
      return reason;
    },
  };
}

/** 诊断输出以 KB 为单位的整数，避免日志里出现长小数。 */
export const bytesToKb = (byteCount: number): number => Math.round(byteCount / 1024);

type NodeMemoryUsage = {
  rss?: number;
  heapUsed?: number;
  heapTotal?: number;
  external?: number;
  arrayBuffers?: number;
};

export function memoryUsageToSampleFields(usage: NodeMemoryUsage): MemorySampleFields {
  const source = usage as Partial<Record<UsageReading, number>>;
  const fields: MemoryFields = {};
  for (const reading of USAGE_READINGS) {
    const bytes = source[reading];
    if (typeof bytes !== "number") continue;
    const field = `${reading}Kb` as MemoryFieldName;
    fields[field] = bytesToKb(bytes);
  }
  return fields;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatAmount = (amount: number): string => String(Math.round(amount));

const appendField = (segments: string[], field: string, amount: unknown): void => {
  if (isFiniteNumber(amount)) segments.push(`${field}=${formatAmount(amount)}`);
};

/** 计数器按 key 排序后逐项追加，保证同一进程的采样日志可逐行 diff。 */
function appendCounters(segments: string[], counters: Record<string, number>): void {
  const keys = Object.keys(counters).sort();
  for (const key of keys) appendField(segments, key, counters[key]);
}

/**
 * 单行日志格式：固定字段顺序在前，计数器按 key 排序在后。
 * 非有限值直接跳过——NaN 混进日志只会掩盖真实的内存变化。
 */
export function formatMemorySampleLine(
  sample: MemorySample,
  reason: MemorySampleWriteReason,
): string {
  const segments = ["[memory]", `role=${sample.role}`, `reason=${reason}`];
  for (const field of FIELD_ORDER) appendField(segments, field, sample[field]);
  appendCounters(segments, sample.counters);
  return segments.join(" ");
}

type ProviderOutput = Record<string, number>;

export type MemoryDiagnosticsProvider = () => ProviderOutput;

export type MemoryDiagnosticsRegistry = {
  register(label: string, provider: MemoryDiagnosticsProvider): { dispose(): void };
  collect: () => ProviderOutput;
};

function safeProduce(provider: MemoryDiagnosticsProvider): ProviderOutput | undefined {
  try {
    return provider();
  } catch {
    // 单个提供者调用或读取失败不能中断其他诊断，已收集的条目仍然保留。
    return undefined;
  }
}

export const createMemoryDiagnosticsRegistry = (): MemoryDiagnosticsRegistry => {
  const providers = new Map<string, MemoryDiagnosticsProvider>();

  return {
    register: (label, provider) => {
      providers.set(label, provider);
      return {
        dispose: () => {
          if (providers.get(label) === provider) providers.delete(label);
        },
      };
    },
    collect: () => {
      const output: ProviderOutput = {};
      for (const [namespace, provider] of providers) {
        const produced = safeProduce(provider);
        if (produced === undefined) continue;
        for (const [key, amount] of Object.entries(produced)) {
          if (isFiniteNumber(amount)) output[`${namespace}.${key}`] = amount;
        }
      }
      return output;
    },
  };
};
