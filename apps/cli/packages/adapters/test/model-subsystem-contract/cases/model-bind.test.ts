// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelRequest, ModelToolContract } from "@knorvia/contracts";
import {
  generateResult,
  modelId,
  modelProperties,
  optionSpecs,
  providerId,
  registryModel,
  registryProvider,
  textMessage,
} from "../harness/fixtures.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

test("bind is immutable and call options override complete bound options", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/model")>("model");
  const calls: import("@target/model").ModelExecutionRequest[] = [];
  const model = module.createModel({
    executor: {
      async generateText(request) {
        calls.push(request);
        return { finishReason: "stop", text: "ok", usage: {} };
      },
      streamText: async function* streamText(request) {
        calls.push(request);
        yield { type: "finish", finishReason: "stop", usage: {} };
      },
    },
    modelId: modelId(),
    optionSpecs: optionSpecs(),
    options: { maxOutputTokens: 2_000, reasoningLevel: "low" },
    properties: modelProperties(),
    providerId: providerId(),
  });
  const rebound = model.bind({ reasoningLevel: "high" });
  assert.notEqual(rebound, model);
  assert.deepEqual(model.options, { maxOutputTokens: 2_000, reasoningLevel: "low" });
  assert.deepEqual(rebound.options, { maxOutputTokens: 2_000, reasoningLevel: "high" });
  await rebound.generateText({
    messages: [textMessage()],
    options: { maxOutputTokens: 1_024 },
  });
  assert.deepEqual(calls[0]?.options, { maxOutputTokens: 1_024, reasoningLevel: "high" });
  assert.equal(rebound.providerId, providerId());
  assert.equal(rebound.modelId, modelId());
});

test("invalid options and unsupported capabilities fail before executor I/O", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/model")>("model");
  let calls = 0;
  const create = (properties = modelProperties()) =>
    module.createModel({
      executor: {
        async generateText() {
          calls += 1;
          return { finishReason: "stop", text: "unexpected", usage: {} };
        },
        streamText: async function* streamText() {
          calls += 1;
          yield { type: "start" };
        },
      },
      modelId: modelId(),
      optionSpecs: optionSpecs(),
      options: { maxOutputTokens: 1_000, reasoningLevel: "low" },
      properties,
      providerId: providerId(),
    });
  assert.throws(() => create().bind({ maxOutputTokens: 0 }), hasCode("invalid_model_request"));
  assert.throws(() => create().bind({ maxOutputTokens: 32_001 }), hasCode("invalid_model_request"));
  assert.throws(
    () => create().bind({ reasoningLevel: "medium" }),
    hasCode("invalid_model_request"),
  );

  const tool: ModelToolContract = { inputSchema: { type: "object" }, name: "run" };
  await assert.rejects(
    create(modelProperties({ supportsToolCall: false })).generateText({
      messages: [textMessage()],
      tools: [tool],
    }),
    hasCode("invalid_model_request"),
  );
  await assert.rejects(
    create(modelProperties({ supportsJsonSchemaOutput: false })).generateText({
      messages: [textMessage()],
      responseJsonSchema: { type: "object" },
    }),
    hasCode("invalid_model_request"),
  );
  const mediaRequest: ModelRequest = {
    messages: [
      {
        content: [{ dataUrl: "data:image/png;base64,AA==", mediaType: "image/png", type: "image" }],
        role: "user",
      },
    ],
  };
  await assert.rejects(
    create(
      modelProperties({ inputFormat: { ...modelProperties().inputFormat, supportsImage: false } }),
    ).generateText(mediaRequest),
    hasCode("invalid_model_request"),
  );
  assert.equal(calls, 0);
});

