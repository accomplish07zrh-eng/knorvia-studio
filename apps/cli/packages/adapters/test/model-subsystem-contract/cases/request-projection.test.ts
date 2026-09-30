// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelInputMessage, ModelMessageContent, ModelToolContract } from "@knorvia/contracts";
import {
  modelProperties,
  resolvedModel,
  textMessage,
  textRequest,
  traceContext,
} from "../harness/fixtures.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

test("compatible chat merges only leading systems and never mutates canonical history", async (context) => {
  useSeams(context);
  const system =
    await loadTargetModule<typeof import("@target/system-message-compat")>("system-message-compat");
  const transform = await loadTargetModule<typeof import("@target/transform")>("transform");
  const messages: ModelInputMessage[] = [
    { cacheControl: { type: "ephemeral" }, content: "first", role: "system" },
    { content: "second", role: "system" },
    { content: "", role: "user" },
    { content: "later", role: "system" },
  ];
  const before = structuredClone(messages);
  const normalized = system.normalizeOpenAiCompatibleSystemMessages(messages);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0]?.role, "system");
  assert.match(String(normalized[0]?.content), /first/u);
  assert.match(String(normalized[0]?.content), /second/u);
  assert.equal(normalized[2]?.content, "later");
  const projected = transform.toAiSdkMessages(messages, { providerKind: "openai-compatible" });
  assert.deepEqual(messages, before);
  const user = projected.find((message) => message.role === "user");
  assert.notEqual(user?.content, "");
  assert.doesNotMatch(
    JSON.stringify(projected),
    /statusSink|modelRequestAdmission|refreshRuntimeHeaders/u,
  );
});

test("media policy accepts valid data URLs and preserves visible unsupported-media errors", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/media-transform-policy")>(
      "media-transform-policy",
    );
  assert.deepEqual(module.dataUrlToDataContent("data:image/png;base64,AAE="), {
    data: "AAE=",
    mediaType: "image/png",
  });
  assert.equal(module.dataUrlToDataContent("https://example.invalid/image.png"), undefined);
  const unsupported = module.unsupportedInputMediaText(
    { dataUrl: "data:video/mp4;base64,AA==", mediaType: "video/mp4", type: "video" },
    {
      supportsAudio: false,
      supportsImage: true,
      supportsPdf: true,
      supportsText: true,
      supportsVideo: false,
    },
  );
  assert.equal(typeof unsupported, "string");
  assert.match(unsupported ?? "", /video/iu);
});

test("option-map fetch accepts only a JSON object body and captures only the patched object", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/model-option-map-fetch")>(
      "model-option-map-fetch",
    );
  const transported: Request[] = [];
  seams.optionMapApply = (body, values) => ({ ...body, wire: values });
  const maps = {
    apply(
      body: import("@knorvia/model-option-map").JsonObject,
      values: import("@knorvia/model-option-map").ModelOptionValues,
    ) {
      return seams.optionMapApply(
        body as Record<string, unknown>,
        values as unknown as Record<string, unknown>,
      ) as import("@knorvia/model-option-map").JsonObject;
    },
  };
  const capture: import("@target/model-option-map-fetch").RawRequestBodyCapture = {};
  const fetch = module.createModelOptionMapFetch({
    capture,
    fetch: async (input, init) => {
      transported.push(input instanceof Request ? input : new Request(input, init));
      return new Response("ok", { status: 200 });
    },
    maps,
    values: { maxOutputTokens: 42, reasoningLevel: "high" },
  });
  await fetch("https://provider.invalid", { body: JSON.stringify({ model: "m" }), method: "POST" });
  assert.deepEqual(capture.body, {
    model: "m",
    wire: { maxOutputTokens: 42, reasoningLevel: "high" },
  });
  assert.deepEqual(JSON.parse((await transported[0]?.text()) ?? "null"), capture.body);
  await assert.rejects(
    fetch("https://provider.invalid", { body: "[]", method: "POST" }),
    /object|body|json/iu,
  );
  await assert.rejects(
    fetch("https://provider.invalid", { body: new Uint8Array([1, 2]), method: "POST" }),
    /body|json|text/iu,
  );
  assert.equal(transported.length, 1);
});

test("Anthropic metadata is provider-scoped, normalized, and redacted in both wire shapes", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/anthropic-request-metadata")>(
    "anthropic-request-metadata",
  );
  const value = await module.resolveAnthropicRequestMetadataUserId({
    env: {},
    providerKind: "anthropic",
    sessionId: " session-7 " as never,
  });
  assert.ok(value);
  assert.deepEqual(JSON.parse(value), {
    account_uuid: "",
    device_id: seams.deviceMid,
    session_id: " session-7 ",
  });
  assert.equal(
    await module.resolveAnthropicRequestMetadataUserId({
      env: {},
      providerKind: "openai",
      sessionId: "s" as never,
    }),
    undefined,
  );
  const redacted = module.redactAnthropicRequestMetadata({
    metadata: { user_id: value },
    providerOptions: { anthropic: { metadata: { userId: value } } },
  });
  assert.doesNotMatch(JSON.stringify(redacted), /device-mid-test|session-7/u);
});

