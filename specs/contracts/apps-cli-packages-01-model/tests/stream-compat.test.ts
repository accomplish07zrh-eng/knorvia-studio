// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B37–B46（流式边界、清理与 provider 兼容）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./entry.mjs";

const {
  createLinkedAbortController,
  isModelStreamIdleTimeoutError,
  readNextWithStreamIdleTimeout,
  resolveModelStreamIdleTimeoutMs,
} = await load("model/stream-idle-timeout");
const { isRetrySafePreludeStreamEvent } = await load("model/stream-retry-boundary");
const { StreamingToolCallAssembler } = await load("model/streaming-tool-call-assembler");
const { createAnthropicCompatFetch } = await load("model/anthropic-stream-compat");
const { createOpenAIResponsesJsonCompatFetch } = await load("model/openai-responses-json-compat");

test("B37 流空闲超时的额度与错误形状（语义常量）", () => {
  assert.equal(resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: 90_000, retryNumber: 0 }), 90_000);
  assert.equal(resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: 90_000, retryNumber: 2 }), 150_000);
  assert.equal(resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: 90_000, retryNumber: -3 }), 90_000);
  assert.equal(resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: 0 }), 0);
  assert.equal(resolveModelStreamIdleTimeoutMs({ baseTimeoutMs: Number.NaN }), 0);
  assert.equal(typeof resolveModelStreamIdleTimeoutMs({}), "number");
  assert.equal(isModelStreamIdleTimeoutError({ code: "MODEL_STREAM_IDLE_TIMEOUT" }), true);
  assert.equal(isModelStreamIdleTimeoutError(new Error("x")), false);
});

test("B38 关联取消与带空闲计时的迭代读取", async () => {
  const parent = new AbortController();
  const linked = createLinkedAbortController(parent.signal);
  assert.equal(linked.signal.aborted, false);
  parent.abort("parent-reason");
  assert.equal(linked.signal.aborted, true);
  assert.equal(linked.signal.reason, "parent-reason");
  linked.cleanup();
  const abortedParent = new AbortController();
  abortedParent.abort("already");
  const linked2 = createLinkedAbortController(abortedParent.signal);
  assert.equal(linked2.signal.reason, "already");
  linked2.cleanup();
  const values = [1, 2];
  let index = 0;
  const iterator = {
    next: async () =>
      index < values.length
        ? { value: values[index++], done: false }
        : { value: undefined, done: true },
  } as AsyncIterator<number>;
  const controller = new AbortController();
  assert.deepEqual(
    await readNextWithStreamIdleTimeout(iterator, {
      abortController: controller,
      timeoutMs: 1000,
    }),
    { value: 1, done: false },
  );
  const rejectedIterator = {
    next: () => new Promise<never>(() => {}),
  } as AsyncIterator<number>;
  const controller2 = new AbortController();
  await assert.rejects(
    readNextWithStreamIdleTimeout(rejectedIterator, {
      abortController: controller2,
      timeoutMs: 5,
      onTimeout: async () => {},
    }),
    (error: unknown) => {
      assert.equal(isModelStreamIdleTimeoutError(error), true);
      assert.match((error as Error).message, /^Model stream produced no event for 5ms$/u);
      return true;
    },
  );
  assert.equal(isModelStreamIdleTimeoutError(controller2.signal.reason), true);
  const controller3 = new AbortController();
  controller3.abort("cancel-x");
  await assert.rejects(
    readNextWithStreamIdleTimeout(iterator, {
      abortController: controller3,
      timeoutMs: 10,
    }),
    (error: unknown) => error === "cancel-x",
  );
});

test("B39 compact 流边界映射", () => {
  const boundary = isRetrySafePreludeStreamEvent.toCompactStreamBoundary;
  assert.deepEqual(boundary({ type: "message_start" }), {
    type: "compact_stream_boundary",
    boundary: "provider_response_start",
  });
  assert.deepEqual(
    boundary({ type: "content_block_start", index: 2, content_block: { type: "text" } }),
    {
      type: "compact_stream_boundary",
      boundary: "provider_content_block_start",
      blockType: "text",
      index: 2,
    },
  );
  assert.deepEqual(
    boundary({ type: "content_block_delta", index: 0, delta: { type: "text_delta" } }),
    {
      type: "compact_stream_boundary",
      boundary: "provider_content_block_delta",
      deltaType: "text_delta",
      index: 0,
    },
  );
  assert.deepEqual(boundary({ type: "content_block_stop", index: 3 }), {
    type: "compact_stream_boundary",
    boundary: "provider_content_block_stop",
    index: 3,
  });
  assert.deepEqual(boundary({ type: "message_delta", delta: { stop_reason: "end_turn" } }), {
    type: "compact_stream_boundary",
    boundary: "provider_stop_reason",
    present: true,
  });
  assert.deepEqual(boundary({ type: "message_delta", delta: { stop_reason: null } }), {
    type: "compact_stream_boundary",
    boundary: "provider_stop_reason",
    present: false,
  });
  assert.equal(boundary({ type: "other" }), undefined);
});

