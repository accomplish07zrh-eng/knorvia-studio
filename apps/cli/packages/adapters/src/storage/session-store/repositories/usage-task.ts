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

export async function queryTaskUsage(
  database: DatabaseSync,
  request: TaskUsageQueryInput,
): Promise<TaskUsageQueryResult> {
  const records = database
    .prepare(
      `\n    SELECT query_source, status, provider_total_tokens, computed_total_tokens,\n      input_tokens, output_tokens, reasoning_tokens, cache_creation_input_tokens, cache_read_input_tokens\n    FROM model_usage WHERE session_id = ? ORDER BY started_at ASC, id ASC\n  `,
    )
    .all(request.sessionID);
  const result: TaskUsageQueryResult = {
    sessionID: request.sessionID,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    modelRequestCount: 0,
    modelErrorCount: 0,
    inputBaselineBySource: {},
  };
  for (const record of records) {
    const total = Number(record.provider_total_tokens ?? record.computed_total_tokens ?? 0);
    const currentInput = inputSide(record, total);
    const source = record.query_source;
    const incremental =
      source === "main_turn" || source === "subagent" || source === "workflow_child";
    let consumedInput = currentInput;
    if (incremental) {
      consumedInput = Math.max(0, currentInput - (result.inputBaselineBySource[source] ?? 0));
      result.inputBaselineBySource[source] = currentInput;
    } else {
      result.cacheCreationTokens += Number(record.cache_creation_input_tokens ?? 0);
      result.cacheReadTokens += Number(record.cache_read_input_tokens ?? 0);
    }
    result.totalTokens += consumedInput + Math.max(0, total - currentInput);
    result.inputTokens += consumedInput;
    result.outputTokens += Number(record.output_tokens ?? 0);
    result.reasoningTokens += Number(record.reasoning_tokens ?? 0);
    result.modelRequestCount += 1;
    if (record.status === "error") result.modelErrorCount += 1;
  }
  return result;
}
