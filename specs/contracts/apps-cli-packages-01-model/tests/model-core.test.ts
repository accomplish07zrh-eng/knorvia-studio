// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B1–B10（装配、provider 路由与请求投影）。
// 黑盒断言只走模块路径入口（entry.mjs 由 KNORVIA_ADAPTERS_ENTRY 切源码/dist）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { load, loadAbsolute, repoRoot } from "./entry.mjs";

const {
  AiSdkModelExecution,
  ProviderBusinessError,
  createProviderBusinessErrorFetch,
  isProviderBusinessError,
  readProviderBusinessFailureFromBody,
} = await load("model/model-execution");
const { mergeModelRequestHeaders } = await load("model/model-request-headers");
const { createModelOptionMapFetch } = await load("model/model-option-map-fetch");
const { createModel } = await load("model/model");
const { AiSdkModelAdapterError } = await load("model/errors");
const { isOpenCodeGoBaseUrl } = await load("model/opencode-session");

const optionSpecs = {
  reasoningLevel: { map: '{"reasoning_effort": reasoningLevel}', values: ["low", "high"] },
  maxOutputTokens: { map: '{"max_tokens": maxOutputTokens}', max: 4096 },
};

function execution(transport?: typeof globalThis.fetch) {
  return new AiSdkModelExecution(
    { defaultHeaders: { "x-default": "d" }, env: {} },
    transport ? { transport } : {},
  );
}

function bind(api: Record<string, unknown>, access: Record<string, unknown> = {}) {
  return execution().bindModel({
    providerId: "prov",
    modelId: "model-x",
    providerConfig: { api, access } as never,
    supportsJsonSchemaOutput: true,
    optionSpecs,
  });
}

test("B1 provider API 格式到 SDK 种类的路由", () => {
  assert.equal(bind({ type: "anthropic-messages" }).resolved.providerKind, "anthropic");
  assert.equal(bind({ type: "openai-responses" }).resolved.providerKind, "openai");
  assert.equal(
    bind({ type: "openai-chat-completions" }).resolved.providerKind,
    "openai-compatible",
  );
  assert.equal(bind({}).resolved.providerKind, "openai-compatible");
  assert.throws(
    () => bind({ type: "unknown-format" }),
    (error: unknown) =>
      error instanceof Error && error.message === "Unsupported provider API format: unknown-format",
  );
});

test("B2 请求期鉴权与 header 合并（大小写不敏感、后者覆盖前者）", () => {
  const merged = mergeModelRequestHeaders(
    { "X-One": "1", keep: "k" },
    { "x-one": "2", "X-Two": "t" },
  );
  assert.deepEqual(Object.keys(merged), ["keep", "x-one", "X-Two"]);
  assert.equal(merged["x-one"], "2");
  const bound = bind(
    { type: "anthropic-messages", headers: { "X-Static": "s" } },
    { apiKey: "static-key" },
  );
  const resolved = bound.resolveRequest({ options: { reasoningLevel: "low", maxOutputTokens: 8 } });
  assert.equal(resolved.headers["Authorization"], "Bearer static-key");
  assert.equal(resolved.headers["X-Static"], "s");
  assert.equal(resolved.headers["x-default"], "d");
  const withAuth = bound.resolveRequest({
    options: { reasoningLevel: "low", maxOutputTokens: 8 },
    requestAuth: { apiKey: "request-key", headers: { authorization: "Custom scheme" } },
  });
  assert.equal(withAuth.headers["authorization"], "Custom scheme");
  assert.equal(withAuth.headers["Authorization"], undefined);
});

