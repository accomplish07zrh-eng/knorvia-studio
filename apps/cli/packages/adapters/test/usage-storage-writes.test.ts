// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { constants } from "node:sqlite";
import test from "node:test";
import type { MessageId, ModelUsageRecord, SessionId, TraceId } from "@knorvia/contracts";
import {
  modelInput,
  now,
  session,
  toolInput,
  turn,
  turnInput,
  usageFixture,
} from "./usage-storage-fixture.js";

test("model facts map complete fields, normalize counts and keep JSON bytes and raw time values", async (t) => {
  const f = await usageFixture(t);
  const input = modelInput({
    attemptIndex: 2.9,
    turnID: turn,
    traceID: "trace" as TraceId,
    spanID: "span",
    assistantMessageID: "assistant" as MessageId,
    parentUserMessageID: "parent" as MessageId,
    reasoningLevel: "high",
    agent: "fixture",
    mode: "build",
    taskType: "fork",
    firstTokenAt: 0,
    completedAt: now + 5,
    durationMs: -2.5,
    timeToFirstTokenMs: 1.5,
    finishReason: "stop",
    toolCallCount: -3,
    inputTokens: 4.8,
    outputTokens: 3.9,
    reasoningTokens: 2.1,
    cacheCreationInputTokens: 10,
    cacheReadInputTokens: 20,
    providerTotalTokens: -0.5,
    retryCount: NaN,
    retryable: true,
    cancelledByUser: false,
    contextExceeded: true,
    errorType: "kind",
    errorCode: "code",
    errorMessage: "message",
    rawUsage: { b: 2, a: 1 },
    providerMetadata: { z: [1], a: 2 },
  });
  const before = structuredClone(input);
  assert.equal(await f.store.recordModelUsage(input), undefined);
  assert.deepEqual(f.rows("model_usage")[0], {
    rowid: 1,
    id: input.id,
    logical_request_id: "logical",
    attempt_index: 2,
    session_id: session,
    turn_id: turn,
    trace_id: "trace",
    span_id: "span",
    assistant_message_id: "assistant",
    parent_user_message_id: "parent",
    query_source: "main_turn",
    provider_id: "fixture-provider",
    model_id: "fixture-model",
    variant: "high",
    agent: "fixture",
    mode: "build",
    task_type: "fork",
    status: "completed",
    started_at: now,
    first_token_at: 0,
    completed_at: now + 5,
    duration_ms: -2.5,
    time_to_first_token_ms: 1.5,
    finish_reason: "stop",
    tool_call_count: 0,
    input_tokens: 4,
    output_tokens: 3,
    reasoning_tokens: 2,
    cache_creation_input_tokens: 10,
    cache_read_input_tokens: 20,
    provider_total_tokens: -0.5,
    computed_total_tokens: 7,
    retry_count: 0,
    retryable: 1,
    cancelled_by_user: 0,
    context_exceeded: 1,
    error_type: "kind",
    error_code: "code",
    error_message: "message",
    raw_usage_json: '{"b":2,"a":1}',
    provider_metadata_json: '{"z":[1],"a":2}',
  });
  assert.deepEqual(input, before);
});

test("model fallback and explicit totals remain different from normalized turn counts", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(
    modelInput({
      inputTokens: Infinity,
      cacheCreationInputTokens: 3.9,
      cacheReadInputTokens: 4.2,
      outputTokens: 2.8,
      reasoningTokens: 50,
    }),
  );
  assert.equal(f.rows("model_usage")[0].computed_total_tokens, 9);
  for (const value of [0, -2.5, 1.25]) {
    await f.store.recordModelUsage(modelInput({ computedTotalTokens: value }));
    assert.equal(f.rows("model_usage")[0].computed_total_tokens, value);
  }
  const before = f.snapshot();
  await assert.rejects(
    f.store.recordModelUsage(modelInput({ computedTotalTokens: NaN })),
    /NOT NULL constraint failed/,
  );
  assert.deepEqual(f.snapshot(), before);
  await f.store.upsertTurnUsage(turnInput({ computedTotalTokens: -2.5, inputTokens: 4.9 }));
  assert.equal(f.rows("turn_usage")[0].computed_total_tokens, 0);
  assert.equal(f.rows("turn_usage")[0].input_tokens, 4);
});