test("B40 重放安全前奏事件的判定", () => {
  const safe = isRetrySafePreludeStreamEvent;
  for (const type of [
    "start",
    "text_start",
    "text_end",
    "reasoning_start",
    "reasoning_end",
    "tool_input_start",
  ]) {
    assert.equal(safe({ type } as never), true, type);
  }
  assert.equal(safe({ type: "text_delta", text: "" } as never), true);
  assert.equal(safe({ type: "text_delta", text: "x" } as never), false);
  assert.equal(safe({ type: "reasoning_delta", text: "" } as never), true);
  assert.equal(safe({ type: "tool_call" } as never), false);
  assert.equal(safe({ type: "finish" } as never), false);
});

test("B41 compact 体失败后的重试许可", () => {
  const allows = isRetrySafePreludeStreamEvent.compactBodyFailureAllowsRetry;
  assert.equal(allows({}, false), true);
  assert.equal(allows({ code: "MODEL_STREAM_IDLE_TIMEOUT" }, true), true);
  assert.equal(allows({ code: "ECONNRESET" }, true), true);
  assert.equal(allows({ code: "econnreset" }, true), true);
  assert.equal(allows({ code: "ECONNRESET", statusCode: 500 }, true), false);
  assert.equal(allows({ code: "OTHER" }, true), false);
  assert.equal(allows({ responseHeaders: { "content-type": "text/event-stream" } }, false), false);
});

