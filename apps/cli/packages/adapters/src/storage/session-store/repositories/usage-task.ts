// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { TaskUsageQueryInput, TaskUsageQueryResult } from "@knorvia/contracts";
import { usageCount } from "./usage-values.js";

type UsageRow = Record<string, unknown>;

function inputSide(row: UsageRow, total: number): number {
  const input = usageCount(row.input_tokens);
  const cache =
    usageCount(row.cache_creation_input_tokens) + usageCount(row.cache_read_input_tokens);
  if (input === 0) return cache;
  if (cache === 0) return input;
  const preferred = usageCount(total);
  if (preferred === 0) return input;
  const output = usageCount(row.output_tokens);
  const includedDistance = Math.abs(preferred - (input + output));
  const excludedDistance = Math.abs(preferred - (input + cache + output));
  return excludedDistance < includedDistance ? input + cache : input;
}

export async function queryTaskUsage(
  db: DatabaseSync,
  input: TaskUsageQueryInput,
): Promise<TaskUsageQueryResult> {
  const rows = db
    .prepare(`
    SELECT query_source, status, provider_total_tokens, computed_total_tokens,
      input_tokens, output_tokens, reasoning_tokens, cache_creation_input_tokens, cache_read_input_tokens
    FROM model_usage WHERE session_id = ? ORDER BY started_at ASC, id ASC
  `)
    .all(input.sessionID);
  const result: TaskUsageQueryResult = {
    sessionID: input.sessionID,
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
  for (const row of rows) {
    const total = Number(row.provider_total_tokens ?? row.computed_total_tokens ?? 0);
    const currentInput = inputSide(row, total);
    const source = row.query_source;
    const incremental =
      source === "main_turn" || source === "subagent" || source === "workflow_child";
    let consumedInput = currentInput;
    if (incremental) {
      consumedInput = Math.max(0, currentInput - (result.inputBaselineBySource[source] ?? 0));
      result.inputBaselineBySource[source] = currentInput;
    } else {
      result.cacheCreationTokens += Number(row.cache_creation_input_tokens ?? 0);
      result.cacheReadTokens += Number(row.cache_read_input_tokens ?? 0);
    }
    result.totalTokens += consumedInput + Math.max(0, total - currentInput);
    result.inputTokens += consumedInput;
    result.outputTokens += Number(row.output_tokens ?? 0);
    result.reasoningTokens += Number(row.reasoning_tokens ?? 0);
    result.modelRequestCount += 1;
    if (row.status === "error") result.modelErrorCount += 1;
  }
  return result;
}
