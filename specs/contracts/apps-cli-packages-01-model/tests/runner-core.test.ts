// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B47–B52（runner 核心编排）。
// 事件序列断言：注入假 runtime / 状态接收端 / 准入端口，不发真实网络请求、不用 sleep 凑时序。
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./entry.mjs";

const { AiSdkModelAdapter, createModel } = await load("model/runner");
const { createGenerateTextOptions } = await load("model/runner-options");
const { runGenerateText } = await load("model/runner-generate");
const { runStreamText } = await load("model/runner-stream");
const { defaultRuntime } = await load("model/runner-runtime");

const optionSpecs = {
  reasoningLevel: { map: '{"reasoning_effort": reasoningLevel}', values: ["low", "high"] },
  maxOutputTokens: { map: '{"max_tokens": maxOutputTokens}', max: 4096 },
};
const properties = {
  supportsToolCall: true,
  supportsJsonSchemaOutput: true,
  inputFormat: { supportsImage: true, supportsPdf: true, supportsVideo: true },
  requiresMfjsToolSchema: false,
  supportsNativeWebSearch: false,
};

function resolvedModel() {
  return {
    providerId: "prov",
    modelId: "model-x",
    providerKind: "openai-compatible",
    baseURL: "https://compat.example",
    headers: { "x-static": "s" },
    model: { fake: true },
    properties,
    rawRequestBodyCapture: {},
  } as never;
}

function textRequest(overrides: Record<string, unknown> = {}) {
  return {
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 32,
    providerOptions: { reasoningLevel: "high" },
    ...overrides,
  } as never;
}

function captureSink() {
  const events: Record<string, unknown>[] = [];
  return {
    events,
    sink: {
      publish: (event: Record<string, unknown>) => {
        events.push(event);
        return Promise.resolve();
      },
    },
  };
}

const retryFast = {
  maxAttempts: 3,
  baseDelayMs: 1,
  backoffFactor: 1,
  maxDelayMs: 1,
  jitter: false,
};

function runnerInput(overrides: Record<string, unknown> = {}) {
  const capture = captureSink();
  return {
    capture,
    input: {
      env: { KNORVIA_RUNTIME_ENV: "test" },
      request: textRequest(),
      resolveModel: () => resolvedModel(),
      resolved: resolvedModel(),
      retry: retryFast,
      statusSink: capture.sink,
      modelIoFullRetentionEnabled: false,
      ...overrides,
    },
  };
}

test("B47 适配器构造、默认值与状态接收端组合", async () => {
  const rollout = new AiSdkModelAdapter({ env: {} });
  assert.match((rollout as unknown as { debugDir: string }).debugDir, /cli[\\/]rollout$/u);
  const dev = new AiSdkModelAdapter({ env: { KNORVIA_RUNTIME_ENV: "development" } });
  assert.match((dev as unknown as { debugDir: string }).debugDir, /cli[\\/]debug$/u);
  const explicit = new AiSdkModelAdapter({ env: {}, debugDir: "D:/tmp/x" });
  assert.equal((explicit as unknown as { debugDir: string }).debugDir, "D:/tmp/x");
  assert.equal((rollout as unknown as { streamIdleTimeoutMs: number }).streamIdleTimeoutMs, 90_000);
  assert.equal((rollout as unknown as { fullRetention: boolean }).fullRetention, false);
  const first: unknown[] = [];
  const second: unknown[] = [];
  const adapter = new AiSdkModelAdapter({ env: {} });
  adapter.addStatusSink({
    publish: (event: unknown) => {
      first.push(event);
      return Promise.resolve();
    },
  } as never);
  adapter.addStatusSink({
    publish: (event: unknown) => {
      second.push(event);
      return Promise.resolve();
    },
  } as never);
  const combined = (
    adapter as unknown as {
      statusSink: { publish(e: unknown): Promise<void>; publishFailure?: unknown };
    }
  ).statusSink;
  assert.equal(combined.publishFailure, undefined);
  await combined.publish({ type: "x" });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});