test("execution binds a provider snapshot and request auth only changes key and headers", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  const provider = registryProvider({
    access: { apiKey: "static-key", type: "api-key" },
    api: {
      baseUrl: "https://anthropic.invalid/root",
      headers: { Authorization: "Static explicit", "X-Case": "provider" },
      type: "anthropic-messages",
    },
  });
  const execution = new module.AiSdkModelExecution(
    { defaultHeaders: { "x-case": "default", "x-default": "yes" }, env: {} },
    { transport: seams.transport.fetch },
  );
  const bound = execution.bindModel({
    modelId: modelId(),
    optionSpecs: { maxOutputTokens: { map: "max-map" }, reasoningLevel: { map: "reasoning-map" } },
    providerConfig: provider,
    providerId: providerId(),
    supportsJsonSchemaOutput: true,
  });
  Reflect.set(Reflect.get(provider, "api") as object, "baseUrl", "https://mutated.invalid");
  const resolved = bound.resolveRequest({
    options: { maxOutputTokens: 2_000, reasoningLevel: "high" },
    requestAuth: {
      apiKey: "attempt-key",
      headers: { authorization: "Attempt explicit", "X-Case": "attempt" },
    },
  });
  assert.equal(
    resolved.headers?.authorization ?? resolved.headers?.Authorization,
    "Attempt explicit",
  );
  assert.equal(headerValue(resolved.headers, "x-case"), "attempt");
  assert.equal(headerValue(resolved.headers, "x-default"), "yes");
  const providerCall = seams.calls.find((call) => call.name === "provider.createAnthropic");
  assert.ok(providerCall);
  assert.match(
    String(Reflect.get(Object(providerCall.args[0]), "baseURL")),
    /^https:\/\/anthropic\.invalid\/root\/v1\/?$/u,
  );
  assert.doesNotMatch(JSON.stringify(providerCall.args), /mutated\.invalid/u);
  assert.equal(seams.calls.filter((call) => call.name === "optionMap.compile").length, 1);
});

test("provider type mapping is closed and case-insensitive header merge is last-wins", async (context) => {
  useSeams(context);
  const executionModule =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  const headerModule =
    await loadTargetModule<typeof import("@target/model-request-headers")>("model-request-headers");
  assert.deepEqual(
    headerModule.mergeModelRequestHeaders(
      { Authorization: "first", "X-Test": "one" },
      { authorization: "last", "x-test": "two" },
    ),
    { authorization: "last", "x-test": "two" },
  );
  const execution = new executionModule.AiSdkModelExecution({
    env: { KNORVIA_RUNTIME_ENV: "test" },
  });
  assert.throws(
    () =>
      execution.bindModel({
        modelId: modelId(),
        optionSpecs: { maxOutputTokens: { map: "max" }, reasoningLevel: { map: "reason" } },
        providerConfig: registryProvider({
          api: { baseUrl: "https://invalid", type: "unknown-api" },
        }),
        providerId: providerId(),
        supportsJsonSchemaOutput: true,
      }),
    /unknown|unsupported|api/iu,
  );
});

test("adapter forwards projection to an injected runtime while keeping provider facts stable", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner")>("runner");
  const seen: Record<string, unknown>[] = [];
  const adapter = new module.AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    runtime: {
      async generateText(options) {
        seen.push(options as Record<string, unknown>);
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  const provider = registryProvider();
  const model = adapter.createModel({
    modelConfig: registryModel(),
    modelId: modelId(),
    providerConfig: provider,
    providerId: providerId(),
  });
  Reflect.set(Reflect.get(provider, "api") as object, "baseUrl", "https://changed.invalid");
  await model
    .bind({ maxOutputTokens: 900, reasoningLevel: "low" })
    .generateText({ messages: [textMessage()] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.maxRetries, 0);
  assert.doesNotMatch(JSON.stringify(seen[0]), /changed\.invalid/u);
});

test("OpenCode Go receives the normalized session header only on the exact endpoint", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner")>("runner");
  const seen: Record<string, unknown>[] = [];
  seams.currentInvocationContext = {
    traceContext: { sessionId: " session-opencode ", traceId: "trace-opencode" },
  };
  const adapter = new module.AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    runtime: {
      async generateText(options) {
        seen.push(options as Record<string, unknown>);
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  const model = adapter.createModel({
    modelConfig: registryModel(),
    modelId: modelId(),
    providerConfig: registryProvider({
      api: { baseUrl: "https://opencode.ai/zen/go/v1", type: "openai-chat-completions" },
    }),
    providerId: providerId(),
  });
  await model
    .bind({ maxOutputTokens: 10, reasoningLevel: "low" })
    .generateText({ messages: [textMessage()] });
  const headers = seen[0]?.headers as Record<string, string>;
  assert.equal(headerValue(headers, "x-opencode-session"), " session-opencode ");
});

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    typeof error === "object" && error !== null && Reflect.get(error, "code") === code;
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  return Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
}
