// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import { TARGET_MODULES } from "../harness/constants.js";
import type { TargetModuleName } from "../harness/constants.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

const expectedExports: Readonly<Record<TargetModuleName, readonly string[]>> = {
  "anthropic-reasoning-metadata": ["providerOptionsForReasoningBlock"],
  "anthropic-request-metadata": [
    "redactAnthropicRequestMetadata",
    "resolveAnthropicRequestMetadataUserId",
  ],
  "anthropic-stream-compat": ["createAnthropicCompatFetch"],
  "empty-completion-retry": ["canRetryEmptyCompletion", "scheduleEmptyCompletionRetry"],
  errors: [
    "AiSdkModelAdapterError",
    "ModelErrorSource",
    "createLocalProviderConfigurationErrorContext",
  ],
  "failure-ai-sdk-provider-error": ["readMappedAiSdkProviderBusinessError"],
  "failure-classifier": [
    "classifyModelFailure",
    "findProviderBusinessError",
    "inspectProviderFailure",
  ],
  "failure-inspection": ["getStatusCode", "parseRetryAfterMs", "unwrapRetryError"],
  "failure-provider-business-codes": ["getProviderBusinessCodeMapping"],
  "failure-tls": ["isTlsFailure", "normalizeModelTlsFailure"],
  index: ["AiSdkModelAdapter", "createModel", "toAiSdkMessages", "toAiSdkTools"],
  "media-transform-policy": ["dataUrlToDataContent", "unsupportedInputMediaText"],
  "model-execution": [
    "AiSdkModelExecution",
    "ProviderBusinessError",
    "createProviderBusinessErrorFetch",
  ],
  "model-option-map-fetch": ["createModelOptionMapFetch"],
  "model-request-headers": ["mergeModelRequestHeaders"],
  model: ["createModel"],
  "offpeak-retry": ["OFF_PEAK_TICKET_EXPIRED_MARKER", "resolveOffPeakFailureDecision"],
  "openai-responses-json-compat": ["createOpenAIResponsesJsonCompatFetch"],
  "opencode-session": ["isOpenCodeGoBaseUrl"],
  "provider-finish-business-error": ["detectProviderBusinessFinishError"],
  "reasoning-history-normalization": [
    "normalizeReasoningHistory",
    "repairReasoningHistoryAfterSignatureRejection",
  ],
  "request-admission": ["admitAttempt"],
  "retry-budget": ["UNBOUNDED_RETRY_MAX_ATTEMPTS", "retryBudgetAllows"],
  "retry-policy": ["resolveAiSdkModelRetryOptions"],
  "runner-attribution": ["createModelRequestAttributionHeaders", "resolveModelRequestSessionType"],
  "runner-debug-redaction": ["sanitizeModelIODebugRecord"],
  "runner-debug": ["recordGenerateTextDebug", "recordStreamTextDebug", "shouldRecordModelIO"],
  "runner-diagnostics": ["createStreamDiagnostics", "isZeroOutputModelCompletion"],
  "runner-generate": ["runGenerateText"],
  "runner-network-headers": ["sanitizeModelNetworkHeaders"],
  "runner-normalization": ["normalizeToolCalls", "normalizeUsage", "toModelStreamEvent"],
  "runner-options": ["createGenerateTextOptions", "createStreamTextOptions"],
  "runner-record": ["asRecord", "isRecord", "numberProperty", "stringProperty"],
  "runner-retry": ["TerminalStreamChunkError", "calculateRetryDelay", "sleep", "toAdapterError"],
  "runner-runtime-headers": ["RuntimeHeadersRefreshError", "resolveModelForAttempt"],
  "runner-runtime": ["defaultRuntime"],
  "runner-status": ["createStatusContext", "publishModelStatus"],
  "runner-stream": ["runStreamText"],
  "runner-telemetry": ["modelFailureStatusFields", "providerRequestIdFromHeaders"],
  runner: ["AiSdkModelAdapter", "normalizeUsage", "toModelStreamEvent"],
  "stream-idle-timeout": ["createLinkedAbortController", "readNextWithStreamIdleTimeout"],
  "stream-retry-boundary": ["isRetrySafePreludeStreamEvent"],
  "streaming-tool-call-assembler": ["StreamingToolCallAssembler"],
  "strict-tool-schema": ["isAnthropicFirstPartyModelId", "toStrictToolSchema"],
  "system-message-compat": ["normalizeOpenAiCompatibleSystemMessages"],
  "tool-call-validation": ["normalizeModelToolName"],
  "tool-input-normalization": ["normalizeModelToolInput"],
  "tool-result-media-projection": ["toToolResultMediaUserParts", "undeliverableFrameReferenceText"],
  "tool-transform": ["toAiSdkTools"],
  transform: ["toAiSdkMessages"],
  "workflow-model-failure-policy": [
    "resolveWorkflowModelFailurePolicy",
    "retryAllowedByFailurePolicy",
  ],
};