test("model conflict is full replacement with stable row identity and no DELETE", async (t) => {
  const f = await usageFixture(t);
  await f.store.recordModelUsage(
    modelInput({
      status: "error",
      reasoningLevel: "high",
      inputTokens: 10,
      rawUsage: { old: true },
      retryable: true,
    }),
  );
  const rowid = f.rows("model_usage")[0].rowid;
  f.db.exec(
    "CREATE TRIGGER no_model_delete BEFORE DELETE ON model_usage BEGIN SELECT RAISE(ABORT,'unexpected delete'); END",
  );
  await f.store.recordModelUsage(modelInput({ status: "running", startedAt: now + 1 }));
  const row = f.rows("model_usage")[0];
  assert.equal(row.rowid, rowid);
  assert.equal(row.status, "running");
  assert.equal(row.started_at, now + 1);
  assert.equal(row.variant, null);
  assert.equal(row.raw_usage_json, null);
  assert.equal(row.input_tokens, 0);
  assert.equal(row.retryable, 0);
});

test("turn conflicts retain optional facts and first nonnull times but replace counters and flags", async (t) => {
  const f = await usageFixture(t);
  await f.store.upsertTurnUsage(
    turnInput({
      traceID: "trace" as TraceId,
      userMessageID: "user" as MessageId,
      firstModelStartAt: 50,
      firstTokenAt: 60,
      completedAt: 100,
      durationMs: 7,
      timeToFirstTokenMs: 8,
      modelRequestCount: 9,
      modelRetryCount: 2,
      toolCallCount: 3,
      toolErrorCount: 1,
      inputTokens: 10,
      outputTokens: 11,
      reasoningTokens: 12,
      cacheCreationInputTokens: 13,
      cacheReadInputTokens: 14,
      computedTotalTokens: 25,
      retryable: true,
      cancelledByUser: true,
      contextExceeded: true,
      errorType: "previous",
      errorCode: "old",
    }),
  );
  const rowid = f.rows("turn_usage")[0].rowid;
  await f.store.upsertTurnUsage(
    turnInput({
      status: "running",
      startedAt: now - 1,
      firstModelStartAt: 1,
      firstTokenAt: 2,
      durationMs: 0,
      errorCode: "",
    }),
  );
  const row = f.rows("turn_usage")[0];
  assert.equal(row.rowid, rowid);
  assert.equal(row.started_at, now - 1);
  assert.equal(row.status, "running");
  assert.equal(row.trace_id, "trace");
  assert.equal(row.user_message_id, "user");
  assert.equal(row.first_model_start_at, 50);
  assert.equal(row.first_token_at, 60);
  assert.equal(row.completed_at, 100);
  assert.equal(row.duration_ms, 0);
  assert.equal(row.time_to_first_token_ms, 8);
  assert.equal(row.error_type, "previous");
  assert.equal(row.error_code, "");
  for (const field of [
    "model_request_count",
    "model_retry_count",
    "tool_call_count",
    "tool_error_count",
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "computed_total_tokens",
    "retryable",
    "cancelled_by_user",
    "context_exceeded",
  ])
    assert.equal(row[field], 0, field);
});

