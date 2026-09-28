// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ModelUsageRecord, ToolUsageRecord, TurnUsageRecord } from "@knorvia/contracts";
import { encodeJson } from "../json.js";
import { withWriteTransaction } from "./write-transaction.js";
import { usageCount } from "./usage-values.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MODEL_WRITE = `
  INSERT INTO model_usage (
    id, logical_request_id, attempt_index, session_id,
    turn_id, trace_id, span_id, assistant_message_id, parent_user_message_id,
    query_source, provider_id, model_id, variant, agent, mode, task_type,
    status, started_at, first_token_at, completed_at, duration_ms, time_to_first_token_ms,
    finish_reason, tool_call_count, input_tokens, output_tokens, reasoning_tokens,
    cache_creation_input_tokens, cache_read_input_tokens, provider_total_tokens, computed_total_tokens,
    retry_count, retryable, cancelled_by_user, context_exceeded,
    error_type, error_code, error_message, raw_usage_json, provider_metadata_json
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?
  ) ON CONFLICT(id) DO UPDATE SET
    logical_request_id = excluded.logical_request_id, attempt_index = excluded.attempt_index,
    session_id = excluded.session_id, turn_id = excluded.turn_id, trace_id = excluded.trace_id,
    span_id = excluded.span_id, assistant_message_id = excluded.assistant_message_id,
    parent_user_message_id = excluded.parent_user_message_id,
    query_source = excluded.query_source, provider_id = excluded.provider_id, model_id = excluded.model_id,
    variant = excluded.variant, agent = excluded.agent, mode = excluded.mode, task_type = excluded.task_type,
    status = excluded.status, started_at = excluded.started_at, first_token_at = excluded.first_token_at,
    completed_at = excluded.completed_at, duration_ms = excluded.duration_ms,
    time_to_first_token_ms = excluded.time_to_first_token_ms, finish_reason = excluded.finish_reason,
    tool_call_count = excluded.tool_call_count, input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens, reasoning_tokens = excluded.reasoning_tokens,
    cache_creation_input_tokens = excluded.cache_creation_input_tokens,
    cache_read_input_tokens = excluded.cache_read_input_tokens, provider_total_tokens = excluded.provider_total_tokens,
    computed_total_tokens = excluded.computed_total_tokens, retry_count = excluded.retry_count,
    retryable = excluded.retryable, cancelled_by_user = excluded.cancelled_by_user,
    context_exceeded = excluded.context_exceeded, error_type = excluded.error_type,
    error_code = excluded.error_code, error_message = excluded.error_message,
    raw_usage_json = excluded.raw_usage_json, provider_metadata_json = excluded.provider_metadata_json
`;
const TURN_WRITE = `
  INSERT INTO turn_usage (
    session_id, turn_id, trace_id, user_message_id, status, started_at,
    first_model_start_at, first_token_at, completed_at, duration_ms, time_to_first_token_ms,
    model_request_count, model_retry_count, tool_call_count, tool_error_count,
    input_tokens, output_tokens, reasoning_tokens, cache_creation_input_tokens, cache_read_input_tokens,
    computed_total_tokens, retryable, cancelled_by_user, context_exceeded, error_type, error_code
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  ) ON CONFLICT(session_id, turn_id) DO UPDATE SET
    trace_id = COALESCE(excluded.trace_id, turn_usage.trace_id),
    user_message_id = COALESCE(excluded.user_message_id, turn_usage.user_message_id),
    status = excluded.status, started_at = MIN(turn_usage.started_at, excluded.started_at),
    first_model_start_at = COALESCE(turn_usage.first_model_start_at, excluded.first_model_start_at),
    first_token_at = COALESCE(turn_usage.first_token_at, excluded.first_token_at),
    completed_at = COALESCE(excluded.completed_at, turn_usage.completed_at),
    duration_ms = COALESCE(excluded.duration_ms, turn_usage.duration_ms),
    time_to_first_token_ms = COALESCE(excluded.time_to_first_token_ms, turn_usage.time_to_first_token_ms),
    model_request_count = excluded.model_request_count, model_retry_count = excluded.model_retry_count,
    tool_call_count = excluded.tool_call_count, tool_error_count = excluded.tool_error_count,
    input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
    reasoning_tokens = excluded.reasoning_tokens, cache_creation_input_tokens = excluded.cache_creation_input_tokens,
    cache_read_input_tokens = excluded.cache_read_input_tokens, computed_total_tokens = excluded.computed_total_tokens,
    retryable = excluded.retryable, cancelled_by_user = excluded.cancelled_by_user,
    context_exceeded = excluded.context_exceeded,
    error_type = COALESCE(excluded.error_type, turn_usage.error_type),
    error_code = COALESCE(excluded.error_code, turn_usage.error_code)
