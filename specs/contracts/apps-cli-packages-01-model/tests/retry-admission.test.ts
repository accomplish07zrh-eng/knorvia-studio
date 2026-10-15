// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B11–B18（重试、准入与失败裁决）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { load, loadAbsolute, repoRoot } from "./entry.mjs";

const { resolveAiSdkModelRetryOptions } = await load("model/retry-policy");
const {
  UNBOUNDED_RETRY_MAX_ATTEMPTS,
  isUnboundedRetryBudget,
  retryAttemptLoopContinues,
  retryBudgetAllows,
  retryBudgetMaxAttempts,
} = await load("model/retry-budget");
const {
  OFF_PEAK_TICKET_EXPIRED_MARKER,
  offPeakTicketExpiredMessage,
  resolveOffPeakFailureDecision,
} = await load("model/offpeak-retry");
const { canRetryEmptyCompletion, scheduleEmptyCompletionRetry } = await load(
  "model/empty-completion-retry",
);
const { admitAttempt } = await load("model/request-admission");
const {
  WORKFLOW_QUOTA_PROVIDER_CODES,
  inspectWorkflowModelFailure,
  resolveWorkflowModelFailurePolicy,
  retryAllowedByFailurePolicy,
} = await load("model/workflow-model-failure-policy");
const contracts = await loadAbsolute(`${repoRoot}/apps/cli/packages/contracts/dist/index.js`);

test("B11 重试选项解析与默认值（语义常量）", () => {
  const defaults = resolveAiSdkModelRetryOptions(undefined, {});
  assert.deepEqual(defaults, {
    maxAttempts: 11,
    baseDelayMs: 2000,
    backoffFactor: 2,
    maxDelayMs: 60000,
    jitter: true,
  });
  const fromEnv = resolveAiSdkModelRetryOptions(undefined, {
    KNORVIA_MODEL_MAX_ATTEMPTS: "4",
    KNORVIA_MODEL_RETRY_BASE_DELAY_MS: "1500",
    KNORVIA_MODEL_RETRY_BACKOFF_FACTOR: "3",
    KNORVIA_MODEL_RETRY_MAX_DELAY_MS: "9000",
    KNORVIA_MODEL_RETRY_JITTER: "0",
  });
  assert.deepEqual(fromEnv, {
    maxAttempts: 4,
    baseDelayMs: 1500,
    backoffFactor: 3,
    maxDelayMs: 9000,
    jitter: false,
  });
  const optionsWin = resolveAiSdkModelRetryOptions(
    { maxAttempts: 2, jitter: true },
    { KNORVIA_MODEL_MAX_ATTEMPTS: "9", KNORVIA_MODEL_RETRY_JITTER: "false" },
  );
  assert.equal(optionsWin.maxAttempts, 2);
  assert.equal(optionsWin.jitter, true);
  const normalized = resolveAiSdkModelRetryOptions(
    { maxAttempts: 2.9, baseDelayMs: -5, backoffFactor: 0, maxDelayMs: Number.NaN },
    { KNORVIA_MODEL_RETRY_JITTER: "yes" },
  );
  assert.equal(normalized.maxAttempts, 2);
  assert.equal(normalized.baseDelayMs, 2000);
  assert.equal(normalized.backoffFactor, 2);
  assert.equal(normalized.maxDelayMs, 60000);
  assert.equal(normalized.jitter, true);
});

test("B12 重试预算（有界 / workflow 无界）的判定", () => {
  assert.equal(UNBOUNDED_RETRY_MAX_ATTEMPTS, 0);
  assert.equal(isUnboundedRetryBudget(contracts.ModelRetryBudget.Unbounded), true);
  assert.equal(isUnboundedRetryBudget(undefined), false);
  assert.equal(retryBudgetAllows(undefined, 2, 3), true);
  assert.equal(retryBudgetAllows(undefined, 3, 3), false);
  assert.equal(retryBudgetAllows(contracts.ModelRetryBudget.Unbounded, 99, 1), true);
  assert.equal(retryAttemptLoopContinues(undefined, 3, 3), true);
  assert.equal(retryAttemptLoopContinues(undefined, 4, 3), false);
  assert.equal(retryAttemptLoopContinues(contracts.ModelRetryBudget.Unbounded, 9, 1), true);
  assert.equal(retryBudgetMaxAttempts(undefined, 7), 7);
  assert.equal(retryBudgetMaxAttempts(contracts.ModelRetryBudget.Unbounded, 7), 0);
});

