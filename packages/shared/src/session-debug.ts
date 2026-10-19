// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** 快照上限：轮次与网络条目分别截断，dedupe 只用于调用方去重窗口。 */
export const SESSION_DEBUG_LIMITS = { rounds: 200, network: 100, dedupe: 2000 } as const;

const ROUND_LIMIT = SESSION_DEBUG_LIMITS.rounds;
const NETWORK_LIMIT = SESSION_DEBUG_LIMITS.network;

export const sessionDebugParamsSchema = z.object({ sessionId: z.string().min(1) }).strict();

const text = () => z.string();
const count = () => z.number().finite().nonnegative();
const optionalCount = () => count().optional();
const optionalFlag = () => z.boolean().optional();
const headerMap = () => z.record(z.string(), z.string());
const optionalText = () => text().optional();
const nullableCount = () => count().nullable();

const usageShape = (): z.ZodRawShape => ({
  inputTokens: optionalCount(),
  outputTokens: optionalCount(),
  totalTokens: optionalCount(),
  reasoningTokens: optionalCount(),
  cachedInputTokens: optionalCount(),
  cachedWriteInputTokens: optionalCount(),
});

const debugUsageSchema = z.object(usageShape()).strict();

const roundShape = (): z.ZodRawShape => ({
  eventKey: text(),
  requestId: text(),
  requestIndex: count(),
  recordedAt: count(),
  usage: debugUsageSchema,
  hitRate: nullableCount(),
  generationDurationMs: nullableCount(),
  tokensPerSecond: nullableCount(),
});

export const sessionDebugRoundSchema = z.object(roundShape()).strict();

/** 网络事件的稳定词表；服务端与 renderer 共用，改名等同于协议变更。 */
const NETWORK_STATUS = {
  started: "model_request_started",
  completed: "model_request_completed",
  failed: "model_request_failed",
  retryScheduled: "model_retry_scheduled",
  streamStalled: "model_stream_stalled",
} as const;

type NetworkStatusType = (typeof NETWORK_STATUS)[keyof typeof NETWORK_STATUS];

const NETWORK_STATUS_TYPES = Object.values(NETWORK_STATUS) as [
  NetworkStatusType,
  ...NetworkStatusType[],
];

/** 可选计数/布尔字段一律可选，缺省与 false 语义不同，不能折叠。 */
const networkShape = (): z.ZodRawShape => ({
  eventKey: text(),
  traceId: text(),
  recordedAt: count(),
  statusType: z.enum(NETWORK_STATUS_TYPES),
  requestId: optionalText(),
  providerId: optionalText(),
  modelId: optionalText(),
  providerKind: optionalText(),
  transport: optionalText(),
  baseURL: optionalText(),
  querySource: optionalText(),
  queryId: optionalText(),
  timestamp: optionalText(),
  attempt: optionalCount(),
  maxAttempts: optionalCount(),
  nextAttempt: optionalCount(),
  retryable: optionalFlag(),
  statusCode: optionalCount(),
  durationMs: optionalCount(),
  delayMs: optionalCount(),
  idleMs: optionalCount(),
  timeoutMs: optionalCount(),
  reason: optionalText(),
  message: optionalText(),
  requestHeaders: headerMap(),
  responseHeaders: headerMap(),
  requestHeaderCount: count(),
  responseHeaderCount: count(),
});

export const sessionDebugNetworkEntrySchema = z.object(networkShape()).strict();

const cacheShape = (): z.ZodRawShape => ({
  hitRateRequestCount: count(),
  totalInputTokens: count(),
  totalCacheReadTokens: count(),
  hitRate: nullableCount(),
});

const snapshotShape = (): z.ZodRawShape => ({
  sessionId: text(),
  rounds: z.array(sessionDebugRoundSchema).max(ROUND_LIMIT),
  networkEntries: z.array(sessionDebugNetworkEntrySchema).max(NETWORK_LIMIT),
  cache: z.object(cacheShape()).strict().nullable(),
});

export const sessionDebugSnapshotSchema = z.object(snapshotShape()).strict();

export type SessionDebugSnapshot = z.output<typeof sessionDebugSnapshotSchema>;
export type SessionDebugNetworkEntry = z.output<typeof sessionDebugNetworkEntrySchema>;

/**
 * 输出 token 必须配「首输出到请求结束」的同源时长；未知时长不能用请求总耗时替代，
 * 否则 TPS 会被拉低成误导性的数字。
 */
export const calculateOutputTps = (
  outputTokens: number | undefined,
  durationMs: number | null,
): number | null => {
  const tokensValid = outputTokens !== undefined && Number.isFinite(outputTokens);
  if (!tokensValid || outputTokens < 0) return null;
  const durationValid = durationMs !== null && Number.isFinite(durationMs);
  if (!durationValid || durationMs <= 0) return null;
  const tps = (1000 * outputTokens) / durationMs;
  if (!Number.isFinite(tps)) return null;
  return tps;
};