test("strict schemas are enabled only for first-party Claude and unsupported shapes fall back", async (context) => {
  const seams = useSeams(context);
  const strict =
    await loadTargetModule<typeof import("@target/strict-tool-schema")>("strict-tool-schema");
  const tools = await loadTargetModule<typeof import("@target/tool-transform")>("tool-transform");
  assert.equal(strict.isAnthropicFirstPartyModelId("claude-4-test"), true);
  assert.equal(strict.isAnthropicFirstPartyModelId("anthropic/claude-4-test"), false);
  const strictObject = strict.toStrictToolSchema({
    properties: { x: { type: "string" } },
    type: "object",
  });
  assert.equal(strictObject?.additionalProperties, false);
  assert.deepEqual(strictObject?.properties, { x: { type: "string" } });
  assert.equal(strictObject?.type, "object");
  assert.equal(strict.toStrictToolSchema({}), undefined);
  assert.equal(
    strict.toStrictToolSchema({ prefixItems: [{ type: "string" }], type: "array" }),
    undefined,
  );
  const executeCalls: unknown[][] = [];
  const contract: ModelToolContract = {
    concurrentSafe: false,
    destructive: true,
    execute(input, callContext) {
      executeCalls.push([input, callContext]);
      return { ok: true };
    },
    inputSchema: { properties: { command: { type: "string" } }, type: "object" },
    maxOutputBytes: 500,
    name: "run",
    readOnly: false,
    sideEffectScope: "system",
    strict: true,
    timeoutMs: 9_000,
  };
  const transformed = tools.toAiSdkTools([contract], {
    modelId: "claude-4-test",
    providerKind: "anthropic",
  });
  const toolCall = seams.calls.find((call) => call.name === "ai.tool");
  assert.ok(toolCall);
  assert.match(JSON.stringify(toolCall.args), /strict/u);
  const run = Reflect.get(transformed ?? {}, "run") as {
    execute?: (input: unknown, options: unknown) => Promise<unknown>;
  };
  assert.deepEqual(
    await run.execute?.(
      { command: "x" },
      { abortSignal: new AbortController().signal, toolCallId: "call-1" },
    ),
    { ok: true },
  );
  assert.equal(Reflect.get(executeCalls[0]?.[1] ?? {}, "toolCallId"), "call-1");
});

test("native web search and MFJS schema references fail closed at the public tool boundary", async (context) => {
  useSeams(context);
  const errors = await loadTargetModule<typeof import("@target/errors")>("errors");
  const module = await loadTargetModule<typeof import("@target/tool-transform")>("tool-transform");
  const native: ModelToolContract = {
    executionMode: "providerNative",
    inputSchema: { type: "object" },
    name: "WebSearch",
    providerNative: {
      fallback: "disabled",
      kind: "provider_native",
      logicalName: "WebSearch",
      providerToolName: "web_search",
    },
  };
  assert.throws(
    () => module.toAiSdkTools([native], { providerKind: "openai", supportsNativeWebSearch: true }),
    /anthropic|native|provider/iu,
  );
  assert.ok(
    module.toAiSdkTools([native], { providerKind: "anthropic", supportsNativeWebSearch: true }),
  );
  const brokenRef: ModelToolContract = {
    inputSchema: { properties: { value: { $ref: "#/$defs/missing" } }, type: "object" },
    name: "broken",
  };
  assert.throws(
    () => module.toAiSdkTools([brokenRef], { requiresMfjsToolSchema: true }),
    (error: unknown) => {
      assert.ok(error instanceof errors.AiSdkModelAdapterError);
      assert.equal(error.code, "invalid_model_request");
      assert.equal(error.context?.toolName, "broken");
      assert.equal(error.context?.ref, "#/$defs/missing");
      assert.match(error.message, /broken/u);
      assert.match(error.message, /#\/\$defs\/missing/u);
      return true;
    },
  );
});

test("tool-result media enforces direct CUA adjacency while preserving the video/file predecessor discrepancy", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/tool-result-media-projection")>(
    "tool-result-media-projection",
  );
  const frame = { type: "text" as const, text: '{"image_ref":"frame-1"}' };
  const image = {
    dataUrl: "data:image/png;base64,AA==",
    mediaType: "image/png",
    type: "image" as const,
  };
  const video = {
    dataUrl: "data:video/mp4;base64,AA==",
    mediaType: "video/mp4",
    type: "video" as const,
  };
  const supported = modelProperties().inputFormat;
  assert.equal(
    module.undeliverableFrameReferenceText([image, frame], {
      inputFormat: supported,
      stripMedia: false,
    }),
    undefined,
  );
  assert.equal(
    module.undeliverableFrameReferenceText([video, frame], {
      inputFormat: supported,
      stripMedia: false,
    }),
    undefined,
  );
  assert.match(
    module.undeliverableFrameReferenceText([frame, image], {
      inputFormat: supported,
      stripMedia: false,
    }) ?? "",
    /frame|image|media/iu,
  );
  assert.match(
    module.undeliverableFrameReferenceText([image, frame], {
      inputFormat: supported,
      stripMedia: true,
    }) ?? "",
    /frame|image|media/iu,
  );
  const parts = module.toToolResultMediaUserParts([image, frame], {
    inputFormat: supported,
    providerKind: "openai-compatible",
    toolName: "computer",
  });
  const frameIndex = parts.findIndex((part) => /image_ref/u.test(JSON.stringify(part)));
  assert.ok(frameIndex > 0);
  assert.equal(Reflect.get(Object(parts[frameIndex - 1]), "type"), "image");
});

