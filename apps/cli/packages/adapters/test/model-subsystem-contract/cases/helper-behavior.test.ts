// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateResult } from "../harness/fixtures.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";
import { createLogger } from "../harness/seams.js";

test("AI SDK parsed provider errors map only exposed structured business data", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/failure-ai-sdk-provider-error")>(
    "failure-ai-sdk-provider-error",
  );
  const ApiCallError = seams.runtime.APICallError as new (input: Record<string, unknown>) => Error;
  const mapped = module.readMappedAiSdkProviderBusinessError(
    new ApiCallError({
      data: {
        error: { code: 1302, message: "busy" },
        request_id: "provider-request",
      },
      message: "api failed",
      requestBodyValues: {},
      statusCode: 429,
      url: "https://provider.invalid/v1/chat/completions",
    }),
  );
  assert.ok(mapped);
  assert.equal(mapped.providerCode, "1302");
  assert.equal(mapped.providerMessage, "busy");
  assert.equal(mapped.providerRequestId, "provider-request");
  assert.equal(
    module.readMappedAiSdkProviderBusinessError(new Error("code 1302 in prose")),
    undefined,
  );
});

test("TLS normalization preserves reliable adapter attribution and recognizes finite codes", async (context) => {
  useSeams(context);
  const tls = await loadTargetModule<typeof import("@target/failure-tls")>("failure-tls");
  const errors = await loadTargetModule<typeof import("@target/errors")>("errors");
  assert.equal(tls.isTlsFailure("CERT_HAS_EXPIRED"), true);
  assert.equal(tls.isTlsFailure("ECONNRESET"), false);
  const reliable = new errors.AiSdkModelAdapterError("model_request_failed", "safe", {
    context: { reason: "network_error", source: "network" },
  });
  assert.equal(tls.normalizeModelTlsFailure(reliable), reliable);
  const normalized = tls.normalizeModelTlsFailure(
    Object.assign(new Error("certificate expired"), { code: "CERT_HAS_EXPIRED" }),
  );
  assert.equal(Reflect.get(normalized as object, "name"), "ModelTlsValidationError");
  assert.equal(Reflect.get(normalized as object, "code"), "MODEL_TLS_VALIDATION_FAILED");
  assert.equal(
    Reflect.get(Object(Reflect.get(normalized as object, "cause")), "code"),
    "CERT_HAS_EXPIRED",
  );
});

test("diagnostics count stream facts and define empty completion from all four output channels", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-diagnostics")>("runner-diagnostics");
  assert.equal(
    module.isZeroOutputModelCompletion({ reasoningLength: 0, textLength: 0, toolCallCount: 0 }),
    true,
  );
  assert.equal(
    module.isZeroOutputModelCompletion({ reasoningLength: 0, textLength: 1, toolCallCount: 0 }),
    false,
  );
  assert.equal(
    module.isZeroOutputModelCompletion({ reasoningLength: 0, textLength: 0, toolCallCount: 1 }),
    false,
  );
  assert.equal(
    module.isZeroOutputModelCompletion({
      reasoningLength: 0,
      textLength: 0,
      toolCallCount: 0,
      usage: { inputTokens: 1 },
    }),
    false,
  );
  const diagnostics = module.createStreamDiagnostics();
  module.recordStreamChunkDiagnostic(diagnostics, { id: "t", text: "abc", type: "text-delta" });
  module.recordStreamChunkDiagnostic(diagnostics, { error: new Error("bad"), type: "error" });
  module.recordStreamChunkDiagnostic(diagnostics, {
    finishReason: "stop",
    totalUsage: { inputTokens: 1 },
    type: "finish",
  });
  assert.equal(diagnostics.textDeltaChars, 3);
  assert.equal(diagnostics.errorChunkCount, 1);
  assert.equal(diagnostics.finishReason, "stop");
  assert.equal(module.isSuspiciousStreamDiagnostics(diagnostics), true);
});

