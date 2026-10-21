// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 任务级用量聚合：一行一条 model_usage 记录，出口是 TaskUsageQueryResult。
//
// 口径说明（inputSide）：
// 一、历史数据里 input_tokens 有时只记「新增输入」，有时把缓存读写也算进去，
//     因此不能直接累加，必须按同一行的其余列推断当前库口径。
// 二、只有 input 时按 input 计；只有 cache 时按 cache 计；两者都有时用总数校验：
//     若 (input + cache + output) 更接近 provider/computed 总数，说明总数含缓存；
//     否则说明总数只含 input，取 input 即可。
// 三、缓存读写两列各自计数后相加，避免只取其中一列导致少算。

import type { DatabaseSync } from "node:sqlite";
import type { TaskUsageQueryInput, TaskUsageQueryResult } from "@knorvia/contracts";
import { usageCount } from "./usage-values.js";

type UsageRow = Record<string, unknown>;

/** 需要按「一行记录 → 一个增量」累加的计数字段。 */
const TOKEN_COUNTERS = [
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
] as const;

type TokenCounter = (typeof TOKEN_COUNTERS)[number];

/** 每条记录贡献的各字段增量；未列出的字段不参与逐行累加。 */
type TokenDelta = Record<TokenCounter, number>;

/** 全零的计数器骨架：用一条映射生成，避免把 5 个字段逐行写一遍。 */
function emptyCounters(): Record<TokenCounter, number> {
  return Object.fromEntries(TOKEN_COUNTERS.map((key) => [key, 0])) as Record<TokenCounter, number>;
}

function inputSide(record: UsageRow, total: number): number {
  const request = usageCount(record.input_tokens);
  const cache =
    usageCount(record.cache_creation_input_tokens) + usageCount(record.cache_read_input_tokens);
  if (request === 0) return cache;
  if (cache === 0) return request;
  const preferred = usageCount(total);
  if (preferred === 0) return request;
  const output = usageCount(record.output_tokens);
  const includedDistance = Math.abs(preferred - (request + output));
  const excludedDistance = Math.abs(preferred - (request + cache + output));
  return excludedDistance < includedDistance ? request + cache : request;
}

/**
 * 单条记录贡献的增量。
 *
 * 增量来源（incremental）只计「新增输入」：按来源记录基线，本行减去基线即为本次消耗；
 * 非增量来源（历史口径）则把缓存读写也计入。
 */
function deltaOf(
  record: UsageRow,
  baselines: Record<string, number>,
): TokenDelta & { inputSide: number; total: number } {
  const total = Number(record.provider_total_tokens ?? record.computed_total_tokens ?? 0);
  const currentInput = inputSide(record, total);
  const source = String(record.query_source);
  const incremental =
    source === "main_turn" || source === "subagent" || source === "workflow_child";
  const delta = emptyCounters();
  let consumedInput = currentInput;
  if (incremental) {
    consumedInput = Math.max(0, currentInput - (baselines[source] ?? 0));
    baselines[source] = currentInput;
  } else {
    delta.cacheCreationTokens = Number(record.cache_creation_input_tokens ?? 0);
    delta.cacheReadTokens = Number(record.cache_read_input_tokens ?? 0);
  }
  delta.inputTokens = consumedInput;
  delta.outputTokens = Number(record.output_tokens ?? 0);
  delta.reasoningTokens = Number(record.reasoning_tokens ?? 0);
  return { ...delta, inputSide: currentInput, total };
}

export async function queryTaskUsage(
  database: DatabaseSync,
  request: TaskUsageQueryInput,
): Promise<TaskUsageQueryResult> {
  const records = database
    .prepare(
      `\n    SELECT query_source, status, provider_total_tokens, computed_total_tokens,\n      input_tokens, output_tokens, reasoning_tokens, cache_creation_input_tokens, cache_read_input_tokens\n    FROM model_usage WHERE session_id = ? ORDER BY started_at ASC, id ASC\n  `,
    )
    .all(request.sessionID);
  const counters = emptyCounters();
  const baselines: Record<string, number> = {};
  let totalTokens = 0;
  let modelRequestCount = 0;
  let modelErrorCount = 0;
  for (const record of records) {
    const delta = deltaOf(record, baselines);
    for (const key of TOKEN_COUNTERS) counters[key] += delta[key];
    // 总量 = 本次消耗的输入 + 该行「总数减去输入侧」（避免缓存被重复计一次）。
    totalTokens += delta.inputTokens + Math.max(0, delta.total - delta.inputSide);
    modelRequestCount += 1;
    if (record.status === "error") modelErrorCount += 1;
  }
  // 键序与契约对象一致（sessionID 在前，token 计数器按 TOKEN_COUNTERS 顺序，
  // 再是计数与基线）。测试会按此顺序断言，序列化结果也依赖它。
  return {
    sessionID: request.sessionID,
    totalTokens,
    inputTokens: counters.inputTokens,
    outputTokens: counters.outputTokens,
    reasoningTokens: counters.reasoningTokens,
    cacheCreationTokens: counters.cacheCreationTokens,
    cacheReadTokens: counters.cacheReadTokens,
    modelRequestCount,
    modelErrorCount,
    inputBaselineBySource: baselines,
  };
}