test("runner options project model fields but omit runtime-only ports", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-options")>("runner-options");
  const request = {
    ...textRequest(),
    modelRequestAdmission: {
      acquire: async () => ({ publish: () => undefined, release: () => undefined }),
    },
    refreshRuntimeHeadersBeforeAttempt: async () => ({ headersApplied: true }),
    statusSink: { publish: () => undefined },
    traceContext: traceContext(),
  } as import("@target/runner-runtime").AiSdkModelTextRequest;
  const statusContext = {
    attempt: 1,
    maxAttempts: 11,
    modelCall: {
      actorKind: "main",
      logicalCallId: "logical",
      operation: "agent_step",
      reasoning: {
        capability: "supported",
        effectiveControl: "fixed_level",
        effectiveState: "enabled",
        requestedControl: "fixed_level",
        requestedState: "enabled",
      },
    },
    modelId: "model-test",
    modelRequestSessionType: "main",
    providerId: "provider-test",
    requestId: "request-test",
    traceId: "trace-test",
    transport: "http",
  } as unknown as import("@target/runner-status").ModelStatusContext;
  const options = module.createGenerateTextOptions({
    includeModelIO: true,
    request,
    resolved: resolvedModel() as never,
    statusContext,
  });
  assert.equal(options.maxRetries, 0);
  assert.deepEqual(options.messages, [{ content: "hello", role: "user" }]);
  const serialized = JSON.stringify(options);
  assert.doesNotMatch(
    serialized,
    /modelRequestAdmission|refreshRuntimeHeadersBeforeAttempt|statusSink|traceContext/u,
  );
});

test("reasoning metadata and history normalization preserve only provider-visible facts", async (context) => {
  useSeams(context);
  const metadata = await loadTargetModule<typeof import("@target/anthropic-reasoning-metadata")>(
    "anthropic-reasoning-metadata",
  );
  const history = await loadTargetModule<typeof import("@target/reasoning-history-normalization")>(
    "reasoning-history-normalization",
  );
  const providerOptions = {
    anthropic: { signature: "sig" },
    vendor: { x: 1 },
  };
  const block = {
    providerOptions,
    text: "thinking",
    type: "reasoning" as const,
  };
  assert.deepEqual(
    metadata.providerOptionsForReasoningBlock(block, { providerKind: "anthropic" }),
    {
      providerOptions,
    },
  );
  const openAiOptions = metadata.providerOptionsForReasoningBlock(block, {
    providerKind: "openai-compatible",
  });
  assert.deepEqual(openAiOptions, { providerOptions });
  assert.equal(Reflect.get(openAiOptions, "providerOptions"), providerOptions);
  assert.deepEqual(
    metadata.providerOptionsForReasoningBlock(
      { text: "none", type: "reasoning" },
      { providerKind: "openai-compatible" },
    ),
    {},
  );
  const messages: ModelInputMessage[] = [
    { content: [{ text: "", type: "reasoning" }], role: "assistant" },
    textMessage("next"),
  ];
  const normalized = history.normalizeReasoningHistory(messages);
  assert.deepEqual(messages[0]?.content, [{ text: "", type: "reasoning" }]);
  assert.deepEqual(normalized, [textMessage("next")]);
});

test("structured tool-result textification is deterministic for chat and video paths", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/tool-result-media-projection")>(
    "tool-result-media-projection",
  );
  const content: ModelMessageContent = [
    { text: "result", type: "text" },
    { dataUrl: "data:video/mp4;base64,AA==", mediaType: "video/mp4", type: "video" },
  ];
  assert.equal(
    module.shouldTextifyStructuredToolResults({
      apiFormat: "openai-chat-completions",
      providerKind: "openai-compatible",
    }),
    true,
  );
  assert.equal(module.toolResultHasVideoMedia(content), true);
  const text = module.toStructuredToolResultText(content, {
    inputFormat: modelProperties().inputFormat,
  });
  assert.match(text, /result/u);
  assert.match(text, /video/iu);
});
