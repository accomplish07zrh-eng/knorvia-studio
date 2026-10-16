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
const CHILD_QUERY_SOURCE: Readonly<Record<string, string>> = {
  subagent_child: "subagent",
  workflow_child: "workflow_child",
  nested_workflow_child: "workflow_child",
};

const MAIN_TURN = "main_turn";

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
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  input: RecordMainTurnModelUsageInput,
): Promise<void> {
  // 必须把入参里的 model 传下去。await 之后再读会话选择会把旧请求记到新模型上。
  const fact = usageFact(host, loop, input);
  await recordModelUsageFact(host, fact);
}

function usageFact(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  input: RecordMainTurnModelUsageInput,
): ModelUsageFactInput {
  const {
    assistantMessageId,
    error,
    model,
    networkEventStartIndex,
    result,
    startedAt,
    status,
    toolCallCount,
    modelTraceContext: traceContext,
  } = input;
  const { events, currentUserMessageId: parentUserMessageId } = loop;
  const querySource = querySourceForTask(host.config.taskType);
  return {
    assistantMessageId,
    error,
    events,
    model,
    networkEventStartIndex,
    parentUserMessageId,
    querySource,
    result,
    startedAt,
    status,
    toolCallCount,
    traceContext,
  };
}

type TaskKind = AgentRuntimeInternal["config"]["taskType"];

export function querySourceForTask(taskType: TaskKind): string {
  const label = String(taskType);
  const mapped = CHILD_QUERY_SOURCE[label];
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

type SourceRows = readonly (RuntimeMessageEntry | undefined)[];

export function findLatestCommittedAssistantUsage(
  sourceEntries: SourceRows,
): AssistantUsageHit | undefined {
  let cursor = sourceEntries.length;
  let hit: AssistantUsageHit | undefined;
  while (cursor > 0 && hit === undefined) {
    cursor -= 1;
    const baseline = committedBaseline(sourceEntries[cursor]);
    if (baseline) {
      hit = { messageIndex: cursor, baseline };
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
  return {
    requestCount: 0,
    totalInputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
  };
}

function grownTotals(
  totals: MainTurnCacheHitAggregate,
  input: number,
  read: number,
  write: number,
): MainTurnCacheHitAggregate {
  return {
    requestCount: totals.requestCount + 1,
    totalInputTokens: totals.totalInputTokens + input,
    totalCacheReadTokens: totals.totalCacheReadTokens + read,
    totalCacheWriteTokens: totals.totalCacheWriteTokens + write,
  };
}

function assistantShare(
  message: MessageWithParts,
  live: ReadonlySet<MessageId>,
): { input: number; read: number; write: number } | undefined {
  const info = message.info;
  // 活跃投影里的 compact 用量可能已被清零，所以只拿 id 做成员判断，token 读落盘副本。
  const counted = live.has(info.id) && info.role === "assistant" && !info.summary;
  if (!counted) return undefined;
  const input = atLeastZero(info.tokens.input) ?? 0;
  const read = atLeastZero(info.tokens.cache.read) ?? 0;
  const write = atLeastZero(info.tokens.cache.write) ?? 0;
  if (input <= 0 && read <= 0 && write <= 0) return undefined;
  return { input, read, write };
}

export function mainTurnCacheHitAggregateFromMessages(input: {
  activeMessages: readonly MessageWithParts[]; // 本轮仍活跃的消息
  persistedMessages: readonly MessageWithParts[]; // 已落盘、保留原始 tokens 的消息
}): MainTurnCacheHitAggregate {
  const live = new Set(input.activeMessages.map((row) => row.info.id));
  // 每条有用量的消息返回新对象；跳过的消息沿用上一份，不在同一个累加器上改字段。
  return input.persistedMessages.reduce((totals, message) => {
    const share = assistantShare(message, live);
    if (share === undefined) return totals;
    return grownTotals(totals, share.input, share.read, share.write);
  }, blankTotals());
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

function cacheHitView(
  sample: { input: number; read: number; write: number },
  rolled: MainTurnCacheHitAggregate,
): CacheHitView {
  return {
    inputTokens: sample.input,
    cacheReadTokens: sample.read,
    cacheWriteTokens: sample.write,
    latestHitRate: share(sample.read, sample.input),
    hitRate: share(rolled.totalCacheReadTokens, rolled.totalInputTokens),
    hitRateRequestCount: rolled.requestCount,
    totalInputTokens: rolled.totalInputTokens,
    totalCacheReadTokens: rolled.totalCacheReadTokens,
    totalCacheWriteTokens: rolled.totalCacheWriteTokens,
  };
}

export function recordMainTurnCacheHitUsage(
  host: AgentRuntimeInternal,
  usage: ModelUsage | undefined,
): CacheHitView | undefined {
  if (!usage) return undefined as CacheHitView | undefined;
  const input = windowInput(usage) ?? 0;
  const read = atLeastZero(usage.cacheReadTokens) ?? 0;
  const write = atLeastZero(usage.cacheWriteTokens) ?? 0;
  const empty = input <= 0 && read <= 0 && write <= 0;
  if (empty) return undefined as CacheHitView | undefined;
  const prior = host.mainTurnCacheHitAggregate;
  host.mainTurnCacheHitAggregate = grownTotals(prior, input, read, write);
  return cacheHitView({ input, read, write }, host.mainTurnCacheHitAggregate);
}
