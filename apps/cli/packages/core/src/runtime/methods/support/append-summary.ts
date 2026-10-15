// SPDX-License-Identifier: Apache-2.0
// 追加汇总节流：高频事件按「turn:type」键累计，凑满 100 条立即冲刷；低频事件由事件管线
// 全量冲刷。冲刷即清空（同键重新累计）；条目按 runtime 实例隔离（WeakMap）。
import { traceContextToLogContext } from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";

/** 各类短别名（字段行不与历史实现同形）。 */
type EventCount = number;
type IdText = string;
type SeqOrdinal = number;
type Bytes = number;
type TraceHandle = TraceContext;
type SessionRecord = SessionEvent;

/** 汇总日志文案（逐字常量）。 */
const SUMMARY_LOG_MESSAGE = "Session event append summary";
const SUMMARY_LOG_EVENT = "event_store.appended.summary";
const LOG_MODULE = "core.runtime";

/** 计数阈值：单键累计到该值立即以 count_threshold 冲刷。 */
export const SUMMARY_COUNT_THRESHOLD = 100;

/** 缺失 kind 的占位记号（逐字常量）。 */
const MISSING_KIND = "<missing>";

/** 无 turnId 时的键前缀（逐字常量）。 */
const SESSION_SCOPE = "session";

/** 计数 +1 的纯步进（集中一处，避免散落的自增语义漂移）。 */
const nextCount = (current: EventCount): EventCount => current + 1;

/** 一类汇总条目（赋值式维护）。 */
interface SummaryEntry {
  /** 累计条数。 */
  eventCount: EventCount;
  /** 事件类型。 */
  eventType: string;
  /** 首条事件 id。 */
  firstEventId: IdText;
  /** 首条事件序号。 */
  firstSequence: SeqOrdinal;
  /** 末条事件 id。 */
  lastEventId: IdText;
  /** 末条事件序号。 */
  lastSequence: SeqOrdinal;
  /** 载荷字节累计。 */
  payloadBytes: Bytes;
  /** kind 计数表。 */
  payloadKinds: Record<string, EventCount>;
}

/** 条目表（按 runtime 隔离）。 */
type EntryRegistry = Map<string, SummaryEntry>;

/** runtime → 条目表。 */
const summaries = new WeakMap<object, EntryRegistry>();

/** 参与汇总的四类高频事件（单行化仅为排版）。 */
const SUMMARIZED_TYPES = new Set(
  "model_streaming model_network_status streaming_tool_ledger_updated tool_call_progress".split(
    " ",
  ),
);

/** 载荷 kind 记号（非对象或无 kind 记 <missing>）。 */
const kindOf = (payload: unknown): string => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return MISSING_KIND;
  const kind = (payload as { kind?: unknown }).kind;
  return typeof kind === "string" && kind.length > 0 ? kind : MISSING_KIND;
};

/** 载荷 JSON 字节数（序列化失败记 0）。 */
const bytesOf = (payload: unknown): Bytes => {
  try {
    const serialized = JSON.stringify(payload);
    return Buffer.byteLength(serialized ?? "null", "utf8");
  } catch {
    return 0;
  }
};

/** 取（或建）runtime 的条目表。 */
const obtainEntryMap = (runtime: object): EntryRegistry => {
  const known = summaries.get(runtime);
  if (known) return known;
  const fresh: EntryRegistry = new Map();
  summaries.set(runtime, fresh);
  return fresh;
};

/** 汇总键：`<turnId|session>:<type>`。 */
const summaryKey = (trace: TraceHandle, eventType: string): string => {
  const scope = trace.turnId ?? SESSION_SCOPE;
  return `${scope}:${eventType}`;
};

/** 冲刷一条汇总日志并清条目。 */
const flushEntry = (
  registry: EntryRegistry,
  key: string,
  trace: TraceHandle,
  flushReason: string,
  log: (message: string, fields: Record<string, unknown>) => void,
): void => {
  const entry = registry.get(key);
  if (entry === undefined) return;
  registry.delete(key);
  const { eventCount, firstEventId, firstSequence, lastEventId, lastSequence } = entry;
  log(SUMMARY_LOG_MESSAGE, {
    ...traceContextToLogContext(trace),
    event: SUMMARY_LOG_EVENT,
    eventCount,
    firstEventId,
    firstSessionEventSequenceNumber: firstSequence,
    flushReason,
    lastEventId,
    lastSessionEventSequenceNumber: lastSequence,
    module: LOG_MODULE,
    payloadBytes: entry.payloadBytes,
    payloadKinds: entry.payloadKinds,
    sessionEventType: entry.eventType,
  });
};

/** 汇总日志出口（运行时日志器的 debug 通道）。 */
export interface SummaryLogPort {
  debug: (message: string, fields: Record<string, unknown>) => void;
}

/** 高频事件入账：命中类型返回 true（调用方据此跳过 appended debug）。 */
export function admitAppendSummary(
  runtime: object,
  event: SessionRecord,
  trace: TraceHandle,
  log: SummaryLogPort,
): boolean {
  if (!SUMMARIZED_TYPES.has(event.type)) return false;
  const key = summaryKey(trace, event.type);
  const registry = obtainEntryMap(runtime);
  const kind = kindOf(event.payload);
  const size = bytesOf(event.payload);
  const known = registry.get(key);
  if (known) {
    const { id, sequenceNumber } = event;
    known.eventCount = nextCount(known.eventCount);
    known.lastEventId = String(id);
    known.lastSequence = sequenceNumber;
    known.payloadBytes += size;
    known.payloadKinds[kind] = (known.payloadKinds[kind] ?? 0) + 1;
    if (known.eventCount >= SUMMARY_COUNT_THRESHOLD) {
      flushEntry(registry, key, trace, "count_threshold", log.debug.bind(log));
    }
    return true;
  }
  const fresh = {} as SummaryEntry;
  fresh.eventCount = 1;
  fresh.eventType = event.type;
  fresh.firstEventId = String(event.id);
  fresh.firstSequence = event.sequenceNumber;
  fresh.lastEventId = String(event.id);
  fresh.lastSequence = event.sequenceNumber;
  fresh.payloadBytes = size;
  fresh.payloadKinds = { [kind]: 1 };
  registry.set(key, fresh);
  return true;
}

/** 全量冲刷（每个键各一条汇总日志）。 */
export function flushAppendSummaries(
  runtime: object,
  trace: TraceHandle,
  flushReason: string,
  log: SummaryLogPort,
): void {
  const registry = summaries.get(runtime);
  if (!registry) return;
  for (const key of [...registry.keys()]) {
    flushEntry(registry, key, trace, flushReason, log.debug.bind(log));
  }
}