test("normalization maps AI SDK usage and stream parts without inventing content", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-normalization")>("runner-normalization");
  const usage = module.normalizeUsage({
    inputTokenDetails: { cacheReadTokens: 2, cacheWriteTokens: 3, noCacheTokens: 5 },
    inputTokens: 10,
    outputTokenDetails: { reasoningTokens: 4, textTokens: 6 },
    outputTokens: 10,
    totalTokens: 20,
  });
  assert.deepEqual(usage, {
    cacheReadTokens: 2,
    cacheWriteTokens: 3,
    inputTokens: 10,
    outputTokens: 10,
    reasoningTokens: 4,
    totalTokens: 20,
  });
  assert.deepEqual(
    module.toModelStreamEvent({ id: "t", text: "delta", type: "text-delta" } as never),
    {
      id: "t",
      text: "delta",
      type: "text_delta",
    },
  );
  assert.equal(module.toModelStreamEvent({ type: "start-step" } as never), undefined);
});

test("tool input normalization degrades malformed JSON to an empty object with a warning", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/tool-input-normalization")>(
    "tool-input-normalization",
  );
  const logger = createLogger();
  assert.deepEqual(
    module.normalizeModelToolInput(undefined, { logger, source: "generateText" }),
    {},
  );
  assert.deepEqual(module.normalizeModelToolInput("", { logger, source: "generateText" }), {});
  assert.deepEqual(module.normalizeModelToolInput('{"x":1}', { logger, source: "streamText" }), {
    x: 1,
  });
  assert.deepEqual(module.normalizeModelToolInput("null", { logger, source: "streamText" }), {});
  assert.deepEqual(
    module.normalizeModelToolInput("{", { logger, source: "streamText", toolName: "run" }),
    {},
  );
  assert.ok(logger.calls.some((call) => call.name === "warn"));
});

test("empty client tool names survive only with a closable id while other invalid names fail", async (context) => {
  useSeams(context);
  const validation =
    await loadTargetModule<typeof import("@target/tool-call-validation")>("tool-call-validation");
  const normalization =
    await loadTargetModule<typeof import("@target/runner-normalization")>("runner-normalization");
  assert.equal(validation.normalizeModelToolName("run", {}), "run");
  assert.throws(() => validation.normalizeModelToolName("", {}), /tool|name|empty/iu);
  const closable = normalization.normalizeToolCalls(
    generateResult({
      toolCalls: [{ input: {}, toolCallId: "call-close", toolName: "" }],
    }) as never,
  );
  assert.equal(closable?.length, 1);
  const closableCall = closable?.[0];
  assert.ok(closableCall);
  const { providerExecuted, ...requiredClosableFields } = closableCall;
  assert.deepEqual(requiredClosableFields, { id: "call-close", input: {}, name: "" });
  assert.equal(providerExecuted, undefined);
  assert.throws(
    () =>
      normalization.normalizeToolCalls(
        generateResult({
          toolCalls: [{ input: {}, toolCallId: "", toolName: "" }],
        }) as never,
      ),
    /tool|name|response/iu,
  );
});

test("retry helpers abort sleep, retain reliable error context, and expose terminal stream cause", async (context) => {
  useSeams(context);
  const retry = await loadTargetModule<typeof import("@target/runner-retry")>("runner-retry");
  const errors = await loadTargetModule<typeof import("@target/errors")>("errors");
  const controller = new AbortController();
  const sleeping = retry.sleep(1_000, controller.signal);
  const reason = new Error("stop sleep");
  controller.abort(reason);
  await assert.rejects(sleeping, (error) => error === reason);
  const existing = new errors.AiSdkModelAdapterError("model_request_failed", "safe", {
    context: { reason: "network_error", source: "network" },
  });
  const adapter = retry.toAdapterError(
    existing,
    {
      code: "model_request_failed",
      message: "coarse",
      reason: "unknown",
      retryReason: "network_error",
      retryable: false,
    },
    statusContext(),
    2,
  );
  assert.equal(adapter, existing);
  assert.equal(adapter.context?.source, "network");
  assert.equal(adapter.context?.reason, "network_error");
  const terminal = new retry.TerminalStreamChunkError(adapter);
  assert.equal(terminal.adapterError, adapter);
});