test("B3 三种 provider 的 SDK 构造与 baseURL 归一", async () => {
  const captured: { url?: string; body?: unknown }[] = [];
  const transport: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    captured.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const anthropicShape = url.includes("/messages");
    return new Response(
      JSON.stringify(
        anthropicShape
          ? {
              id: "resp",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: "hi" }],
              stop_reason: "end_turn",
              usage: { input_tokens: 1, output_tokens: 1 },
            }
          : {
              id: "resp",
              model: "model-x",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "hi" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const { generateText } = await import("ai");
  const anthropicBound = execution(transport).bindModel({
    providerId: "prov",
    modelId: "model-x",
    providerConfig: {
      api: { type: "anthropic-messages", baseUrl: "https://api.example" },
      access: { apiKey: "k" },
    } as never,
    supportsJsonSchemaOutput: true,
    optionSpecs,
  });
  await generateText({
    model: anthropicBound.resolveRequest({
      options: { reasoningLevel: "low", maxOutputTokens: 8 },
    }).model,
    messages: [{ role: "user", content: "hi" }],
    maxRetries: 0,
  });
  assert.match(captured[0].url ?? "", /^https:\/\/api\.example\/v1\/messages/);
  const anthropicNoV1 = execution(transport).bindModel({
    providerId: "prov",
    modelId: "model-x",
    providerConfig: {
      api: { type: "anthropic-messages", baseUrl: "https://api.example/v1" },
      access: { apiKey: "k" },
    } as never,
    supportsJsonSchemaOutput: true,
    optionSpecs,
  });
  await generateText({
    model: anthropicNoV1.resolveRequest({
      options: { reasoningLevel: "low", maxOutputTokens: 8 },
    }).model,
    messages: [{ role: "user", content: "hi" }],
    maxRetries: 0,
  });
  assert.match(captured[1].url ?? "", /^https:\/\/api\.example\/v1\/messages/);
  const compatible = bind({ type: "openai-chat-completions", baseUrl: "https://compat.example" });
  assert.equal(compatible.resolved.providerKind, "openai-compatible");
  assert.equal(compatible.resolved.baseURL, "https://compat.example");
  assert.equal(typeof compatible.resolved.model, "object");
  assert.equal(typeof compatible.resolved.rawRequestBodyCapture, "object");
});

test("B4 选项映射 fetch 包装（请求体改写与原始体捕获）", async () => {
  const { compileModelOptionMaps } = await loadAbsolute(
    `${repoRoot}/packages/model-option-map/src/index.ts`,
  );
  const maps = compileModelOptionMaps(optionSpecs);
  const seen: unknown[] = [];
  const base: typeof globalThis.fetch = async (_input, init) => {
    seen.push(init?.body);
    return new Response("ok");
  };
  const capture: { body?: unknown } = {};
  const wrapped = createModelOptionMapFetch({
    capture,
    fetch: base,
    maps,
    values: { reasoningLevel: "high", maxOutputTokens: 64 },
  });
  await wrapped("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({ model: "m", reasoning_effort: "low", max_tokens: 1 }),
  } as never);
  assert.deepEqual(JSON.parse(JSON.stringify(capture.body)), {
    model: "m",
    reasoning_effort: "high",
    max_tokens: 64,
  });
  assert.equal(seen[0], JSON.stringify(capture.body));
  await wrapped("https://example.invalid", { method: "GET" } as never);
  assert.equal(seen[1], undefined);
  await assert.rejects(
    wrapped("https://example.invalid", { body: { not: "string" } } as never),
    (error: unknown) =>
      error instanceof TypeError &&
      error.message === "Model option maps require a JSON object request body",
  );
  await assert.rejects(
    Promise.resolve().then(() => wrapped("https://example.invalid", { body: "{oops" } as never)),
    (error: unknown) =>
      error instanceof TypeError && error.message === "Model option maps require valid JSON",
  );
  await assert.rejects(
    wrapped("https://example.invalid", { body: "[1]" } as never),
    (error: unknown) =>
      error instanceof TypeError &&
      error.message === "Model option maps require a JSON object request body",
  );
});

test("B5 provider 业务错误体的提取（readProviderBusinessFailureFromBody）", () => {
  assert.equal(readProviderBusinessFailureFromBody("not json"), undefined);
  assert.equal(readProviderBusinessFailureFromBody("x".repeat(64_001)), undefined);
  assert.equal(readProviderBusinessFailureFromBody([1, 2]), undefined);
  assert.equal(readProviderBusinessFailureFromBody({ ok: true }), undefined);
  const extracted = readProviderBusinessFailureFromBody({
    error: { code: "1234", message: "boom", request_id: "rid" },
    status: 400,
    noise: { deep: { nested: true } },
  });
  assert.deepEqual(extracted, {
    providerCode: "1234",
    providerMessage: "boom",
    providerRequestId: "rid",
    responseBodySummary: {
      status: 400,
      error: { code: "1234", message: "boom", request_id: "rid" },
    },
    statusCode: 400,
  });
  const long = readProviderBusinessFailureFromBody({
    message: "m".repeat(2000),
  });
  assert.equal(long?.providerMessage?.length, 1000);
});

test("B6 非 2xx 响应转 ProviderBusinessError（含清理路径）", async () => {
  const ok: typeof globalThis.fetch = async () => new Response("fine", { status: 200 });
  const wrapped = createProviderBusinessErrorFetch({
    providerId: "prov",
    providerKind: "openai-compatible",
    fetch: ok,
  });
  const response = await wrapped("https://example.invalid", {});
  assert.equal(response.status, 200);
  const failing: typeof globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { code: "9", message: "nope" } }), {
      status: 400,
      headers: { "content-type": "application/json", "x-rid": "r" },
    });
  const wrappedFailing = createProviderBusinessErrorFetch({
    providerId: "prov",
    providerKind: "openai-compatible",
    fetch: failing,
  });
  await assert.rejects(wrappedFailing("https://example.invalid", {}), (error: unknown) => {
    assert.ok(error instanceof ProviderBusinessError);
    assert.equal(error.code, "PROVIDER_BUSINESS_ERROR");
    assert.equal(error.name, "ProviderBusinessError");
    assert.equal(error.providerMessage, "nope");
    assert.equal(error.statusCode, 400);
    assert.equal(error.responseStatus, 400);
    assert.ok(isProviderBusinessError(error));
    return true;
  });
  const junk: typeof globalThis.fetch = async () => new Response("junk", { status: 500 });
  const wrappedJunk = createProviderBusinessErrorFetch({
    providerId: "prov",
    providerKind: "openai-compatible",
    fetch: junk,
  });
  assert.equal((await wrappedJunk("https://example.invalid", {})).status, 500);
  const duck = { isProviderBusinessError: true };
  assert.equal(isProviderBusinessError(duck), true);
});

