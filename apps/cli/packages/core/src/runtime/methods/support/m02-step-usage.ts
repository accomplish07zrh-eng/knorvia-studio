// SPDX-License-Identifier: Apache-2.0
// 主回合用量：用步开始时的模型快照记账，并从已提交助手消息汇总缓存命中。
import type { MessageId, MessageWithParts, Model, ModelUsage, TraceContext } from "../../deps.js";
import {
  persistedTokenUsageBaseline,
  type PersistedTokenUsageBaseline,
} from "../../../agent/message-history-usage.js";
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { MainTurnCacheHitAggregate, RuntimeModelTextResult } from "../../types.js";
import { recordModelUsageFact } from "../usage-observability.js";
import type { ModelUsageFactInput } from "./usage-facts.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";
import { assignKeys, phrase } from "./m02-record.js";

const TASK_SOURCE = assignKeys<Record<string, string>>([
  ["subagent_child", phrase(["subagent"])],
  ["workflow_child", phrase(["workflow_child"])],
  ["nested_workflow_child", phrase(["workflow_child"])],
]);

const MAIN_TURN = phrase(["main_turn"]);

interface RecordMainTurnModelUsageInput {
  assistantMessageId: MessageId; // 本步助手消息
  error?: unknown; // 失败对象，成功时缺省
  model: Model; // 步开始时冻结的模型
  modelTraceContext: TraceContext; // 本步追踪
  networkEventStartIndex: number; // 网络事件起点
  result?: RuntimeModelTextResult; // 成功结果
  startedAt: number; // 请求开始毫秒
  status: "completed" | "error" | "cancelled"; // 记账状态
  toolCallCount?: number; // 已见工具调用数
}

interface AssistantUsageHit {
  messageIndex: number; // 源数组里从尾部命中的下标
  baseline: PersistedTokenUsageBaseline; // 该条已提交用量
}

interface CacheHitView {
  cacheReadTokens: number; // 本次读缓存
  cacheWriteTokens: number; // 本次写缓存
  hitRate: number | null; // 累计命中比
  hitRateRequestCount: number; // 计入的请求数
  inputTokens: number; // 本次输入窗
  latestHitRate: number | null; // 本次命中比
  totalCacheReadTokens: number; // 累计读缓存
  totalCacheWriteTokens: number; // 累计写缓存
  totalInputTokens: number; // 累计输入
}

export async function recordMainTurnModelUsage(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  input: RecordMainTurnModelUsageInput,
): Promise<void> {
  // 必须把入参里的 model 传下去。await 之后再读会话选择会把旧请求记到新模型上。
  const fact = assignKeys<ModelUsageFactInput>([
    ["assistantMessageId", input.assistantMessageId],
    ["error", input.error],
    ["events", state.events],
    ["model", input.model],
    ["networkEventStartIndex", input.networkEventStartIndex],
    ["parentUserMessageId", state.currentUserMessageId],
    ["querySource", querySourceForTask(runtime.config.taskType)],
    ["result", input.result],
    ["startedAt", input.startedAt],
    ["status", input.status],
    ["toolCallCount", input.toolCallCount],
    ["traceContext", input.modelTraceContext],
  ]);
  await recordModelUsageFact(runtime, fact);
}

export function querySourceForTask(taskType: AgentRuntimeInternal["config"]["taskType"]): string {
  const label = String(taskType);
  const mapped = TASK_SOURCE[label];
  return mapped ?? MAIN_TURN;
}

function committedBaseline(
  row: RuntimeMessageEntry | undefined,
): PersistedTokenUsageBaseline | undefined {
  if (!row || row.kind === "attachment" || row.message.role !== "assistant") {
    return undefined as PersistedTokenUsageBaseline | undefined;
  }
  return persistedTokenUsageBaseline(row.tokens);
}

export function findLatestCommittedAssistantUsage(
  sourceEntries: readonly (RuntimeMessageEntry | undefined)[],
): AssistantUsageHit | undefined {
  let cursor = sourceEntries.length;
  let hit: AssistantUsageHit | undefined;
  while (cursor > 0 && hit === undefined) {
    cursor -= 1;
    const baseline = committedBaseline(sourceEntries[cursor]);
    if (baseline) {
      hit = assignKeys<AssistantUsageHit>([
        ["messageIndex", cursor],
        ["baseline", baseline],
      ]);
    }
  }
  return hit;
}

function wholeCount(raw: number | undefined, least: number): number | undefined {
  const finite = typeof raw === "number" && Number.isFinite(raw);
  if (!finite) return undefined as number | undefined;
  const whole = Math.floor(raw);
  return whole >= least ? whole : (undefined as number | undefined);
}