test("B13 空补全重试：条件、事件与等待", async () => {
  assert.equal(canRetryEmptyCompletion({ attempt: 1, maxAttempts: 3, retryCount: 0 }), true);
  assert.equal(canRetryEmptyCompletion({ attempt: 1, maxAttempts: 3, retryCount: 1 }), false);
  assert.equal(canRetryEmptyCompletion({ attempt: 3, maxAttempts: 3, retryCount: 0 }), false);
  const controller = new AbortController();
  assert.equal(
    canRetryEmptyCompletion({
      abortSignal: controller.signal,
      attempt: 1,
      maxAttempts: 3,
      retryCount: 0,
    }),
    true,
  );
  controller.abort();
  assert.equal(
    canRetryEmptyCompletion({
      abortSignal: controller.signal,
      attempt: 1,
      maxAttempts: 3,
      retryCount: 0,
    }),
    false,
  );
  const events: unknown[] = [];
  await scheduleEmptyCompletionRetry({
    attempt: 1,
    completedAt: Date.now(),
    errorPhase: "response",
    requestHeaders: { a: "1" },
    responseHeaders: {},
    retry: { maxAttempts: 3, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1, jitter: false },
    retryBudgetAttempt: 1,
    startedAt: Date.now() - 5,
    statusContext: {
      traceId: "t",
      requestId: "r",
      providerId: "p",
      modelId: "m",
      modelRequestSessionType: "main",
      transport: "http",
      maxAttempts: 3,
      modelCall: { actorKind: "main", operation: "model" },
    } as never,
    statusSink: {
      publish: (event: unknown) => {
        events.push(event);
        return Promise.resolve();
      },
    },
  });
  assert.equal(events.length, 1);
  const event = events[0] as Record<string, unknown>;
  assert.equal(event.type, "model_retry_scheduled");
  assert.equal(event.reason, "stale_connection");
  assert.equal(event.message, "Provider returned an empty completion");
  assert.equal(event.nextAttempt, 2);
  assert.equal(event.delayMs, 1);
  assert.deepEqual(event.requestHeaders, { a: "1" });
});

test("B14 attempt 准入（admission）的排队与票据释放", async () => {
  const released: number[] = [];
  let acquireCount = 0;
  const fast = {
    tryAcquire: () => ({ release: () => released.push(1) }),
    acquire: async () => {
      throw new Error("must not acquire");
    },
  };
  const waits: string[] = [];
  const fastAdmission = await admitAttempt({
    admission: fast as never,
    model: {} as never,
    onQueued: async () => {
      waits.push("queued");
    },
    onAdmitted: async () => {
      waits.push("admitted");
    },
  });
  assert.deepEqual(waits, []);
  fastAdmission.release();
  fastAdmission.release();
  assert.deepEqual(released, [1]);
  const slow = {
    tryAcquire: () => undefined,
    acquire: async () => {
      acquireCount += 1;
      return { release: () => released.push(2) };
    },
  };
  const slowAdmission = await admitAttempt({
    admission: slow as never,
    model: {} as never,
    onQueued: async () => {
      waits.push("queued");
    },
    onAdmitted: async (queuedMs: number) => {
      waits.push(`admitted:${queuedMs >= 0}`);
    },
  });
  assert.deepEqual(waits, ["queued", "admitted:true"]);
  assert.equal(acquireCount, 1);
  slowAdmission.release();
  assert.deepEqual(released, [1, 2]);
  let plainAcquired = 0;
  const plain = {
    acquire: async () => {
      plainAcquired += 1;
      return { release: () => released.push(3) };
    },
  };
  const plainAdmission = await admitAttempt({
    admission: plain as never,
    model: {} as never,
    onQueued: async () => {
      waits.push("queued-plain");
    },
    onAdmitted: async () => {
      waits.push("admitted-plain");
    },
  });
  assert.equal(plainAcquired, 1);
  assert.deepEqual(waits, ["queued", "admitted:true"]);
  plainAdmission.release();
  assert.deepEqual(released, [1, 2, 3]);
  const none = await admitAttempt({ model: {} as never });
  none.release();
  const aborted = new AbortController();
  aborted.abort("stop-now");
  await assert.rejects(
    admitAttempt({ admission: fast as never, model: {} as never, signal: aborted.signal }),
    (error: unknown) => error === "stop-now",
  );
});

test("B15 off-peak 特例（票据过期与重新排队）", () => {
  const failure = { statusCode: 429, retryAfterMs: 5_000 } as never;
  assert.equal(resolveOffPeakFailureDecision({ offPeak: false, failure, error: null }), null);
  const expired = resolveOffPeakFailureDecision({
    offPeak: true,
    failure,
    error: {
      isProviderBusinessError: true,
      providerCode: "3102",
    },
  });
  assert.deepEqual(expired, { kind: "ticketExpired" });
  const queued = resolveOffPeakFailureDecision({
    offPeak: true,
    failure: { statusCode: 429, retryAfterMs: 5_000 } as never,
    error: null,
  });
  assert.deepEqual(queued, { kind: "queued", delayMs: 5_000 });
  const clamped = resolveOffPeakFailureDecision({
    offPeak: true,
    failure: { statusCode: 429, retryAfterMs: 900_000 } as never,
    error: null,
  });
  assert.deepEqual(clamped, { kind: "queued", delayMs: 300_000 });
  const fallback = resolveOffPeakFailureDecision({
    offPeak: true,
    failure: { statusCode: 429 } as never,
    error: null,
  });
  assert.deepEqual(fallback, { kind: "queued", delayMs: 60_000 });
  assert.equal(OFF_PEAK_TICKET_EXPIRED_MARKER, "off-peak-ticket-expired");
  assert.equal(offPeakTicketExpiredMessage("boom"), `boom [${OFF_PEAK_TICKET_EXPIRED_MARKER}]`);
});

