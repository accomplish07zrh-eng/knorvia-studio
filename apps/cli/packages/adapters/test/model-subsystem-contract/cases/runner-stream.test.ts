// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelStreamEvent } from "@knorvia/contracts";
import { waitUntil } from "../harness/async.js";
import {
  collect,
  deferred,
  resolvedModel,
  streamResult,
  textRequest,
  traceContext,
} from "../harness/fixtures.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";
import { createLogger, createStatusSink } from "../harness/seams.js";

test("streaming tool assembler waits for end, preserves provider execution, deduplicates, and flushes EOF once", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/streaming-tool-call-assembler")>(
    "streaming-tool-call-assembler",
  );
  const assembler = new module.StreamingToolCallAssembler();
  assert.deepEqual(
    assembler.handle({
      id: "c1",
      providerExecuted: true,
      toolName: "run",
      type: "tool_input_start",
    }),
    [
      {
        id: "c1",
        providerExecuted: true,
        toolName: "run",
        type: "tool_input_start",
      },
    ],
  );
  assembler.handle({ delta: '{"x":', id: "c1", type: "tool_input_delta" });
  assert.deepEqual(
    assembler.handle({
      toolCall: {
        id: "c1",
        input: { x: 1 },
        name: "run",
        providerExecuted: true,
      },
      type: "tool_call",
    }),
    [],
  );
  const ended = assembler.handle({ id: "c1", type: "tool_input_end" });
  assert.equal(ended.filter((event) => event.type === "tool_call").length, 1);
  assert.equal(ended.find((event) => event.type === "tool_call")?.toolCall.providerExecuted, true);
  assert.deepEqual(
    assembler.handle({
      toolCall: {
        id: "c1",
        input: { x: 1 },
        name: "run",
        providerExecuted: true,
      },
      type: "tool_call",
    }),
    [],
  );

  assembler.handle({ id: "c2", toolName: "other", type: "tool_input_start" });
  assembler.handle({ delta: "{}", id: "c2", type: "tool_input_delta" });
  assert.equal(assembler.flush().filter((event) => event.type === "tool_call").length, 1);
  assert.deepEqual(assembler.flush(), []);
  assert.deepEqual(
    assembler
      .snapshotNormalizedToolCalls()
      .map((call) => call.id)
      .sort(),
    ["c1", "c2"],
  );
});

test("idle timeout uses base plus 30 seconds per retry and linked abort cleanup is explicit", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/stream-idle-timeout")>("stream-idle-timeout");
  assert.equal(module.resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: 1_000 }), 1_000);
  assert.equal(
    module.resolveModelStreamIdleTimeoutMs({
      baseTimeoutMs: 1_000,
      retryNumber: 2,
    }),
    61_000,
  );
  assert.equal(
    module.resolveModelStreamIdleTimeoutMs({
      baseTimeoutMs: 0,
      retryNumber: 5,
    }),
    0,
  );
  const parent = new AbortController();
  const linked = module.createLinkedAbortController(parent.signal);
  parent.abort(new Error("parent"));
  assert.equal(linked.signal.aborted, true);
  assert.equal(linked.signal.reason, parent.signal.reason);
  linked.cleanup();

  const own = new AbortController();
  const pending = module.readNextWithStreamIdleTimeout(
    {
      next: async () => new Promise<IteratorResult<unknown>>(() => undefined),
    },
    { abortController: own, timeoutMs: 25 },
  );
  await seams.clock.advanceBy(25);
  await assert.rejects(pending, (error) => module.isModelStreamIdleTimeoutError(error));
  assert.equal(own.signal.aborted, true);
});

test("stream runner preserves visible event order and flushes a partial tool call at EOF", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const events = await collect(
    module.runStreamText({
      env: { KNORVIA_RUNTIME_ENV: "test" },
      modelIoFullRetentionEnabled: false,
      request: runtimeRequest(),
      resolveModel: () => resolvedModel() as never,
      resolved: resolvedModel() as never,
      retry: retryOptions(0),
      runtime: {
        async generateText() {
          throw new Error("not used");
        },
        streamText() {
          return streamResult(
            [
              { type: "start" },
              { id: "text", type: "text-start" },
              { id: "text", text: "hello", type: "text-delta" },
              { id: "text", type: "text-end" },
              { id: "call", toolName: "run", type: "tool-input-start" },
              { delta: "{}", id: "call", type: "tool-input-delta" },
              {
                finishReason: "stop",
                totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                type: "finish",
              },
            ],
            { text: Promise.resolve("hello") },
          ) as never;
        },
      },
      streamIdleTimeoutMs: 1_000,
    }),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "start",
      "text_start",
      "text_delta",
      "text_end",
      "tool_input_start",
      "tool_input_delta",
      "tool_call",
      "finish",
    ],
  );
  assert.equal(events.find((event) => event.type === "text_delta")?.text, "hello");
  assert.equal(events.filter((event) => event.type === "tool_call").length, 1);
});

