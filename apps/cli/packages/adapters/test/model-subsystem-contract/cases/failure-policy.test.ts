// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

interface ExpectedMapping {
  readonly code: string;
  readonly reason: string;
  readonly retryReason: string;
  readonly retryable: boolean;
}

const mappings: readonly [readonly string[], ExpectedMapping][] = [
  [
    ["500", "1120", "1230", "2007"],
    mapped("model_request_failed", "server_error", "server_error", true),
  ],
  [["1234"], mapped("model_request_failed", "network_error", "network_error", true)],
  [["1312"], mapped("model_request_failed", "provider_overloaded", "provider_overloaded", true)],
  [
    ["1302", "1303", "1305", "3002", "rate_limit_reached_error", "rate_limit_error"],
    mapped("model_rate_limited", "rate_limited", "rate_limited", true),
  ],
  [
    [
      "3008",
      "3009",
      "3010",
      "1304",
      "1308",
      "1310",
      "1313",
      "insufficient_quota",
      "credit_balance_exhausted",
      "organization_spend_limit_exceeded",
      "project_spend_limit_exceeded",
      "organization_usage_limit_exceeded",
      "exceeded_current_quota_error",
      "2056",
      "20097",
      "1316",
      "1317",
      "1318",
      "1319",
      "1320",
      "1321",
    ],
    mapped("model_rate_limited", "rate_limited", "rate_limited", false),
  ],
  [
    ["engine_overloaded_error", "overloaded_error"],
    mapped("model_request_failed", "provider_overloaded", "provider_overloaded", true),
  ],
  [["1006"], mapped("provider_not_configured", "auth_failed", "auth_refresh", false)],
  [["3007"], mapped("invalid_model_request", "auth_failed", "auth_refresh", false)],
  [["3006"], mapped("model_not_found", "invalid_request", "network_error", false)],
  [["3001"], mapped("invalid_model_request", "invalid_request", "network_error", false)],
  [["1261"], mapped("model_context_exceeded", "context_exceeded", "network_error", false)],
  [["1005"], mapped("model_request_failed", "invalid_request", "network_error", false)],
  [
    ["1113", "1309", "1311", "1008", "1314", "1315"],
    mapped("model_request_failed", "unknown", "network_error", false),
  ],
];

test("the complete frozen provider business-code matrix is exact", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/failure-provider-business-codes")>(
    "failure-provider-business-codes",
  );
  for (const [codes, expected] of mappings) {
    for (const code of codes)
      assert.deepEqual(module.getProviderBusinessCodeMapping(code), expected, code);
  }
  assert.equal(module.getProviderBusinessCodeMapping("999999"), undefined);
  assert.equal(module.getProviderBusinessCodeMapping("RATE_LIMIT_ERROR"), undefined);
});

test("business-code extraction order is structured, nested, then strict BigModel prefix", async (context) => {
  useSeams(context);
  const execution =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  const classifier =
    await loadTargetModule<typeof import("@target/failure-classifier")>("failure-classifier");
  const direct = new execution.ProviderBusinessError({
    providerCode: 1302,
    providerId: "p",
    providerKind: "openai-compatible",
  });
  assert.equal(classifier.findProviderBusinessError(direct), direct);
  assert.equal(classifier.classifyModelFailure(direct).reason, "rate_limited");
  const nested = new execution.ProviderBusinessError({
    providerId: "p",
    providerKind: "openai-compatible",
    responseBodySummary: { error: { providerCode: "1312" } },
  });
  assert.equal(classifier.classifyModelFailure(nested).reason, "provider_overloaded");
  const prefixed = new execution.ProviderBusinessError({
    providerId: "p",
    providerKind: "openai-compatible",
    providerMessage: "[1302][busy] wait",
  });
  assert.equal(classifier.classifyModelFailure(prefixed).reason, "rate_limited");
  const freeText = new execution.ProviderBusinessError({
    providerId: "p",
    providerKind: "openai-compatible",
    providerMessage: "provider says code 1302 in prose",
  });
  assert.equal(classifier.classifyModelFailure(freeText).reason, "unknown");
});