test("B42 流清理与被放弃流的关闭", async () => {
  const calls: string[] = [];
  const logger = {
    warn: (message: string) => calls.push(message),
  } as never;
  await isRetrySafePreludeStreamEvent.cleanupStreamAttempt(
    { return: async () => calls.push("return") } as never,
    async () => {
      calls.push("consume");
    },
    logger,
  );
  assert.deepEqual(calls, ["return", "consume"]);
  await isRetrySafePreludeStreamEvent.cleanupStreamAttempt(
    {
      return: async () => {
        throw new Error("return failed");
      },
    } as never,
    undefined,
    logger,
  );
  assert.equal(calls.includes("Model stream cleanup failed"), true);
  const events: unknown[] = [];
  const controller = new AbortController();
  await isRetrySafePreludeStreamEvent.closeAbandonedCompactStream({
    abortController: controller,
    attempt: 2,
    committed: true,
    context: {
      traceId: "t",
      requestId: "r",
      providerId: "p",
      modelId: "m",
      modelRequestSessionType: "main",
      transport: "sse",
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
  assert.equal(controller.signal.aborted, true);
  assert.equal((controller.signal.reason as Error).message, "Model stream consumer closed");
  const event = events[0] as Record<string, unknown>;
  assert.equal(event.type, "model_request_failed");
  assert.equal(event.reason, "cancelled");
  assert.equal(event.retryable, false);
  assert.equal(event.errorCode, "model_request_cancelled");
  assert.equal(event.message, "Model stream consumer closed");
  assert.equal(event.streamOutputCommitted, true);
});

test("B43 流式工具调用装配器（状态机）", () => {
  const assembler = new StreamingToolCallAssembler();
  const out1 = assembler.handle({
    type: "tool_input_start",
    id: "c1",
    toolName: "t",
  } as never);
  assert.equal(out1.length, 1);
  assembler.handle({ type: "tool_input_delta", id: "c1", delta: '{"a"' } as never);
  assembler.handle({ type: "tool_input_delta", id: "c1", delta: ":1}" } as never);
  const out2 = assembler.handle({ type: "tool_input_end", id: "c1" } as never);
  assert.equal(out2.length, 2);
  assert.equal((out2[1] as { type: string }).type, "tool_call");
  const committed = (out2[1] as { toolCall: { input: unknown } }).toolCall.input;
  assert.deepEqual(committed, { a: 1 });
  assert.equal(
    assembler.handle({ type: "tool_call", toolCall: { id: "c1", name: "t", input: {} } } as never)
      .length,
    0,
  );
  assembler.handle({ type: "tool_input_start", id: "c2", toolName: "u" } as never);
  assert.equal(
    assembler.handle({ type: "tool_call", toolCall: { id: "c2", name: "u", input: {} } } as never)
      .length,
    0,
  );
  const flushed = assembler.flush();
  assert.equal(flushed.length, 1);
  assert.equal((flushed[0] as { toolCall: { id: string } }).toolCall.id, "c2");
  assert.deepEqual(
    assembler.snapshotNormalizedToolCalls().map((call: { id: string }) => call.id),
    ["c1", "c2"],
  );
});

test("B44 Anthropic 兼容 fetch：请求体归一", async () => {
  const seen: unknown[] = [];
  const base: typeof globalThis.fetch = async (_input, init) => {
    const raw = init?.body;
    if (typeof raw === "string") {
      try {
        seen.push(JSON.parse(raw));
      } catch {
        seen.push(raw);
      }
    } else {
      seen.push(undefined);
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const wrapped = createAnthropicCompatFetch(base);
  await wrapped("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({
      system: "top",
      messages: [{ role: "system", content: [{ type: "text", text: "inline" }] }],
      thinking: [{ type: "thinking", text: "t" }],
      tool_results: [{ type: "tool_result", name: "n", id: "i1", input: { a: 1 } }],
    }),
  } as never);
  const body = seen[0] as Record<string, unknown>;
  assert.deepEqual(body.system, [{ type: "text", text: "top" }]);
  assert.deepEqual(body.messages, [{ role: "system", content: "inline" }]);
  assert.equal((body.thinking as { signature: string }[])[0].signature, "");
  assert.deepEqual((body.tool_results as Record<string, unknown>[])[0], {
    type: "tool_result",
    name: "n",
    id: "i1",
    input: { a: 1 },
  });
  await wrapped("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "plain" }] }),
  } as never);
  assert.deepEqual(seen[1], { messages: [{ role: "user", content: "plain" }] });
  await wrapped("https://example.invalid", { method: "POST", body: "{broken" } as never);
  assert.equal(seen[2], "{broken");
});

test("B45 Anthropic 兼容 fetch：响应侧修补", async () => {
  const jsonBase: typeof globalThis.fetch = async () =>
    new Response(JSON.stringify({ content: [{ type: "thinking", text: "t" }] }), {
      status: 200,
      headers: { "content-type": "application/json", "content-length": "44" },
    });
  const wrappedJson = createAnthropicCompatFetch(jsonBase);
  const jsonResponse = await wrappedJson("https://example.invalid", {});
  assert.equal(jsonResponse.headers.get("content-length"), null);
  const parsed = await jsonResponse.json();
  assert.equal(parsed.content[0].signature, "");
  const frames = [
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","signature":"sig"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"thinking","signature":"sig2"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"signature_delta","signature":"more"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":2,"content_block":{"type":"tool_result","name":"n","id":"i1","input":{"a":1}}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":3,"content_block":{"type":"tool_result","content":{"kept":1}}}\n\n',
    "data: [DONE]\n\n",
  ].join("");
  const sseBase: typeof globalThis.fetch = async () =>
    new Response(frames, {
      status: 200,
      headers: { "content-type": "text/event-stream", "content-length": "999" },
    });
  const wrappedSse = createAnthropicCompatFetch(sseBase);
  const sseResponse = await wrappedSse("https://example.invalid", {});
  assert.equal(sseResponse.headers.get("content-length"), null);
  const text = await sseResponse.text();
  assert.equal(text.includes("content_block_delta"), true);
  const dataLines = text
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice(6)));
  const injected = dataLines.filter(
    (payload) =>
      payload.type === "content_block_delta" && payload.delta?.type === "signature_delta",
  );
  assert.equal(injected.length, 2);
  assert.equal(injected[0].index, 0);
  assert.equal(injected[0].delta.signature, "sig");
  assert.equal(injected[1].index, 1);
  assert.equal(injected[1].delta.signature, "more");
  const toolUseFrame = dataLines.find(
    (payload) => payload.type === "content_block_start" && payload.index === 2,
  );
  assert.deepEqual(toolUseFrame.content_block, {
    type: "tool_use",
    name: "n",
    id: "i1",
    input: { a: 1 },
  });
  const toolTextFrame = dataLines.find(
    (payload) => payload.type === "content_block_start" && payload.index === 3,
  );
  assert.deepEqual(toolTextFrame.content_block, {
    type: "text",
    text: '{"kept":1}',
  });
});

test("B46 OpenAI Responses JSON 兼容", async () => {
  const base: typeof globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        items: [
          { type: "message", role: "assistant" },
          { type: "output_text", text: "hi" },
          { type: "message", id: "keep" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json", "content-length": "55" } },
    );
  const wrapped = createOpenAIResponsesJsonCompatFetch(base);
  const response = await wrapped("https://example.invalid", {});
  assert.equal(response.headers.get("content-length"), null);
  const body = await response.json();
  assert.match(body.items[0].id, /^msg_/u);
  assert.deepEqual(body.items[1].annotations, []);
  assert.equal(body.items[2].id, "keep");
  const sse: typeof globalThis.fetch = async () =>
    new Response("data: x", { status: 200, headers: { "content-type": "text/event-stream" } });
  const wrappedSse = createOpenAIResponsesJsonCompatFetch(sse);
  assert.equal(await (await wrappedSse("u", {})).text(), "data: x");
});