test("B48 请求准备：鉴权刷新与 reasoning 归一", async () => {
  const generated: unknown[] = [];
  const runtime = {
    generateText: async (options: unknown) => {
      generated.push(options);
      return {
        text: "ok",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
    streamText: () => (async function* () {})(),
  };
  const capture = captureSink();
  const adapter = new AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    runtime,
    statusSink: capture.sink,
    retry: retryFast,
  });
  const model = adapter.createModel({
    providerId: "prov-openai",
    modelId: "model-x",
    providerConfig: {
      api: { type: "openai-chat-completions", baseUrl: "https://compat.example" },
      access: { type: "zhipu-account" },
    } as never,
    modelConfig: { properties, optionSpecs } as never,
    requestDependencies: {
      requestAuth: {
        source: {
          resolve: async () => ({ apiKey: "auth-key", headers: { "x-auth": "1" } }),
        },
      },
    } as never,
  });
  await model.generateText({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "stored", providerOptions: { itemId: "st-1" } },
          { type: "text", text: "kept" },
        ],
      },
    ],
    options: { reasoningLevel: "high", maxOutputTokens: 64 },
  } as never);
  assert.equal(
    capture.events.map((event) => event.type).join(","),
    "model_request_started,model_request_completed",
  );
  const options = generated[0] as { maxOutputTokens: number; messages: { content: unknown }[] };
  assert.equal(options.maxOutputTokens, 64);
  assert.equal(options.messages[0].content, "kept");
  const authMissing = adapter.createModel({
    providerId: "prov",
    modelId: "model-x",
    providerConfig: {
      api: { type: "openai-chat-completions" },
      access: { type: "zhipu-account" },
    } as never,
    modelConfig: { properties, optionSpecs } as never,
    requestDependencies: {
      requestAuth: { source: { resolve: async () => undefined } },
    } as never,
  });
  const before = capture.events.length;
  await assert.rejects(
    Promise.resolve().then(() => authMissing.generateText({ messages: [] } as never)),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "model_request_auth_missing");
      return true;
    },
  );
  assert.equal(capture.events.length, before);
});

test("B49 SDK 请求选项装配（语义常量）", () => {
  const headers: Record<string, unknown>[] = [];
  const options = createGenerateTextOptions({
    anthropicMetadataUserId: '{"device_id":"d"}',
    includeModelIO: false,
    request: textRequest({ responseJsonSchema: { type: "object" }, abortSignal: undefined }),
    resolved: {
      ...resolvedModel(),
      headers: { "x-static": "s" },
      providerOptions: { base: 1 },
    } as never,
    statusContext: {
      traceId: "t",
      requestId: "r",
      sessionId: "sess_1",
      providerId: "prov",
      modelId: "model-x",
      modelRequestSessionType: "main",
      transport: "http",
      maxAttempts: 3,
      modelCall: { actorKind: "main", operation: "model" },
    } as never,
  });
  const value = options as unknown as Record<string, unknown>;
  assert.equal(value.maxRetries, 0);
  assert.deepEqual(value.providerOptions, {
    base: 1,
    reasoningLevel: "high",
    anthropic: { metadata: { userId: '{"device_id":"d"}' } },
  });
  assert.deepEqual(value.headers, {
    "x-static": "s",
    "x-knorvia-request-id": "r",
    "x-knorvia-trace-id": "t",
    "x-knorvia-session-type": "main",
    "x-knorvia-session-id": "1",
  });
  assert.ok(value.output);
  assert.equal("abortSignal" in value, false);
  const openCode = createGenerateTextOptions({
    includeModelIO: false,
    request: textRequest(),
    resolved: { ...resolvedModel(), baseURL: "https://opencode.ai/zen/go/v1" } as never,
    statusContext: {
      traceId: "t",
      requestId: "r",
      providerId: "prov",
      modelId: "model-x",
      modelRequestSessionType: "main",
      transport: "sse",
      maxAttempts: 3,
      modelCall: { actorKind: "main", operation: "model" },
    } as never,
  }) as unknown as Record<string, unknown>;
  assert.deepEqual((openCode.headers as Record<string, string>)["x-opencode-session"], undefined);
  void headers;
});

test("B50 运行时端口默认实现", async () => {
  const ai = await import("ai");
  assert.equal(defaultRuntime.generateText, ai.generateText);
  assert.equal(defaultRuntime.streamText, ai.streamText);
});

test("B51 runGenerateText 的 attempt 状态机（事件序列）", async () => {
  let calls = 0;
  const runtime = {
    generateText: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("rate"), {
          statusCode: 429,
          responseHeaders: { "retry-after-ms": "1" },
        });
      }
      return {
        text: "ok",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      };
    },
    streamText: () => (async function* () {})(),
  };
  const { capture, input } = runnerInput({ runtime });
  const result = await runGenerateText(input as never);
  assert.equal(result.text, "ok");
  assert.deepEqual(
    capture.events.map((event) => `${event.type}:${event.attempt}`),
    [
      "model_request_started:1",
      "model_request_failed:1",
      "model_retry_scheduled:1",
      "model_request_started:2",
      "model_request_completed:2",
    ],
  );
  assert.equal(capture.events[1].retryable, true);
  assert.equal(capture.events[1].errorCode, "model_rate_limited");
  assert.equal(capture.events[2].nextAttempt, 2);
});