`;
const TOOL_WRITE = `
  INSERT INTO tool_usage (
    id, session_id, turn_id, trace_id, tool_call_id, tool_name,
    side_effect_scope, read_only, destructive, approval_status, status, started_at,
    first_output_at, completed_at, duration_ms, time_to_first_output_ms, exit_code,
    output_bytes, stdout_bytes, stderr_bytes, truncated, retry_count, retryable, cancelled_by_user,
    error_type, error_code, error_message
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?
  ) ON CONFLICT(id) DO UPDATE SET
    session_id = excluded.session_id, tool_call_id = excluded.tool_call_id,
    turn_id = COALESCE(excluded.turn_id, tool_usage.turn_id),
    trace_id = COALESCE(excluded.trace_id, tool_usage.trace_id),
    tool_name = CASE WHEN excluded.tool_name = 'unknown' THEN tool_usage.tool_name ELSE excluded.tool_name END,
    side_effect_scope = COALESCE(excluded.side_effect_scope, tool_usage.side_effect_scope),
    read_only = COALESCE(excluded.read_only, tool_usage.read_only),
    destructive = COALESCE(excluded.destructive, tool_usage.destructive),
    approval_status = COALESCE(excluded.approval_status, tool_usage.approval_status),
    status = CASE WHEN excluded.status = 'running' AND tool_usage.status IN ('completed', 'error', 'cancelled')
      THEN tool_usage.status ELSE excluded.status END,
    started_at = MIN(tool_usage.started_at, excluded.started_at),
    first_output_at = COALESCE(tool_usage.first_output_at, excluded.first_output_at),
    completed_at = COALESCE(excluded.completed_at, tool_usage.completed_at),
    duration_ms = COALESCE(excluded.duration_ms, tool_usage.duration_ms),
    time_to_first_output_ms = COALESCE(excluded.time_to_first_output_ms, tool_usage.time_to_first_output_ms),
    exit_code = COALESCE(excluded.exit_code, tool_usage.exit_code),
    output_bytes = MAX(tool_usage.output_bytes, excluded.output_bytes),
    stdout_bytes = MAX(tool_usage.stdout_bytes, excluded.stdout_bytes),
    stderr_bytes = MAX(tool_usage.stderr_bytes, excluded.stderr_bytes),
    truncated = MAX(tool_usage.truncated, excluded.truncated), retry_count = excluded.retry_count,
    retryable = excluded.retryable, cancelled_by_user = excluded.cancelled_by_user,
    error_type = COALESCE(excluded.error_type, tool_usage.error_type),
    error_code = COALESCE(excluded.error_code, tool_usage.error_code),
    error_message = COALESCE(excluded.error_message, tool_usage.error_message)