test("failure priority covers cancel, timeout, HTTP, context, TLS, proxy, network, and unknown", async (context) => {
  const seams = useSeams(context);
  const classifier =
    await loadTargetModule<typeof import("@target/failure-classifier")>("failure-classifier");
  const idle =
    await loadTargetModule<typeof import("@target/stream-idle-timeout")>("stream-idle-timeout");
  const abort = new AbortController();
  abort.abort(new Error("stop"));
  assert.deepEqual(pick(classifier.classifyModelFailure(abort.signal.reason, abort.signal)), {
    code: "model_request_cancelled",
    reason: "cancelled",
    retryable: false,
  });
  const waiting = { next: async () => new Promise<IteratorResult<unknown>>(() => undefined) };
  const controller = new AbortController();
  const pending = idle.readNextWithStreamIdleTimeout(waiting, {
    abortController: controller,
    timeoutMs: 10,
  });
  await seams.clock.advanceBy(10);
  const idleError = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  assert.deepEqual(pick(classifier.classifyModelFailure(idleError)), {
    code: "model_request_timeout",
    reason: "stream_idle_timeout",
    retryable: true,
  });
  assert.equal(classifier.classifyModelFailure({ code: "ETIMEDOUT" }).reason, "timeout");
  assert.equal(classifier.classifyModelFailure({ statusCode: 429 }).reason, "rate_limited");
  assert.equal(classifier.classifyModelFailure({ statusCode: 529 }).reason, "provider_overloaded");
  assert.equal(classifier.classifyModelFailure({ statusCode: 401 }).reason, "auth_failed");
  assert.equal(
    classifier.classifyModelFailure({
      message:
        "This model's maximum context length is 8192 tokens, but the request resulted in 9000 tokens.",
      statusCode: 400,
    }).reason,
    "context_exceeded",
  );
  assert.equal(classifier.classifyModelFailure({ statusCode: 422 }).reason, "invalid_request");
  assert.equal(classifier.classifyModelFailure({ statusCode: 503 }).reason, "server_error");
  assert.equal(classifier.classifyModelFailure({ code: "CERT_HAS_EXPIRED" }).reason, "tls_error");
  assert.equal(
    classifier.classifyModelFailure({ code: "ERR_PROXY_CONNECTION_FAILED" }).reason,
    "proxy_error",
  );
  assert.equal(classifier.classifyModelFailure({ code: "ECONNRESET" }).reason, "network_error");
  assert.equal(classifier.classifyModelFailure(new Error("opaque")).reason, "unknown");
});

test("failure inspection unwraps SDK retries and parses bounded Retry-After priority", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/failure-inspection")>("failure-inspection");
  const RetryError = seams.runtime.RetryError as new (input: {
    errors: unknown[];
    message: string;
    reason: "maxRetriesExceeded" | "errorNotRetryable" | "abort";
  }) => Error;
  const last = Object.assign(new Error("last"), { statusCode: 503 });
  assert.equal(
    module.unwrapRetryError(
      new RetryError({ errors: [last], message: "retry", reason: "maxRetriesExceeded" }),
    ),
    last,
  );
  assert.equal(module.getStatusCode(last), 503);
  assert.equal(module.parseRetryAfterMs({ "retry-after-ms": "2500", "retry-after": "9" }), 2_500);
  assert.equal(module.parseRetryAfterMs({ "retry-after": "3" }), 3_000);
  const date = new Date(seams.clock.now() + 4_000).toUTCString();
  assert.equal(module.parseRetryAfterMs({ "retry-after": date }), 4_000);
  assert.equal(module.parseRetryAfterMs({ "retry-after-ms": "-1" }), 0);
  assert.equal(module.parseRetryAfterMs({ "retry-after": "-1" }), 0);
  const pastDate = new Date(seams.clock.now() - 4_000).toUTCString();
  assert.equal(module.parseRetryAfterMs({ "retry-after": pastDate }), 0);
  assert.equal(module.parseRetryAfterMs({ "retry-after-ms": "invalid" }), undefined);
  assert.equal(
    module.parseRetryAfterMs({ "retry-after-ms": "100", "x-should-retry": "false" }),
    undefined,
  );
  assert.equal(
    module.parseRetryAfterMs({ "retry-after-ms": "100", "x-should-retry": "0" }),
    undefined,
  );
});

test("retry defaults, explicit overrides, exponential cap, and provider wait are exact", async (context) => {
  useSeams(context);
  const policy = await loadTargetModule<typeof import("@target/retry-policy")>("retry-policy");
  const retry = await loadTargetModule<typeof import("@target/runner-retry")>("runner-retry");
  assert.deepEqual(policy.resolveAiSdkModelRetryOptions(undefined, {}), {
    backoffFactor: 2,
    baseDelayMs: 2_000,
    jitter: true,
    maxAttempts: 11,
    maxDelayMs: 60_000,
  });
  const options = policy.resolveAiSdkModelRetryOptions(
    {
      backoffFactor: 3,
      baseDelayMs: 100,
      jitter: false,
      maxAttempts: 2,
      maxDelayMs: 500,
    },
    {},
  );
  assert.equal(retry.calculateRetryDelay(options, 1), 100);
  assert.equal(retry.calculateRetryDelay(options, 2), 300);
  assert.equal(retry.calculateRetryDelay(options, 3), 500);
  assert.equal(retry.calculateRetryDelay(options, 1, 120_000), 120_000);
  assert.equal(retry.calculateRetryDelay(options, 1, 300_001), 100);
});

