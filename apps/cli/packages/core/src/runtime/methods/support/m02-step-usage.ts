// SPDX-License-Identifier: Apache-2.0
// 主回合用量：记账快照、querySource、已提交助手基线、缓存命中聚合。
import type { MessageId, MessageWithParts, Model, ModelUsage, TraceContext } from "../../deps.js";
import {
  persistedTokenUsageBaseline,
  type PersistedTokenUsageBaseline,
} from "../../../agent/message-history-usage.js";
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { MainTurnCacheHitAggregate, RuntimeModelTextResult } from "../../types.js";
import { recordModelUsageFact } from "../usage-observability.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";

const SOURCE_BY_TASK: Record<string, string> = {
  subagent_child: "subagent",
  workflow_child: "workflow_child",
  nested_workflow_child: "workflow_child",
};

interface RecordMainTurnModelUsageInput {
  assistantMessageId: MessageId;
  error?: unknown;
  model: Model;
  modelTraceContext: TraceContext;
  networkEventStartIndex: number;
  result?: RuntimeModelTextResult;
  startedAt: number;
  status: "completed" | "error" | "cancelled";
  toolCallCount?: number;
}

export async function recordMainTurnModelUsage(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  input: RecordMainTurnModelUsageInput,
): Promise<void> {
  // 只使用步开始时传入的 model。await 之后再读会话选择会把旧请求记到新模型上。
  await recordModelUsageFact(runtime, {
    assistantMessageId: input.assistantMessageId,
    error: input.error,
    events: state.events,
    model: input.model,
    networkEventStartIndex: input.networkEventStartIndex,
    parentUserMessageId: state.currentUserMessageId,
    querySource: querySourceForTask(runtime.config.taskType),
    result: input.result,
    startedAt: input.startedAt,
    status: input.status,
    toolCallCount: input.toolCallCount,
    traceContext: input.modelTraceContext,
  });
}

export function querySourceForTask(taskType: AgentRuntimeInternal["config"]["taskType"]): string {
  return SOURCE_BY_TASK[String(taskType)] ?? "main_turn";
}

export function findLatestCommittedAssistantUsage(
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[],
): { messageIndex: number; baseline: PersistedTokenUsageBaseline } | undefined {
  for (let index = sourceEntries.length - 1; index >= 0; index -= 1) {
    const entry = sourceEntries[index];
    if (!entry) continue;
    if (entry.kind === "attachment") continue;
    if (entry.message.role !== "assistant") continue;
    const baseline = persistedTokenUsageBaseline(entry.tokens);
    if (baseline) return { messageIndex: index, baseline };
  }
  return undefined;
}

function finiteFloor(value: number | undefined, minimum: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const integer = Math.floor(value);
  return integer >= minimum ? integer : undefined;
}

function nonNegative(value: number | undefined): number | undefined {
  return finiteFloor(value, 0);
}

function positive(value: number | undefined): number | undefined {
  return finiteFloor(value, 1);
}

function emptyAggregate(): MainTurnCacheHitAggregate {
  return {
    requestCount: 0,
    totalInputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
  };
}

export function mainTurnCacheHitAggregateFromMessages(input: {
  activeMessages: readonly MessageWithParts[];
  persistedMessages: readonly MessageWithParts[];
}): MainTurnCacheHitAggregate {
  const activeIds = new Set(input.activeMessages.map((message) => message.info.id));
  return input.persistedMessages.reduce((aggregate, message) => {
    const info = message.info;
    if (!activeIds.has(info.id) || info.role !== "assistant" || info.summary) return aggregate;
    // 聚合读持久化 tokens。活跃投影里的 compact 用量可能已被清零。
    const inputTokens = nonNegative(info.tokens.input) ?? 0;
    const cacheReadTokens = nonNegative(info.tokens.cache.read) ?? 0;
    const cacheWriteTokens = nonNegative(info.tokens.cache.write) ?? 0;
    if (inputTokens <= 0 && cacheReadTokens <= 0 && cacheWriteTokens <= 0) return aggregate;
    return {
      requestCount: aggregate.requestCount + 1,
      totalInputTokens: aggregate.totalInputTokens + inputTokens,
      totalCacheReadTokens: aggregate.totalCacheReadTokens + cacheReadTokens,
      totalCacheWriteTokens: aggregate.totalCacheWriteTokens + cacheWriteTokens,
    };
  }, emptyAggregate());
}

function inputWindow(usage: ModelUsage | undefined): number | undefined {
  if (!usage) return undefined;
  const inputTokens = positive(usage.inputTokens);
  if (inputTokens !== undefined) return inputTokens;
  const total = positive(usage.totalTokens);
  if (total !== undefined) {
    const output = nonNegative(usage.outputTokens) ?? 0;
    return Math.max(0, total - output);
  }
  const cache =
    (nonNegative(usage.cacheReadTokens) ?? 0) + (nonNegative(usage.cacheWriteTokens) ?? 0);
  return cache > 0 ? cache : undefined;
}

export function recordMainTurnCacheHitUsage(
  runtime: AgentRuntimeInternal,
  usage: ModelUsage | undefined,
):
  | {
      cacheReadTokens: number;
      cacheWriteTokens: number;
      hitRate: number | null;
      hitRateRequestCount: number;
      inputTokens: number;
      latestHitRate: number | null;
      totalCacheReadTokens: number;
      totalCacheWriteTokens: number;
      totalInputTokens: number;
    }
  | undefined {
  if (!usage) return undefined;
  const inputTokens = inputWindow(usage) ?? 0;
  const cacheReadTokens = nonNegative(usage.cacheReadTokens) ?? 0;
  const cacheWriteTokens = nonNegative(usage.cacheWriteTokens) ?? 0;
  if (inputTokens <= 0 && cacheReadTokens <= 0 && cacheWriteTokens <= 0) return undefined;
  const prior = runtime.mainTurnCacheHitAggregate;
  runtime.mainTurnCacheHitAggregate = {
    requestCount: prior.requestCount + 1,
    totalInputTokens: prior.totalInputTokens + inputTokens,
    totalCacheReadTokens: prior.totalCacheReadTokens + cacheReadTokens,
    totalCacheWriteTokens: prior.totalCacheWriteTokens + cacheWriteTokens,
  };
  const aggregate = runtime.mainTurnCacheHitAggregate;
  const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    latestHitRate: ratio(cacheReadTokens, inputTokens),
    hitRate: ratio(aggregate.totalCacheReadTokens, aggregate.totalInputTokens),
    hitRateRequestCount: aggregate.requestCount,
    totalInputTokens: aggregate.totalInputTokens,
    totalCacheReadTokens: aggregate.totalCacheReadTokens,
    totalCacheWriteTokens: aggregate.totalCacheWriteTokens,
  };
}