test("telemetry keeps phase, provider identity, and exception kind from structured failures", async (context) => {
  useSeams(context);
  const telemetry =
    await loadTargetModule<typeof import("@target/runner-telemetry")>("runner-telemetry");
  const execution =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  const business = new execution.ProviderBusinessError({
    providerCode: 1302,
    providerId: "p",
    providerKind: "openai-compatible",
    providerMessage: "busy",
    providerRequestId: "provider-request",
  });
  const failure = {
    code: "model_rate_limited",
    message: "busy",
    reason: "rate_limited",
    retryReason: "rate_limited",
    retryable: true,
  } as import("@target/failure-classifier").ClassifiedModelFailure;
  assert.deepEqual(telemetry.modelFailureAttributionFields(business, failure, "response"), {
    errorPhase: "response",
    exceptionKind: "provider_business",
  });
  const statusFields = telemetry.modelFailureStatusFields(business, failure, "response");
  const { retryAfterMs, ...requiredStatusFields } = statusFields;
  assert.deepEqual(requiredStatusFields, {
    errorCode: "model_rate_limited",
    errorPhase: "response",
    exceptionType: "ProviderBusinessError",
    providerErrorCode: "1302",
    providerErrorMessage: "busy",
    providerRequestId: "provider-request",
  });
  assert.equal(retryAfterMs, undefined);
  assert.equal(
    telemetry.providerRequestIdFromHeaders({ "X-Request-ID": "header-request" }),
    "header-request",
  );
});

test("default runtime remains an AI SDK seam and never reaches a real provider", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-runtime")>("runner-runtime");
  const returned = { marker: true };
  seams.generateText = async () => returned;
  assert.equal(
    await module.defaultRuntime.generateText({ model: {} as never, prompt: "test" }),
    returned,
  );
  const stream = { marker: "stream" };
  seams.streamText = () => stream;
  assert.equal(module.defaultRuntime.streamText({ model: {} as never, prompt: "test" }), stream);
  assert.equal(seams.calls.filter((call) => call.name === "ai.generateText").length, 1);
  assert.equal(seams.calls.filter((call) => call.name === "ai.streamText").length, 1);
});

test("explicit reasoning signature rejection repairs a request copy only", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/reasoning-history-normalization")>(
    "reasoning-history-normalization",
  );
  const messages = [
    {
      content: [
        {
          providerOptions: { anthropic: { signature: "rejected-signature" } },
          text: "thought",
          type: "reasoning" as const,
        },
      ],
      role: "assistant" as const,
    },
  ];
  const repaired = module.repairReasoningHistoryAfterSignatureRejection(
    messages,
    Object.assign(new Error("invalid signature in thinking block"), { statusCode: 400 }),
  );
  assert.ok(repaired);
  assert.notEqual(repaired, messages);
  assert.match(JSON.stringify(messages), /rejected-signature/u);
  assert.doesNotMatch(JSON.stringify(repaired), /rejected-signature/u);
  assert.equal(
    module.repairReasoningHistoryAfterSignatureRejection(messages, new Error("ordinary failure")),
    undefined,
  );
});

function statusContext(): import("@target/runner-status").ModelStatusContext {
  return {
    maxAttempts: 2,
    modelCall: {
      actorKind: "main",
      logicalCallId: "logical",
      operation: "agent_step",
      reasoning: {
        capability: "unknown",
        effectiveControl: "unknown",
        effectiveState: "unknown",
        requestedControl: "unknown",
        requestedState: "unknown",
      },
    },
    modelId: "m",
    modelRequestSessionType: "main",
    providerId: "p",
    requestId: "r",
    traceId: "t",
    transport: "http",
  } as unknown as import("@target/runner-status").ModelStatusContext;
}