test("B16 workflow 模型失败裁决表（语义常量）", () => {
  const quotaCodes = [
    "1005",
    "2056",
    "20097",
    "1304",
    "1308",
    "1310",
    "1313",
    "1316",
    "1317",
    "1318",
    "1319",
    "1320",
    "1321",
    "insufficient_quota",
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "exceeded_current_quota_error",
  ];
  for (const code of quotaCodes) {
    assert.equal(WORKFLOW_QUOTA_PROVIDER_CODES.has(code), true, code);
  }
  assert.equal(WORKFLOW_QUOTA_PROVIDER_CODES.size, quotaCodes.length);
  const table: Array<
    [{ code: string; reason: string; retryable: boolean }, string | undefined, unknown]
  > = [
    [{ code: "x", reason: "cancelled", retryable: false }, "1005", { decision: "cancelled" }],
    [
      { code: "x", reason: "server_error", retryable: true },
      "1005",
      { decision: "stop", kind: "quota" },
    ],
    [
      { code: "model_context_exceeded", reason: "unknown", retryable: false },
      undefined,
      { decision: "context_exceeded" },
    ],
    [
      { code: "x", reason: "context_exceeded", retryable: false },
      undefined,
      { decision: "context_exceeded" },
    ],
    [
      { code: "x", reason: "auth_failed", retryable: false },
      undefined,
      { decision: "stop", kind: "auth" },
    ],
    [
      { code: "x", reason: "provider_not_configured", retryable: false },
      undefined,
      { decision: "stop", kind: "not_configured" },
    ],
    [
      { code: "provider_not_configured", reason: "unknown", retryable: false },
      undefined,
      { decision: "stop", kind: "not_configured" },
    ],
    [
      { code: "model_not_found", reason: "unknown", retryable: false },
      undefined,
      { decision: "stop", kind: "model_unavailable" },
    ],
    [
      { code: "invalid_model_request", reason: "unknown", retryable: false },
      undefined,
      { decision: "stop", kind: "invalid_request" },
    ],
    [
      { code: "x", reason: "invalid_request", retryable: false },
      undefined,
      { decision: "stop", kind: "invalid_request" },
    ],
    [{ code: "x", reason: "server_error", retryable: true }, undefined, { decision: "retry" }],
  ];
  for (const [failure, providerCode, expected] of table) {
    assert.deepEqual(
      resolveWorkflowModelFailurePolicy(failure as never, providerCode),
      expected,
      JSON.stringify(failure),
    );
  }
});

test("B17 重试许可的双轨裁决", () => {
  const failure = {
    code: "model_request_failed",
    reason: "server_error",
    retryable: true,
  } as never;
  assert.equal(retryAllowedByFailurePolicy(failure, undefined, undefined), true);
  assert.equal(
    retryAllowedByFailurePolicy(
      { code: "x", reason: "auth_failed", retryable: true } as never,
      undefined,
      undefined,
    ),
    true,
  );
  assert.equal(
    retryAllowedByFailurePolicy(
      { code: "x", reason: "auth_failed", retryable: true } as never,
      contracts.ModelRetryBudget.Unbounded,
      undefined,
    ),
    false,
  );
  assert.equal(
    retryAllowedByFailurePolicy(
      { code: "x", reason: "server_error", retryable: false } as never,
      contracts.ModelRetryBudget.Unbounded,
      undefined,
    ),
    true,
  );
});

test("B18 workflow 侧失败检视（inspectWorkflowModelFailure）", () => {
  assert.equal(inspectWorkflowModelFailure("plain"), undefined);
  assert.equal(inspectWorkflowModelFailure({ name: "Other" }), undefined);
  const error = {
    name: "AiSdkModelAdapterError",
    message: "raw message",
    context: {
      code: "model_rate_limited",
      reason: "rate_limited",
      retryable: true,
      providerErrorCode: "1302",
      providerId: "prov",
      modelId: "model-x",
      retryAfterMs: 1_000,
    },
  };
  const inspected = inspectWorkflowModelFailure(error);
  assert.equal(inspected?.policy.decision, "retry");
  assert.equal(inspected?.reason, "rate_limited");
  assert.equal(inspected?.providerCode, "1302");
  assert.equal(inspected?.providerId, "prov");
  assert.equal(inspected?.modelId, "model-x");
  assert.equal(inspected?.rawMessage, "raw message");
  assert.ok((inspected?.resetAt ?? 0) >= Date.now() + 900);
  const viaCause = inspectWorkflowModelFailure({ cause: error });
  assert.equal(viaCause?.reason, "rate_limited");
  const minimal = inspectWorkflowModelFailure({
    name: "AiSdkModelAdapterError",
    context: {},
  });
  assert.equal(minimal?.reason, "unknown");
  assert.equal(minimal?.policy.decision, "retry");
  assert.equal(minimal?.resetAt, undefined);
});
