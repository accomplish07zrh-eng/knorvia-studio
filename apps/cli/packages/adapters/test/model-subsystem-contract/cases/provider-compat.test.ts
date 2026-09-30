// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

test("OpenAI Responses JSON compatibility fills only missing ids and annotations", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/openai-responses-json-compat")>(
    "openai-responses-json-compat",
  );
  const payload = {
    id: "response-1",
    output: [
      { content: [{ text: "hello", type: "output_text" }], role: "assistant", type: "message" },
      {
        id: "keep",
        content: [{ annotations: [{ type: "citation" }], text: "world", type: "output_text" }],
        type: "message",
      },
    ],
  };
  const fetch = module.createOpenAIResponsesJsonCompatFetch(
    async () =>
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
  );
  const result = (await (await fetch("https://provider.invalid")).json()) as typeof payload;
  const filledId = result.output[0]?.id;
  assert.equal(typeof filledId, "string");
  assert.ok((filledId?.length ?? 0) > 0);
  assert.deepEqual(Reflect.get(result.output[0]?.content[0] ?? {}, "annotations"), []);
  assert.equal(result.output[1]?.id, "keep");
  assert.deepEqual(result.output[1]?.content[0]?.annotations, [{ type: "citation" }]);
});

test("OpenAI compatibility passes SSE and non-success responses through byte-for-byte", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/openai-responses-json-compat")>(
    "openai-responses-json-compat",
  );
  for (const fixture of [
    {
      body: 'data: {"type":"response.completed"}\n\n',
      contentType: "text/event-stream",
      status: 200,
    },
    { body: '{"error":{"message":"bad"}}', contentType: "application/json", status: 400 },
  ]) {
    const fetch = module.createOpenAIResponsesJsonCompatFetch(
      async () =>
        new Response(fixture.body, {
          headers: { "content-type": fixture.contentType },
          status: fixture.status,
        }),
    );
    const response = await fetch("https://provider.invalid");
    assert.equal(response.status, fixture.status);
    assert.equal(await response.text(), fixture.body);
  }
});

test("Anthropic compatibility repairs plain system wire shape without mutating the caller body", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/anthropic-stream-compat")>(
      "anthropic-stream-compat",
    );
  const bodies: unknown[] = [];
  const fetch = module.createAnthropicCompatFetch(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    bodies.push(JSON.parse(await request.text()));
    return new Response(
      JSON.stringify({ content: [], id: "message", role: "assistant", type: "message" }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  });
  const body = {
    max_tokens: 20,
    messages: [
      { content: [{ text: "before", type: "text" }], role: "user" },
      { content: [{ text: "plain system", type: "text" }], role: "system" },
      { content: [{ text: "after", type: "text" }], role: "user" },
    ],
    model: "claude-test",
  };
  await fetch("https://provider.invalid/v1/messages", {
    body: JSON.stringify(body),
    method: "POST",
  });
  assert.ok(Array.isArray(body.messages[1]?.content));
  const outgoing = bodies[0] as { messages?: { content?: unknown; role?: unknown }[] };
  assert.equal(outgoing.messages?.[1]?.role, "system");
  assert.equal(outgoing.messages?.[1]?.content, "plain system");
});

test("Anthropic SSE compatibility repairs start-only signatures and nonstandard tool results", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/anthropic-stream-compat")>(
      "anthropic-stream-compat",
    );
  const source = [
    "event: content_block_start",
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":"sig-start"}}',
    "",
    "event: content_block_start",
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_result","tool_use_id":"tool-1","content":"ok"}}',
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hidden"}}',
    "",
    "event: content_block_stop",
    'data: {"type":"content_block_stop","index":1}',
    "",
  ].join("\n");
  const fetch = module.createAnthropicCompatFetch(
    async () =>
      new Response(source, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
  );
  const transformed = await (await fetch("https://provider.invalid")).text();
  assert.match(transformed, /signature_delta|sig-start/u);
  assert.doesNotMatch(transformed, /"type":"tool_result"/u);
});

test("provider business fetch parses bounded JSON without Content-Type and preserves response facts", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  seams.transport.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 1302,
        error: { code: 1302, message: "busy", request_id: "provider-request" },
        extra: "visible",
      }),
      { headers: { "retry-after": "3", "x-request-id": "header-request" }, status: 429 },
    );
  const fetch = module.createProviderBusinessErrorFetch({
    providerId: "provider-test",
    providerKind: "openai-compatible",
  });
  await assert.rejects(fetch("https://provider.invalid"), (error) => {
    assert.equal(module.isProviderBusinessError(error), true);
    const business = error as import("@target/model-execution").ProviderBusinessError;
    assert.equal(business.providerCode, 1302);
    assert.equal(business.providerMessage, "busy");
    assert.equal(business.providerRequestId, "provider-request");
    assert.equal(business.responseStatus, 429);
    assert.equal(business.responseHeaders?.["retry-after"], "3");
    return true;
  });
});

test("business body inspection is object-only, bounded, and limits retained keys/messages", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/model-execution")>("model-execution");
  assert.equal(module.readProviderBusinessFailureFromBody("[]"), undefined);
  assert.equal(
    module.readProviderBusinessFailureFromBody(`{"code":1302,"pad":"${"x".repeat(64_001)}"}`),
    undefined,
  );
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`key${index}`, index]));
  const result = module.readProviderBusinessFailureFromBody({
    code: "1302",
    error: { code: "1302", message: "m".repeat(1_200), ...many },
    ...many,
  });
  assert.ok(result);
  assert.equal(result.providerCode, "1302");
  assert.equal((result.providerMessage ?? "").length, 1_000);
  assert.ok(Object.keys(result.responseBodySummary).length <= 25);
});

test("finish business errors are detected before success normalization", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/provider-finish-business-error")>(
    "provider-finish-business-error",
  );
  const failed = module.detectProviderBusinessFinishError({
    providerId: "provider-test",
    providerKind: "openai-compatible",
    source: { code: 1302, message: "capacity", success: false, type: "finish" },
  });
  assert.ok(failed);
  assert.equal(failed.providerCode, "1302");
  assert.equal(failed.providerMessage, "capacity");
  assert.equal(
    module.detectProviderBusinessFinishError({
      providerId: "provider-test",
      providerKind: "openai-compatible",
      source: { finishReason: "stop", success: true },
    }),
    undefined,
  );
});