test("hidden provider finish business errors fail before finish reaches the consumer", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const visible: ModelStreamEvent[] = [];
  const stream = module.runStreamText({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    modelIoFullRetentionEnabled: false,
    request: runtimeRequest(),
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(0),
    runtime: {
      async generateText() {
        throw new Error("not used");
      },
      streamText() {
        return streamResult(
          [
            { type: "start" },
            {
              finishReason: "stop",
              providerMetadata: { code: 1302, message: "busy", success: false },
              type: "finish",
            },
          ],
          {
            providerMetadata: Promise.resolve({
              code: 1302,
              message: "busy",
              success: false,
            }),
          },
        ) as never;
      },
    },
    streamIdleTimeoutMs: 1_000,
  });
  await assert.rejects(async () => {
    for await (const event of stream) visible.push(event);
  });
  assert.equal(
    visible.some((event) => event.type === "finish"),
    false,
  );
});

test(
  "empty completion retries once within ordinary budget but compact mode never uses that path",
  { timeout: 10_000 },
  async (context) => {
    const seams = useSeams(context);
    const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
    let calls = 0;
    const emptyUsage = {
      inputTokenDetails: {
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        noCacheTokens: undefined,
      },
      inputTokens: undefined,
      outputTokenDetails: {
        reasoningTokens: undefined,
        textTokens: undefined,
      },
      outputTokens: undefined,
      totalTokens: undefined,
    };
    const runtime = {
      async generateText() {
        throw new Error("not used");
      },
      streamText() {
        calls += 1;
        return calls === 1
          ? (streamResult(
              [
                {
                  finishReason: "stop",
                  totalUsage: emptyUsage,
                  type: "finish",
                },
              ],
              {
                totalUsage: Promise.resolve(emptyUsage),
              },
            ) as never)
          : (streamResult(
              [
                { id: "t", type: "text-start" },
                { id: "t", text: "ok", type: "text-delta" },
                { id: "t", type: "text-end" },
                {
                  finishReason: "stop",
                  totalUsage: emptyUsage,
                  type: "finish",
                },
              ],
              {
                text: Promise.resolve("ok"),
                totalUsage: Promise.resolve(emptyUsage),
              },
            ) as never);
      },
    };
    const pending = collect(
      module.runStreamText({
        env: { KNORVIA_RUNTIME_ENV: "test" },
        modelIoFullRetentionEnabled: false,
        request: runtimeRequest(),
        resolveModel: () => resolvedModel() as never,
        resolved: resolvedModel() as never,
        retry: retryOptions(1),
        runtime,
        streamIdleTimeoutMs: 1_000,
      }),
    );
    await waitUntil(() => seams.clock.pendingDelays().includes(0) || calls > 1);
    await seams.clock.advanceBy(0);
    const events = await pending;
    assert.equal(calls, 2);
    assert.equal(
      events.some((event) => event.type === "text_delta"),
      true,
    );

    calls = 0;
    const compactEvents = await collect(
      module.runStreamText({
        env: { KNORVIA_RUNTIME_ENV: "test" },
        modelIoFullRetentionEnabled: false,
        request: runtimeRequest({ preserveProviderStreamBoundaries: true }),
        resolveModel: () => resolvedModel() as never,
        resolved: resolvedModel() as never,
        retry: retryOptions(3),
        runtime,
        streamIdleTimeoutMs: 1_000,
      }),
    );
    assert.equal(calls, 1);
    assert.equal(
      compactEvents.some((event) => event.type === "finish"),
      true,
    );
  },
);

test("compact replay boundary and actual output commit remain distinct on explicit error chunks", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const statuses = createStatusSink();
  const visible: ModelStreamEvent[] = [];
  const stream = module.runStreamText({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    modelIoFullRetentionEnabled: false,
    request: runtimeRequest({
      preserveProviderStreamBoundaries: true,
      statusSink: statuses,
    }),
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(2),
    runtime: {
      async generateText() {
        throw new Error("not used");
      },
      streamText() {
        return streamResult([
          { rawValue: { type: "ping" }, type: "raw" },
          { rawValue: { type: "message_start" }, type: "raw" },
          {
            error: Object.assign(new Error("body error"), { statusCode: 500 }),
            type: "error",
          },
        ]) as never;
      },
    },
    streamIdleTimeoutMs: 1_000,
  });
  await assert.rejects(async () => {
    for await (const event of stream) visible.push(event);
  });
  assert.equal(visible.filter((event) => event.type === "compact_stream_boundary").length, 1);
  const failed = statuses.events.find((event) => event.type === "model_request_failed");
  assert.equal(failed?.streamOutputCommitted, true);
  assert.equal(statuses.events.filter((event) => event.type === "model_request_started").length, 1);
});

