import {
  knorviaContextUsageBreakdownSchema,
  type KnorviaContextUsageBreakdownItem,
  type KnorviaSessionContextUsage,
} from "@knorvia/shared";
import {
  getModelUsageContextTokens,
  SessionEventType,
  type MessageWithParts,
  type ModelCompletePayload,
  type SessionEvent,
  type SessionProjection,
} from "@knorvia/contracts";
import { sessionInteger, sessionString } from "./session-projection-primitives.js";

type Usage = KnorviaSessionContextUsage;
interface Breakdown {
  used: number;
  contextWindow?: number;
  breakdown: KnorviaContextUsageBreakdownItem[];
}

function requestCache(messages: readonly MessageWithParts[]): Usage["cache"] {
  const totals = [0, 0, 0];
  let latest = [0, 0, 0];
  let requests = 0;
  for (const message of messages) {
    if (message.info.role !== "assistant" || message.info.summary) continue;
    const vector = [
      sessionInteger(message.info.tokens.input) ?? 0,
      sessionInteger(message.info.tokens.cache.read) ?? 0,
      sessionInteger(message.info.tokens.cache.write) ?? 0,
    ];
    if (vector.every((count) => count <= 0)) continue;
    requests += 1;
    for (let component = 0; component < totals.length; component += 1) {
      totals[component] = totals[component]! + vector[component]!;
    }
    latest = vector;
  }
  if (requests === 0) return undefined;
  const [input = 0, read = 0, write = 0] = latest;
  const [allInput = 0, allRead = 0, allWrite = 0] = totals;
  return {
    inputTokens: input,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    latestHitRate: input > 0 ? read / input : null,
    hitRate: allInput > 0 ? allRead / allInput : null,
    hitRateRequestCount: requests,
    totalInputTokens: allInput,
    totalCacheReadTokens: allRead,
    totalCacheWriteTokens: allWrite,
  };
}

function persistedUsage(messages: readonly MessageWithParts[], window: number): Usage | undefined {
  if (window <= 0) return undefined;
  const cache = requestCache(messages);
  for (let offset = messages.length; offset > 0; ) {
    const message = messages[--offset];
    if (!message) continue;
    if (message.info.role === "user" && message.info.summary) {
      const part = message.parts.find(
        (candidate) => candidate.type === "compaction" && candidate.compactBoundary,
      );
      if (part?.type === "compaction" && part.compactBoundary) {
        const boundary = part.compactBoundary;
        const used = sessionInteger(
          boundary.truePostCompactTokenCount ?? boundary.postCompactTokenCount,
          1,
        );
        // 保留压缩恢复修复：summary boundary 赢过旧 assistant 水位，不能接旧 cache。
        if (used !== undefined) return { cost: null, size: window, used };
      }
    }
    if (message.info.role !== "assistant" || message.info.summary) continue;
    const tokens = message.info.tokens;
    let used: number | undefined;
    if (tokens) {
      used = sessionInteger(tokens.total, 1);
      if (used === undefined) {
        const input = sessionInteger(tokens.input, 1);
        if (input !== undefined) used = input + (sessionInteger(tokens.output) ?? 0);
      }
    }
    if (used !== undefined) return { ...(cache ? { cache } : {}), cost: null, size: window, used };
  }
  return undefined;
}

function latestBreakdown(events: readonly SessionEvent[]): Breakdown | undefined {
  for (let offset = events.length; offset > 0; ) {
    const event = events[--offset];
    if (!event || event.type !== SessionEventType.ModelComplete) continue;
    const payload = event.payload as Partial<ModelCompletePayload>;
    const source = sessionString(payload.querySource);
    if (source !== undefined && source !== "main_turn") continue;
    const parsed = knorviaContextUsageBreakdownSchema.safeParse(payload.contextUsageBreakdown);
    const used = getModelUsageContextTokens(payload.usage);
    if (!parsed.success || parsed.data.length === 0 || used === undefined) continue;
    const window = sessionInteger(payload.contextWindow, 1);
    return {
      breakdown: parsed.data,
      ...(window !== undefined ? { contextWindow: window } : {}),
      used,
    };
  }
  return undefined;
}

export function resolveSessionContextUsage(input: {
  messages: readonly MessageWithParts[];
  persistedContextUsageBreakdownEvents?: readonly SessionEvent[];
  projection: SessionProjection;
}): Usage | undefined {
  const { projection } = input;
  const persisted = persistedUsage(input.messages, projection.contextWindow);
  let selected = persisted;
  const cache = persisted?.used === projection.contextUsed ? persisted.cache : undefined;
  if (!(projection.contextUsed <= 0 || projection.contextWindow <= 0)) {
    selected = {
      ...(cache ? { cache } : {}),
      cost: null,
      size: projection.contextWindow,
      used: projection.contextUsed,
    };
  }
  const candidate = latestBreakdown(input.persistedContextUsageBreakdownEvents ?? []);
  if (!selected || !candidate || candidate.breakdown.length === 0) return selected;
  if (selected.breakdown && selected.breakdown.length > 0) return selected;
  if (candidate.used !== selected.used) return selected;
  if (candidate.contextWindow !== undefined && candidate.contextWindow !== selected.size)
    return selected;
  return { ...selected, breakdown: candidate.breakdown };
}