function atLeastZero(raw: number | undefined): number | undefined {
  return wholeCount(raw, 0);
}

function atLeastOne(raw: number | undefined): number | undefined {
  return wholeCount(raw, 1);
}

function blankTotals(): MainTurnCacheHitAggregate {
  return assignKeys<MainTurnCacheHitAggregate>([
    ["requestCount", 0],
    ["totalInputTokens", 0],
    ["totalCacheReadTokens", 0],
    ["totalCacheWriteTokens", 0],
  ]);
}

function absorbAssistant(
  totals: MainTurnCacheHitAggregate,
  message: MessageWithParts,
  live: ReadonlySet<MessageId>,
): void {
  const info = message.info;
  // 先看是否仍在活跃集、是否助手、是否摘要，再读落盘 tokens。活跃投影里的 compact 用量可能已被清零。
  if (live.has(info.id) && info.role === "assistant" && !info.summary) {
    const inputTokens = atLeastZero(info.tokens.input) ?? 0;
    const cacheReadTokens = atLeastZero(info.tokens.cache.read) ?? 0;
    const cacheWriteTokens = atLeastZero(info.tokens.cache.write) ?? 0;
    const useful = inputTokens > 0 || cacheReadTokens > 0 || cacheWriteTokens > 0;
    if (useful) {
      totals.requestCount += 1;
      totals.totalInputTokens += inputTokens;
      totals.totalCacheReadTokens += cacheReadTokens;
      totals.totalCacheWriteTokens += cacheWriteTokens;
    }
  }
}

export function mainTurnCacheHitAggregateFromMessages(input: {
  activeMessages: readonly MessageWithParts[]; // 本轮仍活跃的消息
  persistedMessages: readonly MessageWithParts[]; // 已落盘、保留原始 tokens 的消息
}): MainTurnCacheHitAggregate {
  const live = new Set(input.activeMessages.map((row) => row.info.id));
  const totals = blankTotals();
  let index = 0;
  const rows = input.persistedMessages;
  while (index < rows.length) {
    absorbAssistant(totals, rows[index]!, live);
    index += 1;
  }
  return totals;
}

function windowInput(usage: ModelUsage | undefined): number | undefined {
  if (!usage) return undefined as number | undefined;
  const direct = atLeastOne(usage.inputTokens);
  if (direct !== undefined) return direct;
  const total = atLeastOne(usage.totalTokens);
  if (total === undefined) {
    const cached =
      (atLeastZero(usage.cacheReadTokens) ?? 0) + (atLeastZero(usage.cacheWriteTokens) ?? 0);
    return cached > 0 ? cached : (undefined as number | undefined);
  }
  const output = atLeastZero(usage.outputTokens) ?? 0;
  return Math.max(0, total - output);
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function recordMainTurnCacheHitUsage(
  runtime: AgentRuntimeInternal,
  usage: ModelUsage | undefined,
): CacheHitView | undefined {
  if (!usage) return undefined as CacheHitView | undefined;
  const inputTokens = windowInput(usage) ?? 0;
  const cacheReadTokens = atLeastZero(usage.cacheReadTokens) ?? 0;
  const cacheWriteTokens = atLeastZero(usage.cacheWriteTokens) ?? 0;
  const empty = inputTokens <= 0 && cacheReadTokens <= 0 && cacheWriteTokens <= 0;
  if (empty) return undefined as CacheHitView | undefined;
  const prior = runtime.mainTurnCacheHitAggregate;
  runtime.mainTurnCacheHitAggregate = assignKeys<MainTurnCacheHitAggregate>([
    ["requestCount", prior.requestCount + 1],
    ["totalInputTokens", prior.totalInputTokens + inputTokens],
    ["totalCacheReadTokens", prior.totalCacheReadTokens + cacheReadTokens],
    ["totalCacheWriteTokens", prior.totalCacheWriteTokens + cacheWriteTokens],
  ]);
  const aggregate = runtime.mainTurnCacheHitAggregate;
  const latestHitRate = share(cacheReadTokens, inputTokens);
  const hitRate = share(aggregate.totalCacheReadTokens, aggregate.totalInputTokens);
  return assignKeys<CacheHitView>([
    ["inputTokens", inputTokens],
    ["cacheReadTokens", cacheReadTokens],
    ["cacheWriteTokens", cacheWriteTokens],
    ["latestHitRate", latestHitRate],
    ["hitRate", hitRate],
    ["hitRateRequestCount", aggregate.requestCount],
    ["totalInputTokens", aggregate.totalInputTokens],
    ["totalCacheReadTokens", aggregate.totalCacheReadTokens],
    ["totalCacheWriteTokens", aggregate.totalCacheWriteTokens],
  ]);
}
