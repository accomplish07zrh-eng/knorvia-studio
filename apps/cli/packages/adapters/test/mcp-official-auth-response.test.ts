// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import type { McpServerFailureKind } from "@knorvia/shared";
import {
  bounded,
  deferred,
  fixture,
  jsonResponse,
  ownedResponse,
  rejected,
  rpc,
  type ResponseInfo,
} from "./mcp-official-auth.fixture.js";

test("finite non-call diagnostic priorities preserve numeric codes, JSON-RPC shape and HTTP fallback", async () => {
  const cases: {
    status: number;
    value: unknown;
    kind?: McpServerFailureKind;
    contentType?: string;
  }[] = [
    { status: 429, value: { code: 3001 }, kind: "rate_limited" },
    { status: 503, value: { code: 1000 }, kind: "server_internal_error" },
    {
      status: 200,
      value: { code: 3001, jsonrpc: "2.0", error: { code: 1006 } },
      kind: "server_not_found",
    },
    { status: 200, value: { code: 1000 }, kind: "server_unavailable" },
    { status: 200, value: { jsonrpc: "2.0", error: { code: 1006 } }, kind: "not_authenticated" },
    { status: 200, value: { jsonrpc: "2.0", error: { code: 3101 } }, kind: "coding_plan_required" },
    ...[null, "error", [], { code: "1006" }, { code: 42 }].map((error) => ({
      status: 200,
      value: { jsonrpc: "2.0", error },
      kind: "protocol_error" as const,
    })),
    { status: 200, value: { code: "3001" } },
    { status: 200, value: { result: { isError: true } } },
    { status: 400, value: { code: "1000" }, kind: "connection_failed" },
    { status: 200, value: [], contentType: "application/problem+JSON" },
    { status: 404, value: "text", kind: "connection_failed", contentType: "text/plain" },
  ];
  for (const item of cases) {
    const h = await fixture();
    const response = jsonResponse(item.value, item.status);
    if (item.contentType) response.headers.set("content-type", item.contentType);
    h.respond(response);
    assert.equal(await h.create()(h.input.url, { body: rpc() }), response);
    if (item.kind)
      assert.equal((h.event("serverResponse")[0] as ResponseInfo).failureKind, item.kind);
    else assert.equal(h.count("serverResponse"), 0);
    assert.equal(h.count("authFailure"), 0);
  }
});

test("tools/call bypasses all diagnostic reads but still reports trimmed server IDs before logs", async () => {
  for (const status of [429, 500, 200]) {
    const h = await fixture();
    const owned = ownedResponse(status, {
      "content-type": "application/json",
      "x-request-id": "  server-id  ",
    });
    owned.response.clone = () => {
      assert.fail("tools/call must not clone a response");
    };
    h.respond(owned.response);
    const response = await h.create()(h.input.url, { body: rpc("tools/call") });
    assert.equal(response, owned.response);
    assert.deepEqual(h.event("serverResponse")[0], {
      httpStatus: status,
      serverRequestId: "server-id",
      rpcMethod: "tools/call",
      rpcToolName: "owned-tool",
      spanId: "span",
      traceId: "trace",
    });
    const notice = h.calls.findIndex((call) => call.name === "serverResponse");
    const outcome = h.calls.findIndex(
      (call) =>
        call.args[0] ===
        (status === 200 ? "Official MCP response received" : "Official MCP response failed"),
    );
    assert.ok(notice < outcome);
    assert.deepEqual(owned.trace, []);
  }
});

test("response notification and outcome preserve own field order, ID source and native numeric lengths", async () => {
  const h = await fixture();
  const response = jsonResponse({ code: 3001 }, 200, {
    "x-request-id": " chosen ",
    "x-trace-id": "not-an-id",
    "content-length": "-2.5",
  });
  h.respond(response);
  await h.create()(h.input.url, { body: rpc() });
  const notice = h.event("serverResponse")[0] as ResponseInfo;
  assert.deepEqual(Object.keys(notice), [
    "httpStatus",
    "failureKind",
    "serverRequestId",
    "rpcMethod",
    "rpcToolName",
    "spanId",
    "traceId",
  ]);
  assert.equal(notice.serverRequestId, "chosen");
  assert.equal(Object.hasOwn(notice, "attempt"), false);
  const outcome = h.log("Official MCP response received");
  assert.deepEqual(Object.keys(outcome), [
    "event",
    "mcpKey",
    "mcpServerName",
    "module",
    "requestBodyBytes",
    "urlPath",
    "rpcMethod",
    "rpcId",
    "rpcToolName",
    "mcpTraceId",
    "attempt",
    "httpStatus",
    "responseBodyBytes",
    "sendDurationMs",
    "serverRequestId",
    "status",
  ]);
  assert.equal(outcome.responseBodyBytes, -2.5);
  for (const [header, expected] of [
    ["3.5", 3.5],
    ["NaN", undefined],
    ["Infinity", undefined],
    ["", undefined],
  ] as const) {
    const other = await fixture();
    other.respond(
      new Response(null, { headers: { "content-length": header, "x-trace-id": "ignored" } }),
    );
    await other.create()(other.input.url);
    const log = other.log("Official MCP response received");
    assert.equal(log.responseBodyBytes, expected);
    assert.equal(Object.hasOwn(log, "responseBodyBytes"), true);
    assert.equal(other.count("serverResponse"), 0);
  }
});