test("tool event updates preserve monotonic output, first output, terminal state and known identity", async (t) => {
  const f = await usageFixture(t);
  await f.store.upsertToolUsage(
    toolInput({
      turnID: turn,
      traceID: "trace" as TraceId,
      sideEffectScope: "workspace",
      readOnly: true,
      destructive: false,
      approvalStatus: "allowed",
      firstOutputAt: 50,
      completedAt: 100,
      durationMs: 20,
      timeToFirstOutputMs: 5,
      exitCode: 2,
      outputBytes: 40,
      stdoutBytes: 30,
      stderrBytes: 10,
      truncated: true,
      retryCount: 3,
      retryable: true,
      cancelledByUser: true,
      errorType: "previous",
      errorCode: "old",
      errorMessage: "kept",
    }),
  );
  const rowid = f.rows("tool_usage")[0].rowid;
  await f.store.upsertToolUsage(
    toolInput({
      toolName: "unknown",
      status: "running",
      startedAt: now - 5,
      firstOutputAt: 1,
      durationMs: 0,
      outputBytes: 5,
      stdoutBytes: 50,
      stderrBytes: -1,
      errorCode: "",
    }),
  );
  const row = f.rows("tool_usage")[0];
  assert.equal(row.rowid, rowid);
  for (const [field, value] of Object.entries({
    tool_name: "Read",
    status: "completed",
    started_at: now - 5,
    turn_id: turn,
    trace_id: "trace",
    side_effect_scope: "workspace",
    read_only: 1,
    destructive: 0,
    approval_status: "allowed",
    first_output_at: 50,
    completed_at: 100,
    duration_ms: 0,
    time_to_first_output_ms: 5,
    exit_code: 2,
    output_bytes: 40,
    stdout_bytes: 50,
    stderr_bytes: 10,
    truncated: 1,
    retry_count: 0,
    retryable: 0,
    cancelled_by_user: 0,
    error_type: "previous",
    error_code: "",
    error_message: "kept",
  }))
    assert.equal(row[field], value, field);
  await f.store.upsertToolUsage(
    toolInput({ toolName: "", status: "error", readOnly: false, destructive: true }),
  );
  assert.equal(f.rows("tool_usage")[0].tool_name, "");
  assert.equal(f.rows("tool_usage")[0].status, "error");
  assert.equal(f.rows("tool_usage")[0].read_only, 0);
  assert.equal(f.rows("tool_usage")[0].destructive, 1);
});

test("native FK, status and secondary tool uniqueness failures do not trigger retention", async (t) => {
  const f = await usageFixture(t);
  await f.store.upsertToolUsage(toolInput());
  f.seedExpired();
  const before = f.snapshot();
  const forbidden = () => {
    throw new Error("No cutoff clock after failed upsert");
  };
  t.mock.method(Date, "now", forbidden);
  await assert.rejects(
    f.store.recordModelUsage(modelInput({ sessionID: "missing" as SessionId })),
    /FOREIGN KEY constraint failed/,
  );
  await assert.rejects(
    f.store.recordModelUsage(modelInput({ status: "invalid" as ModelUsageRecord["status"] })),
    /CHECK constraint failed/,
  );
  await assert.rejects(
    f.store.upsertToolUsage(toolInput({ id: "other-id" })),
    /UNIQUE constraint failed/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("model JSON projection errors preserve raw-before-metadata priority before transaction control", async (t) => {
  const f = await usageFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  const seen: string[] = [];
  const rawFailure = new Error("raw projection failure");
  t.mock.method(f.db, "exec", () => {
    throw new Error("Projection failure must precede BEGIN");
  });
  await assert.rejects(
    f.store.recordModelUsage(
      modelInput({
        rawUsage: {
          toJSON() {
            seen.push("raw");
            throw rawFailure;
          },
        },
        providerMetadata: {
          toJSON() {
            seen.push("metadata");
            return {};
          },
        },
      }),
    ),
    (error) => error === rawFailure,
  );
  assert.deepEqual(seen, ["raw"]);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  await assert.rejects(
    f.store.recordModelUsage(modelInput({ providerMetadata: cyclic })),
    TypeError,
  );
  assert.equal(f.db.isTransaction, true);
  assert.equal(f.rows("model_usage").length, 0);
});

test("native statement preparation denial precedes JSON projection and BEGIN", async (t) => {
  const f = await usageFixture(t);
  let projections = 0;
  t.mock.method(f.db, "exec", () => {
    throw new Error("Prepare failure must precede BEGIN");
  });
  f.db.setAuthorizer((action, table) =>
    action === constants.SQLITE_INSERT && table === "model_usage"
      ? constants.SQLITE_DENY
      : constants.SQLITE_OK,
  );
  await assert.rejects(
    f.store.recordModelUsage(
      modelInput({
        rawUsage: {
          toJSON() {
            projections++;
            return {};
          },
        },
      }),
    ),
    /not authorized/,
  );
  f.db.setAuthorizer(null);
  assert.equal(projections, 0);
  assert.equal(f.db.isTransaction, false);
});