`;

function retainUsage(db: DatabaseSync, cutoff: number): void {
  for (const table of ["model_usage", "turn_usage", "tool_usage"]) {
    db.prepare(`DELETE FROM ${table} WHERE started_at < ?`).run(cutoff);
  }
}

export async function recordModelUsage(db: DatabaseSync, input: ModelUsageRecord): Promise<void> {
  const inputCount = usageCount(input.inputTokens);
  const computedTotal =
    input.computedTotalTokens ??
    (inputCount > 0
      ? inputCount
      : usageCount(input.cacheCreationInputTokens) + usageCount(input.cacheReadInputTokens)) +
      usageCount(input.outputTokens);
  const statement = db.prepare(MODEL_WRITE);
  const values: SQLInputValue[] = [
    input.id,
    input.logicalRequestId,
    usageCount(input.attemptIndex),
    input.sessionID,
    input.turnID ?? null,
    input.traceID ?? null,
    input.spanID ?? null,
    input.assistantMessageID ?? null,
    input.parentUserMessageID ?? null,
    input.querySource,
    input.providerId,
    input.modelId,
    input.reasoningLevel ?? null,
    input.agent ?? null,
    input.mode ?? null,
    input.taskType ?? null,
    input.status,
    input.startedAt,
    input.firstTokenAt ?? null,
    input.completedAt ?? null,
    input.durationMs ?? null,
    input.timeToFirstTokenMs ?? null,
    input.finishReason ?? null,
    usageCount(input.toolCallCount),
    usageCount(input.inputTokens),
    usageCount(input.outputTokens),
    usageCount(input.reasoningTokens),
    usageCount(input.cacheCreationInputTokens),
    usageCount(input.cacheReadInputTokens),
    input.providerTotalTokens ?? null,
    computedTotal,
    usageCount(input.retryCount),
    input.retryable ? 1 : 0,
    input.cancelledByUser ? 1 : 0,
    input.contextExceeded ? 1 : 0,
    input.errorType ?? null,
    input.errorCode ?? null,
    input.errorMessage ?? null,
    encodeJson(input.rawUsage),
    encodeJson(input.providerMetadata),
  ];
  // 语句准备和 JSON 投影先于 BEGIN，保留预写首因；写入与裁剪必须整体提交。
  // 既有自有事务边界负责自动回滚及清理双失败，不得再调用公开 prune 开第二个事务。
  withWriteTransaction(db, "own", () => {
    statement.run(...values);
    retainUsage(db, Date.now() - RETENTION_MS);
  });
}

export async function upsertTurnUsage(db: DatabaseSync, input: TurnUsageRecord): Promise<void> {
  const statement = db.prepare(TURN_WRITE);
  const values: SQLInputValue[] = [
    input.sessionID,
    input.turnID,
    input.traceID ?? null,
    input.userMessageID ?? null,
    input.status,
    input.startedAt,
    input.firstModelStartAt ?? null,
    input.firstTokenAt ?? null,
    input.completedAt ?? null,
    input.durationMs ?? null,
    input.timeToFirstTokenMs ?? null,
    usageCount(input.modelRequestCount),
    usageCount(input.modelRetryCount),
    usageCount(input.toolCallCount),
    usageCount(input.toolErrorCount),
    usageCount(input.inputTokens),
    usageCount(input.outputTokens),
    usageCount(input.reasoningTokens),
    usageCount(input.cacheCreationInputTokens),
    usageCount(input.cacheReadInputTokens),
    usageCount(input.computedTotalTokens),
    input.retryable ? 1 : 0,
    input.cancelledByUser ? 1 : 0,
    input.contextExceeded ? 1 : 0,
    input.errorType ?? null,
    input.errorCode ?? null,
  ];
  withWriteTransaction(db, "own", () => {
    statement.run(...values);
    retainUsage(db, Date.now() - RETENTION_MS);
  });
}

export async function upsertToolUsage(db: DatabaseSync, input: ToolUsageRecord): Promise<void> {
  const statement = db.prepare(TOOL_WRITE);
  const values: SQLInputValue[] = [
    input.id,
    input.sessionID,
    input.turnID ?? null,
    input.traceID ?? null,
    input.toolCallID,
    input.toolName,
    input.sideEffectScope ?? null,
    input.readOnly === undefined ? null : input.readOnly ? 1 : 0,
    input.destructive === undefined ? null : input.destructive ? 1 : 0,
    input.approvalStatus ?? null,
    input.status,
    input.startedAt,
    input.firstOutputAt ?? null,
    input.completedAt ?? null,
    input.durationMs ?? null,
    input.timeToFirstOutputMs ?? null,
    input.exitCode ?? null,
    usageCount(input.outputBytes),
    usageCount(input.stdoutBytes),
    usageCount(input.stderrBytes),
    input.truncated ? 1 : 0,
    usageCount(input.retryCount),
    input.retryable ? 1 : 0,
    input.cancelledByUser ? 1 : 0,
    input.errorType ?? null,
    input.errorCode ?? null,
    input.errorMessage ?? null,
  ];
  withWriteTransaction(db, "own", () => {
    statement.run(...values);
    retainUsage(db, Date.now() - RETENTION_MS);
  });
}

export async function pruneUsage(
  db: DatabaseSync,
  input: { beforeTime?: number } = {},
): Promise<void> {
  const cutoff = input.beforeTime ?? Date.now() - RETENTION_MS;
  withWriteTransaction(db, "own", () => retainUsage(db, cutoff));
}