test("byte budget is inclusive and declared overflow avoids cloning while streaming overflow cancels only the reader", async () => {
  const core = Buffer.from('{"code":3001}');
  for (const mode of ["declared", "exact", "streamed"] as const) {
    const h = await fixture();
    const size = mode === "streamed" ? 65537 : 65536;
    const payload = Buffer.concat([core, Buffer.alloc(size - core.length, 32)]);
    const owned = ownedResponse(
      200,
      {
        "content-type": "application/json",
        "content-length": mode === "declared" ? "65537" : String(size),
      },
      [payload],
    );
    if (mode === "streamed") owned.response.headers.delete("content-length");
    h.respond(owned.response);
    assert.equal(await h.create()(h.input.url), owned.response);
    if (mode === "declared") {
      assert.deepEqual(owned.trace, []);
      assert.equal(h.count("serverResponse"), 0);
    } else if (mode === "exact") {
      assert.deepEqual(owned.trace, ["clone", "getReader", "read", "read", "reader.release"]);
      assert.equal((h.event("serverResponse")[0] as ResponseInfo).failureKind, "server_not_found");
    } else {
      assert.deepEqual(owned.trace, [
        "clone",
        "getReader",
        "read",
        "reader.cancel",
        "reader.release",
      ]);
      assert.equal(h.count("serverResponse"), 0);
    }
  }
});

test("stream decoder handles split UTF-8 BOM, malformed JSON and empty or absent clone bodies", async () => {
  const h = await fixture();
  const encoded = Buffer.from('\ufeff{"code":1000}');
  const owned = ownedResponse(200, { "content-type": "application/json" }, [
    encoded.subarray(0, 1),
    encoded.subarray(1, 2),
    encoded.subarray(2),
  ]);
  h.respond(owned.response);
  await h.create()(h.input.url);
  assert.equal((h.event("serverResponse")[0] as ResponseInfo).failureKind, "server_unavailable");
  assert.equal(owned.reader.releases, 1);
  for (const text of ["", "{bad", "null", "[]"]) {
    const other = await fixture();
    const sample = ownedResponse(400, { "content-type": "json" }, [Buffer.from(text)]);
    other.respond(sample.response);
    await other.create()(other.input.url);
    assert.equal(
      (other.event("serverResponse")[0] as ResponseInfo).failureKind,
      "connection_failed",
    );
    assert.equal(sample.reader.releases, 1);
  }
  const other = await fixture();
  const noBody = ownedResponse(200, { "content-type": "json" });
  noBody.response.clone = () => new Response(null);
  other.respond(noBody.response);
  await other.create()(other.input.url);
  assert.equal(other.count("serverResponse"), 0);
});

test("reader failures stay transport-phase errors and releaseLock can replace read or cancel failures", async () => {
  for (const phase of ["clone", "read", "cancel", "release"] as const) {
    const h = await fixture();
    const marker = new Error(phase);
    const sample = ownedResponse(200, { "content-type": "json" }, [new Uint8Array(65537)]);
    if (phase === "clone")
      sample.response.clone = () => {
        throw marker;
      };
    if (phase === "read")
      sample.reader.read = async () => {
        throw marker;
      };
    if (phase === "cancel")
      sample.reader.cancel = async () => {
        throw marker;
      };
    if (phase === "release") {
      sample.reader.read = async () => {
        throw new Error("earlier read");
      };
      sample.reader.releaseLock = () => {
        throw marker;
      };
    }
    h.respond(sample.response);
    assert.equal(await rejected(h.create()(h.input.url)), marker);
    assert.equal(h.count("authFailure"), 0);
    assert.equal(h.count("serverResponse"), 0);
    assert.equal(h.log("Official MCP request did not complete").error, phase);
    if (phase === "clone") assert.equal(sample.reader.releases, 0);
    if (phase === "read" || phase === "cancel") assert.equal(sample.reader.releases, 1);
  }
});

test("diagnostic reader has no active signal cancellation and waits for its owned read result", async () => {
  const h = await fixture();
  const sample = ownedResponse(200, { "content-type": "json" });
  const gate = deferred<ReadableStreamReadResult<Uint8Array>>();
  const entered = deferred<void>();
  sample.reader.read = () => {
    entered.resolve();
    return gate.promise;
  };
  h.respond(sample.response);
  const controller = new AbortController();
  let settled = false;
  const pending = h
    .create()(h.input.url, { signal: controller.signal })
    .finally(() => {
      settled = true;
    });
  await bounded(entered.promise, "reader entered");
  controller.abort();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(sample.reader.cancels, 0);
  gate.resolve({ done: true, value: undefined });
  assert.equal(await bounded(pending, "reader completed"), sample.response);
  assert.equal(sample.reader.releases, 1);
});