test("all 51 public modules load their real target entry and expose the frozen call faces", async (context) => {
  useSeams(context);
  assert.equal(TARGET_MODULES.length, 51);
  for (const name of TARGET_MODULES) {
    const namespace = await loadTargetModule<Record<string, unknown>>(name);
    for (const exported of expectedExports[name]) {
      assert.ok(exported in namespace, `${name} must export ${exported}`);
    }
  }
});

test("record helpers preserve object identity and only expose typed scalar properties", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-record")>("runner-record");
  const record = { count: 7, label: "visible", nested: { ok: true } };
  const array = [1];
  assert.equal(module.isRecord(record), true);
  assert.equal(module.asRecord(record), record);
  assert.equal(module.isRecord(array), true);
  assert.equal(module.asRecord(array), array);
  assert.equal(module.isRecord(null), false);
  const nonObjects: unknown[] = [null, undefined, "x", 7, true, 1n, Symbol("x"), () => "x"];
  for (const value of nonObjects) {
    const first = module.asRecord(value);
    const second = module.asRecord(value);
    assert.deepEqual(first, {});
    assert.deepEqual(second, {});
    assert.notEqual(first, second);
  }
  assert.equal(module.stringProperty(record, "label"), "visible");
  assert.equal(module.stringProperty(record, "count"), undefined);
  assert.equal(module.numberProperty(record, "count"), 7);
  assert.equal(module.stringMetadata(""), "");
  assert.equal(module.stringMetadata("   "), "   ");
  assert.equal(module.stringMetadata("  value  "), "  value  ");
  assert.equal(module.stringMetadata("value"), "value");
  const metadataNonStrings: unknown[] = [
    undefined,
    null,
    7,
    true,
    1n,
    Symbol("metadata"),
    () => "metadata",
    record,
    array,
  ];
  for (const value of metadataNonStrings) {
    assert.equal(module.stringMetadata(value), undefined);
  }
});

test("OpenCode and retry-boundary predicates use the exact observable conditions", async (context) => {
  useSeams(context);
  const openCode =
    await loadTargetModule<typeof import("@target/opencode-session")>("opencode-session");
  const boundary =
    await loadTargetModule<typeof import("@target/stream-retry-boundary")>("stream-retry-boundary");
  assert.equal(openCode.isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1"), true);
  assert.equal(openCode.isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1/other"), false);
  assert.equal(openCode.isOpenCodeGoBaseUrl("https://example.invalid/zen/go/v1"), false);
  assert.equal(boundary.isRetrySafePreludeStreamEvent({ type: "start" }), true);
  assert.equal(boundary.isRetrySafePreludeStreamEvent({ type: "text_delta", text: "" }), true);
  assert.equal(
    boundary.isRetrySafePreludeStreamEvent({ type: "text_delta", text: "visible" }),
    false,
  );
  assert.equal(
    boundary.isRetrySafePreludeStreamEvent({
      type: "tool_call",
      toolCall: { id: "call", input: {}, name: "run" },
    }),
    false,
  );
});