test("bounded and unbounded budgets keep distinct failure-policy decisions", async (context) => {
  useSeams(context);
  const budget = await loadTargetModule<typeof import("@target/retry-budget")>("retry-budget");
  const workflow = await loadTargetModule<typeof import("@target/workflow-model-failure-policy")>(
    "workflow-model-failure-policy",
  );
  assert.equal(budget.UNBOUNDED_RETRY_MAX_ATTEMPTS, 0);
  assert.equal(budget.retryBudgetAllows("default", 3, 3), false);
  assert.equal(budget.retryBudgetAllows("unbounded", 10_000, 3), true);
  assert.equal(budget.retryAttemptLoopContinues("unbounded", 10_000, 3), true);
  assert.equal(budget.retryBudgetMaxAttempts("unbounded", 11), 0);
  const unknown = failure("model_request_failed", "unknown", false);
  assert.equal(workflow.retryAllowedByFailurePolicy(unknown, "default", undefined), false);
  assert.equal(workflow.retryAllowedByFailurePolicy(unknown, "unbounded", undefined), true);
  assert.deepEqual(workflow.resolveWorkflowModelFailurePolicy(unknown, undefined), {
    decision: "retry",
  });
  assert.deepEqual(
    workflow.resolveWorkflowModelFailurePolicy(
      failure("model_request_cancelled", "cancelled", false),
      undefined,
    ),
    { decision: "cancelled" },
  );
  assert.deepEqual(
    workflow.resolveWorkflowModelFailurePolicy(
      failure("model_context_exceeded", "context_exceeded", false),
      undefined,
    ),
    { decision: "context_exceeded" },
  );
  assert.deepEqual(
    workflow.resolveWorkflowModelFailurePolicy(
      failure("model_request_failed", "invalid_request", false),
      "1005",
    ),
    { decision: "stop", kind: "quota" },
  );
  assert.deepEqual(
    workflow.resolveWorkflowModelFailurePolicy(
      failure("model_rate_limited", "rate_limited", false),
      "3008",
    ),
    { decision: "retry" },
  );
});

test("off-peak and empty-completion budgets are local and independently bounded", async (context) => {
  useSeams(context);
  const execution =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  const offpeak = await loadTargetModule<typeof import("@target/offpeak-retry")>("offpeak-retry");
  const empty =
    await loadTargetModule<typeof import("@target/empty-completion-retry")>(
      "empty-completion-retry",
    );
  const queued = new execution.ProviderBusinessError({
    providerCode: 3105,
    providerId: "p",
    providerKind: "openai-compatible",
  });
  assert.deepEqual(
    offpeak.resolveOffPeakFailureDecision({
      error: queued,
      failure: { ...failure("model_rate_limited", "rate_limited", false), retryAfterMs: 700_000 },
      offPeak: true,
    }),
    { delayMs: 300_000, kind: "queued" },
  );
  assert.equal(
    offpeak.resolveOffPeakFailureDecision({
      error: queued,
      failure: failure("model_rate_limited", "rate_limited", false),
      offPeak: false,
    }),
    null,
  );
  const expired = new execution.ProviderBusinessError({
    providerCode: 3102,
    providerId: "p",
    providerKind: "openai-compatible",
  });
  assert.deepEqual(
    offpeak.resolveOffPeakFailureDecision({
      error: expired,
      failure: failure("model_request_failed", "unknown", false),
      offPeak: true,
    }),
    { kind: "ticketExpired" },
  );
  assert.match(offpeak.offPeakTicketExpiredMessage("expired"), /off-peak-ticket-expired/u);
  assert.equal(empty.canRetryEmptyCompletion({ attempt: 1, maxAttempts: 2, retryCount: 0 }), true);
  assert.equal(empty.canRetryEmptyCompletion({ attempt: 1, maxAttempts: 2, retryCount: 1 }), false);
  assert.equal(empty.canRetryEmptyCompletion({ attempt: 2, maxAttempts: 2, retryCount: 0 }), false);
  const abort = new AbortController();
  abort.abort();
  assert.equal(
    empty.canRetryEmptyCompletion({
      abortSignal: abort.signal,
      attempt: 1,
      maxAttempts: 2,
      retryCount: 0,
    }),
    false,
  );
});

test("adapter errors retain cause and reliable attribution while context enrichment is additive", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/errors")>("errors");
  const cause = new Error("root");
  const error = new module.AiSdkModelAdapterError("model_request_failed", "safe", {
    cause,
    context: { reason: "network_error", source: "network" },
  });
  const returned = error.enrichContext({ attempt: 2, reason: "unknown" });
  assert.equal(returned, error);
  assert.equal(error.cause, cause);
  assert.equal(error.context?.source, "network");
  assert.equal(error.context?.reason, "network_error");
  assert.equal(error.context?.attempt, 2);
  assert.deepEqual(module.createLocalProviderConfigurationErrorContext({ providerId: "p" }), {
    providerId: "p",
    reason: "provider_not_configured",
    retryable: false,
    source: "runtime",
  });
});

function mapped(
  code: string,
  reason: string,
  retryReason: string,
  retryable: boolean,
): ExpectedMapping {
  return { code, reason, retryReason, retryable };
}

function pick(value: {
  code: string;
  reason: string;
  retryable: boolean;
}): Record<string, unknown> {
  return { code: value.code, reason: value.reason, retryable: value.retryable };
}

function failure(
  code: string,
  reason: string,
  retryable: boolean,
): import("@target/failure-classifier").ClassifiedModelFailure {
  return {
    code,
    message: "failure",
    reason,
    retryReason: "network_error",
    retryable,
  } as import("@target/failure-classifier").ClassifiedModelFailure;
}
