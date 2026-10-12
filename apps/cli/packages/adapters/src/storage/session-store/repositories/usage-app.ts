// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { AppUsageDayRow, AppUsageQueryInput, AppUsageQueryResult } from "@knorvia/contracts";

type Aggregate = Record<string, unknown>;
const WINDOW = "started_at >= ? AND started_at <= ?";
const DAY = "CAST((started_at + ?) / 86400000 AS INTEGER)";

function number(value: unknown): number {
  return Number(value ?? 0);
}

function average(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function readOne(db: DatabaseSync, sql: string, ...bindings: SQLInputValue[]): Aggregate {
  return db.prepare(sql).get(...bindings) ?? {};
}

function readMany(db: DatabaseSync, sql: string, ...bindings: SQLInputValue[]): Aggregate[] {
  return db.prepare(sql).all(...bindings);
}

function mergeDays(
  days: Map<number, AppUsageDayRow>,
  rows: Aggregate[],
  field: "totalTokens" | "turnCount" | "toolCallCount",
): void {
  for (const row of rows) {
    // SQLite 的 NULL 日分组键属于既有运行时结果；公开 number 声明保持不变。
    const dayIndex = row.dayIndex as number;
    const day = days.get(dayIndex) ?? { dayIndex, totalTokens: 0, turnCount: 0, toolCallCount: 0 };
    day[field] = number(row[field]);
    days.set(dayIndex, day);
  }
}

export async function queryAppUsage(
  db: DatabaseSync,
  input: AppUsageQueryInput,
): Promise<AppUsageQueryResult> {
  const window: SQLInputValue[] = [input.since, input.until];
  const dayWindow: SQLInputValue[] = [input.tzOffsetMs, input.since, input.until];
  const totals = readOne(
    db,
    `\n    SELECT SUM(computed_total_tokens) AS totalTokens, SUM(input_tokens) AS inputTokens,\n      SUM(output_tokens) AS outputTokens, SUM(reasoning_tokens) AS reasoningTokens,\n      SUM(cache_creation_input_tokens) AS cacheCreationTokens, SUM(cache_read_input_tokens) AS cacheReadTokens,\n      COUNT(*) AS modelRequestCount, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS modelErrorCount,\n      AVG(time_to_first_token_ms) AS avgTimeToFirstTokenMs\n    FROM model_usage WHERE ${WINDOW}\n  `,
    ...window,
  );
  const turns = readOne(
    db,
    `\n    SELECT COUNT(DISTINCT session_id) AS totalSessions, COUNT(*) AS totalTurns,\n      AVG(CASE WHEN status = 'completed' THEN duration_ms END) AS avgTurnDurationMs\n    FROM turn_usage WHERE ${WINDOW}\n  `,
    ...window,
  );
  const longest = readOne(
    db,
    `\n    SELECT MAX(sessionDuration) AS longestSessionMs FROM (\n      SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN duration_ms ELSE 0 END), 0) AS sessionDuration\n      FROM turn_usage WHERE ${WINDOW} GROUP BY session_id\n    )\n  `,
    ...window,
  );
  const toolTotals = readOne(
    db,
    `\n    SELECT COUNT(*) AS toolCallCount, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS toolErrorCount\n    FROM tool_usage WHERE ${WINDOW}\n  `,
    ...window,
  );
  const models = readMany(
    db,
    `\n    SELECT model_id AS modelId, COALESCE(SUM(computed_total_tokens), 0) AS totalTokens,\n      SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens, COUNT(*) AS requestCount\n    FROM model_usage WHERE ${WINDOW} GROUP BY model_id ORDER BY totalTokens DESC\n  `,
    ...window,
  );
  const tools = readMany(
    db,
    `\n    SELECT tool_name AS toolName, COUNT(*) AS callCount,\n      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount, AVG(duration_ms) AS avgDurationMs\n    FROM tool_usage WHERE ${WINDOW} GROUP BY tool_name ORDER BY callCount DESC\n  `,
    ...window,
  );
  const modelDays = readMany(
    db,
    `\n    SELECT ${DAY} AS dayIndex, SUM(computed_total_tokens) AS totalTokens\n    FROM model_usage WHERE ${WINDOW} GROUP BY dayIndex\n  `,
    ...dayWindow,
  );
  const turnDays = readMany(
    db,
    `\n    SELECT ${DAY} AS dayIndex, COUNT(*) AS turnCount\n    FROM turn_usage WHERE ${WINDOW} GROUP BY dayIndex\n  `,
    ...dayWindow,
  );
  const toolDays = readMany(
    db,
    `\n    SELECT ${DAY} AS dayIndex, COUNT(*) AS toolCallCount\n    FROM tool_usage WHERE ${WINDOW} GROUP BY dayIndex\n  `,
    ...dayWindow,
  );
  const dayModels = readMany(
    db,
    `\n    SELECT ${DAY} AS dayIndex, model_id AS modelId, SUM(computed_total_tokens) AS totalTokens\n    FROM model_usage WHERE ${WINDOW} GROUP BY dayIndex, model_id\n  `,
    ...dayWindow,
  );
  const days = new Map<number, AppUsageDayRow>();
  mergeDays(days, modelDays, "totalTokens");
  mergeDays(days, turnDays, "turnCount");
  mergeDays(days, toolDays, "toolCallCount");
  return {
    totals: {
      totalTokens: number(totals.totalTokens),
      inputTokens: number(totals.inputTokens),
      outputTokens: number(totals.outputTokens),
      reasoningTokens: number(totals.reasoningTokens),
      cacheCreationTokens: number(totals.cacheCreationTokens),
      cacheReadTokens: number(totals.cacheReadTokens),
      modelRequestCount: number(totals.modelRequestCount),
      modelErrorCount: number(totals.modelErrorCount),
      avgTimeToFirstTokenMs: average(totals.avgTimeToFirstTokenMs),
    },
    turnTotals: {
      totalSessions: number(turns.totalSessions),
      totalTurns: number(turns.totalTurns),
      avgTurnDurationMs: average(turns.avgTurnDurationMs),
      longestSessionMs: number(longest.longestSessionMs),
    },
    toolTotals: {
      toolCallCount: number(toolTotals.toolCallCount),
      toolErrorCount: number(toolTotals.toolErrorCount),
    },
    models: models.map((row) => ({
      modelId: row.modelId == null ? null : String(row.modelId),
      totalTokens: number(row.totalTokens),
      inputTokens: number(row.inputTokens),
      outputTokens: number(row.outputTokens),
      requestCount: number(row.requestCount),
    })),
    tools: tools.map((row) => ({
      toolName: String(row.toolName),
      callCount: number(row.callCount),
      errorCount: number(row.errorCount),
      avgDurationMs: average(row.avgDurationMs),
    })),
    days: [...days.values()].sort((left, right) => left.dayIndex - right.dayIndex),
    dayModels: dayModels.map((row) => ({
      dayIndex: number(row.dayIndex),
      modelId: row.modelId == null ? null : String(row.modelId),
      totalTokens: number(row.totalTokens),
    })),
  };
}