test("B51 空补全重试（事件序列）", async () => {
  let calls = 0;
  const runtime = {
    generateText: async () => {
      calls += 1;
      return calls === 1
        ? { text: "", finishReason: "stop", usage: undefined, toolCalls: [], reasoning: [] }
        : { text: "ok", finishReason: "stop", usage: { totalTokens: 1 } };
    },
    streamText: () => (async function* () {})(),
  };
  const { capture, input } = runnerInput({ runtime });
  const result = await runGenerateText(input as never);
  assert.equal(result.text, "ok");
  assert.deepEqual(
    capture.events.map((event) => `${event.type}:${event.reason ?? ""}`),
    [
      "model_request_started:",
      "model_request_failed:stale_connection",
      "model_retry_scheduled:stale_connection",
      "model_request_started:",
      "model_request_completed:",
    ],
  );
});

test("B51 鉴权缺失 pre-start 原样抛出（不补 failed 事件）", async () => {
  const runtime = {
    generateText: async () => {
      throw new Error("must not run");
    },
    streamText: () => (async function* () {})(),
  };
  const { capture, input } = runnerInput({
    runtime,
    request: textRequest({
      refreshRuntimeHeadersBeforeAttempt: async () => {
        const { AiSdkModelAdapterError } = await load("model/errors");
        throw new AiSdkModelAdapterError(
          "model_request_auth_missing",
          "Model request authentication is missing",
          { context: { reason: "auth_failed", retryable: false, source: "runtime" } },
        );
      },
    }),
  });
  await assert.rejects(
    Promise.resolve().then(() => runGenerateText(input as never)),
    (error: unknown) => (error as { code?: string }).code === "model_request_auth_missing",
  );
  assert.deepEqual(capture.events, []);
});

test("B52 runStreamText 的 attempt 状态机（前奏缓冲与提交门）", async () => {
  const runtime = {
    generateText: async () => ({}) as never,
    streamText: () => ({
      fullStream: (async function* () {
        yield { type: "start" };
        yield { type: "text-start", id: "t1" };
        yield { type: "text-delta", id: "t1", text: "hello" };
        yield { type: "text-end", id: "t1" };
        yield {
          type: "finish",
          finishReason: "stop",
          totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        };
      })(),
      consumeStream: async () => {},
    }),
  };
  const { capture, input } = runnerInput({ runtime });
  const events: unknown[] = [];
  for await (const event of runStreamText(input as never)) events.push(event);
  assert.deepEqual(
    (events as { type: string }[]).map((event) => event.type),
    ["start", "text_start", "text_delta", "text_end", "finish"],
  );
  const completed = capture.events.find(
    (event) => event.type === "model_request_completed",
  ) as Record<string, unknown>;
  assert.equal(completed.streamOutputCommitted, true);
  assert.equal((completed.usage as { totalTokens: number }).totalTokens, 3);
  assert.equal(typeof completed.timeToFirstContentMs, "number");
});

test("B52 输出提交门：可见后失败不再重放", async () => {
  let calls = 0;
  const runtime = {
    generateText: async () => ({}) as never,
    streamText: () => ({
      fullStream: (async function* () {
        calls += 1;
        yield { type: "start" };
        yield { type: "text-delta", id: "t1", text: "visible" };
        throw Object.assign(new Error("boom"), { statusCode: 500 });
      })(),
      consumeStream: async () => {},
    }),
  };
  const { capture, input } = runnerInput({ runtime });
  await assert.rejects(async () => {
    for await (const _event of runStreamText(input as never)) void _event;
  });
  assert.equal(calls, 1);
  const failed = capture.events.find((event) => event.type === "model_request_failed") as Record<
    string,
    unknown
  >;
  assert.equal(failed.retryable, false);
  // 兼容限制：失败事件的 streamOutputCommitted 跟随 replayBoundary 标志（compact 语义），
  // 与实际提交跟踪不同——普通模式下已可见输出后失败仍记 false。
  assert.equal(failed.streamOutputCommitted, false);
});

void createModel;