test("B7 模型对象的不可变绑定与 bind 合并", () => {
  const executor = {
    generateText: async () => ({}) as never,
    streamText: () => (async function* () {})(),
  };
  const model = createModel({
    providerId: "prov" as never,
    modelId: "model-x" as never,
    displayName: "Demo",
    properties: {
      supportsToolCall: true,
      supportsJsonSchemaOutput: true,
      inputFormat: { supportsImage: true, supportsPdf: true, supportsVideo: true },
    } as never,
    optionSpecs,
    options: { reasoningLevel: "low", maxOutputTokens: 16 },
    executor,
  });
  assert.equal(model.displayName, "Demo");
  assert.equal(model.options.reasoningLevel, "low");
  const rebound = model.bind({ maxOutputTokens: 32 });
  assert.equal(rebound.options.maxOutputTokens, 32);
  assert.equal(model.options.maxOutputTokens, 16);
  assert.ok(Object.isFrozen(model));
});

test("B8 选项校验与默认值（语义常量）", async () => {
  const seen: unknown[] = [];
  const executor = {
    generateText: async (request: never) => {
      seen.push(request);
      return {} as never;
    },
    streamText: () => (async function* () {})(),
  };
  const model = createModel({
    providerId: "prov" as never,
    modelId: "model-x" as never,
    properties: {
      supportsToolCall: true,
      supportsJsonSchemaOutput: true,
      inputFormat: { supportsImage: true, supportsPdf: true, supportsVideo: true },
    } as never,
    optionSpecs,
    executor,
  });
  await model.generateText({ messages: [] } as never);
  assert.deepEqual((seen[0] as { options: unknown }).options, {
    reasoningLevel: "low",
    maxOutputTokens: 4096,
  });
  await assert.rejects(
    Promise.resolve().then(() =>
      model.generateText({
        messages: [],
        options: { reasoningLevel: "ultra" },
      } as never),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AiSdkModelAdapterError);
      assert.equal(error.code, "invalid_model_request");
      assert.equal(error.message, "Unsupported reasoningLevel: ultra");
      assert.deepEqual(error.context, {
        reason: "invalid_request",
        retryable: false,
        source: "runtime",
      });
      return true;
    },
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      model.generateText({
        messages: [],
        options: { maxOutputTokens: 99_999 },
      } as never),
    ),
    /maxOutputTokens must be a positive integer no greater than 4096/u,
  );
});

test("B9 请求能力校验（工具、结构化输出、输入媒体）", async () => {
  const executor = {
    generateText: async () => ({}) as never,
    streamText: () => (async function* () {})(),
  };
  const model = createModel({
    providerId: "prov" as never,
    modelId: "model-x" as never,
    properties: {
      supportsToolCall: false,
      supportsJsonSchemaOutput: false,
      inputFormat: { supportsImage: false, supportsPdf: false, supportsVideo: false },
    } as never,
    optionSpecs,
    executor,
  });
  const cases: Array<[unknown, string]> = [
    [{ messages: [], tools: [{ name: "t" }] }, "Selected model does not support tools"],
    [
      { messages: [], responseJsonSchema: { type: "object" } },
      "Selected model does not support structured output",
    ],
    [
      {
        messages: [
          { role: "user", content: [{ type: "image", dataUrl: "data:image/png;base64,AA" }] },
        ],
      },
      "Selected model does not support image input",
    ],
    [
      {
        messages: [
          { role: "user", content: [{ type: "video", dataUrl: "data:video/mp4;base64,AA" }] },
        ],
      },
      "Selected model does not support video input",
    ],
    [
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "application/pdf; version=1",
                dataUrl: "data:application/pdf;base64,AA",
              },
            ],
          },
        ],
      },
      "Selected model does not support PDF input",
    ],
  ];
  for (const [request, message] of cases) {
    await assert.rejects(
      Promise.resolve().then(() => model.generateText(request as never)),
      (error: unknown) => {
        assert.ok(error instanceof AiSdkModelAdapterError);
        assert.equal(error.code, "invalid_model_request");
        assert.equal(error.message, message);
        return true;
      },
    );
  }
});

test("B10 OpenCode Go base URL 判定", () => {
  assert.equal(isOpenCodeGoBaseUrl(undefined), false);
  assert.equal(isOpenCodeGoBaseUrl(""), false);
  assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1"), true);
  assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1/"), true);
  assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v2"), false);
  assert.equal(isOpenCodeGoBaseUrl("https://other.invalid/zen/go/v1"), false);
  assert.equal(isOpenCodeGoBaseUrl("not a url"), false);
});

void fileURLToPath;