test("idle failure aborts attempt and bounds iterator/consume cleanup to one second", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const statuses = createStatusSink();
  const logger = createLogger();
  let returned = 0;
  let requestSignal: AbortSignal | undefined;
  const fullStream: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => new Promise<IteratorResult<unknown>>(() => undefined),
        return: async () => {
          returned += 1;
          return { done: true, value: undefined };
        },
      };
    },
  };
  const pending = collect(
    module.runStreamText({
      env: { KNORVIA_RUNTIME_ENV: "test" },
      logger,
      modelIoFullRetentionEnabled: false,
      request: runtimeRequest({ statusSink: statuses }),
      resolveModel: () => resolvedModel() as never,
      resolved: resolvedModel() as never,
      retry: retryOptions(0),
      streamIdleTimeoutMs: 100,
      runtime: {
        async generateText() {
          throw new Error("not used");
        },
        streamText(options) {
          requestSignal = options.abortSignal;
          return {
            ...streamResult([]),
            consumeStream: async () => new Promise(() => undefined),
            fullStream,
          } as never;
        },
      },
    }),
  );
  await waitUntil(() => seams.clock.pendingDelays().includes(100));
  await seams.clock.advanceBy(100);
  await waitUntil(() => seams.clock.pendingDelays().some((delay) => delay === 1_000));
  await seams.clock.advanceBy(1_000);
  await assert.rejects(pending);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(returned, 1);
  assert.equal(
    statuses.events.some((event) => event.type === "model_stream_stalled"),
    true,
  );
  assert.ok(logger.calls.some((call) => call.name === "warn"));
});

test("stream cancellation rejects pending next and discards its late value", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const late = deferred<IteratorResult<unknown>>();
  const controller = new AbortController();
  const statuses = createStatusSink();
  const fullStream: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => late.promise,
        return: async () => ({ done: true, value: undefined }),
      };
    },
  };
  const pending = collect(
    module.runStreamText({
      env: { KNORVIA_RUNTIME_ENV: "test" },
      modelIoFullRetentionEnabled: false,
      request: runtimeRequest({
        abortSignal: controller.signal,
        statusSink: statuses,
      }),
      resolveModel: () => resolvedModel() as never,
      resolved: resolvedModel() as never,
      retry: retryOptions(0),
      streamIdleTimeoutMs: 1_000,
      runtime: {
        async generateText() {
          throw new Error("not used");
        },
        streamText() {
          return { ...streamResult([]), fullStream } as never;
        },
      },
    }),
  );
  await Promise.resolve();
  controller.abort(new Error("cancel"));
  await assert.rejects(pending, hasCode("model_request_cancelled"));
  late.resolve({
    done: false,
    value: { id: "t", text: "late", type: "text-delta" },
  });
  await Promise.resolve();
  assert.equal(
    statuses.events.some((event) => event.type === "model_request_completed"),
    false,
  );
});

function runtimeRequest(
  overrides: Record<string, unknown> = {},
): import("@target/runner-runtime").AiSdkModelTextRequest {
  return {
    ...textRequest(),
    modelCall: { actorKind: "main", operation: "agent_step" },
    modelRequestSessionType: "main",
    traceContext: traceContext(),
    ...overrides,
  } as unknown as import("@target/runner-runtime").AiSdkModelTextRequest;
}

function retryOptions(
  retryCount: number,
): import("@target/retry-policy").ResolvedAiSdkModelRetryOptions {
  return {
    backoffFactor: 2,
    baseDelayMs: 0,
    jitter: false,
    maxAttempts: retryCount + 1,
    maxDelayMs: 60_000,
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    typeof error === "object" && error !== null && Reflect.get(error, "code") === code;
}

test("stream completion reports usage and time to first content for footer throughput", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  const statuses = createStatusSink();
  await collect(
    module.runStreamText({
      env: { KNORVIA_RUNTIME_ENV: "test" },
      modelIoFullRetentionEnabled: false,
      request: runtimeRequest({ statusSink: statuses }),
      resolveModel: () => resolvedModel() as never,
      resolved: resolvedModel() as never,
      retry: retryOptions(0),
      streamIdleTimeoutMs: 1_000,
      runtime: {
        async generateText() {
          throw new Error("not used");
        },
        streamText() {
          return streamResult([
            { type: "start" },
            { id: "text", type: "text-start" },
            { id: "text", text: "hello", type: "text-delta" },
            { id: "text", type: "text-end" },
            {
              finishReason: "stop",
              totalUsage: {
                inputTokens: 10,
                outputTokens: 4,
                totalTokens: 14,
                inputTokenDetails: { cacheReadTokens: 6 },
              },
              type: "finish",
            },
          ]) as never;
        },
      },
    }),
  );
  const completed = statuses.events.find((event) => event.type === "model_request_completed") as
    | {
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          cacheReadTokens?: number;
        };
        timeToFirstContentMs?: number;
        finishReason?: string;
      }
    | undefined;
  assert.ok(completed);
  // 对话底部的 tok/s 与缓存命中依赖这两项；流式路径此前不上报。
  assert.equal(completed.usage?.inputTokens, 10);
  assert.equal(completed.usage?.outputTokens, 4);
  assert.equal(completed.usage?.cacheReadTokens, 6);
  assert.equal(completed.finishReason, "stop");
  assert.equal(typeof completed.timeToFirstContentMs, "number");
});
