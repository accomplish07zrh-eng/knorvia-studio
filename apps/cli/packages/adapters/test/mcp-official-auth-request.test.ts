// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { fixture, rejected, rpc } from "./mcp-official-auth.fixture.js";

test("dynamic credentials merge through native Headers while correlation fields are always stripped", async () => {
  const h = await fixture();
  const credentials = {
    Authorization: "dynamic",
    "X-Extra": "one",
    "x-extra": "two",
    "X-Request-Id": "drop-dynamic",
    "x-trace-id": "drop-trace",
  };
  h.authResult = { ok: true, headers: credentials };
  const incoming = new Headers({
    Authorization: "static",
    "x-extra": "static",
    "x-owned-reserved": "drop",
    "mcp-session-id": "session",
    "mcp-protocol-version": "version",
    Accept: "application/json",
    "x-free": "keep",
  });
  const signal = AbortSignal.abort("owned cancelled signal");
  const body = rpc("tools/call", 0);
  const init: RequestInit = {
    method: "POST",
    body,
    headers: incoming,
    signal,
    redirect: "follow",
    cache: "no-store",
  };
  h.input.workspaceIdentity = "  workspace  ";
  h.input.workspacePath = "D:/owned/workspace";
  await h.create()(h.input.url, init);
  assert.deepEqual(h.event("resolve")[0], {
    mcpKey: "owned-key",
    pluginId: "owned.plugin",
    targetOrigin: "https://owned.example",
    workspaceIdentity: "  workspace  ",
    workspacePath: "D:/owned/workspace",
    signal,
  });
  assert.deepEqual(Object.keys(h.event("resolve")[0] as object), [
    "mcpKey",
    "pluginId",
    "targetOrigin",
    "workspaceIdentity",
    "workspacePath",
    "signal",
  ]);
  assert.equal(h.event("shared.summary")[0], credentials);
  const sent = h.sent().init;
  assert.notEqual(sent, init);
  assert.equal(sent.body, body);
  assert.equal(sent.signal, signal);
  assert.equal(sent.cache, "no-store");
  assert.equal(sent.redirect, "manual");
  assert.deepEqual(Object.keys(sent), Object.keys(init));
  const result = new Headers(sent.headers);
  assert.deepEqual(
    [...result],
    [
      ["accept", "application/json"],
      ["authorization", "dynamic"],
      ["mcp-protocol-version", "version"],
      ["mcp-session-id", "session"],
      ["x-extra", "two"],
      ["x-free", "keep"],
    ],
  );
  assert.equal(incoming.get("authorization"), "static");
  const reservedNames = h.calls
    .filter((call) => call.name === "shared.reserved")
    .map((call) => call.args[0]);
  assert.ok(reservedNames.includes("mcp-session-id"));
  assert.ok(reservedNames.includes("mcp-protocol-version"));
  assert.equal(reservedNames.includes("authorization"), false);
  assert.equal(reservedNames.includes("x-extra"), false);
  const log = h.log("Official MCP request sending");
  assert.equal(log.timeoutHint, "already-aborted");
  assert.equal(log.resolveDurationMs, 7);
  assert.equal(log.requestBodyBytes, Buffer.byteLength(body));
  assert.equal(log.rpcId, 0);
  assert.equal(log.mcpTraceId, "trace");
  assert.equal(Object.hasOwn(log, "spanId"), false);
});

test("Request body, headers and signal do not supplement absent init metadata", async () => {
  const h = await fixture();
  h.input.workspaceIdentity = "";
  h.input.workspacePath = "";
  const request = new Request(h.input.url, {
    method: "POST",
    body: rpc("tools/call"),
    headers: { "x-request-only": "hidden" },
    signal: AbortSignal.abort(),
  });
  await h.create()(request);
  assert.equal(request.bodyUsed, false);
  assert.equal(h.sent().resource, request);
  assert.equal(new Headers(h.sent().init.headers).has("x-request-only"), false);
  assert.deepEqual(Object.keys(h.event("resolve")[0] as object), [
    "mcpKey",
    "pluginId",
    "targetOrigin",
  ]);
  const log = h.log("Official MCP request sending");
  assert.equal(log.requestBodyBytes, undefined);
  assert.equal(Object.hasOwn(log, "requestBodyBytes"), true);
  assert.equal(Object.hasOwn(log, "rpcMethod"), false);
  assert.equal(log.timeoutHint, "none");
});

test("RPC metadata uses finite flat fields, preserves zero and empty IDs, and never logs arguments", async () => {
  const cases: { body: string; expected: Record<string, unknown> }[] = [
    {
      body: JSON.stringify({
        id: "",
        method: "initialize",
        params: {
          name: " tool ",
          arguments: { secret: "not logged" },
          _meta: { trace_id: " trace ", span_id: "span", namespaced: { trace_id: "ignore" } },
        },
      }),
      expected: {
        rpcMethod: "initialize",
        rpcId: "",
        rpcToolName: " tool ",
        mcpTraceId: " trace ",
      },
    },
    {
      body: JSON.stringify({
        id: 0,
        method: "",
        params: { name: "", _meta: { trace_id: "", span_id: 1 } },
      }),
      expected: { rpcId: 0 },
    },
    { body: JSON.stringify({ id: false, method: 7, params: [] }), expected: {} },
    {
      body: JSON.stringify({ method: "ping", params: { name: 1, _meta: [] } }),
      expected: { rpcMethod: "ping" },
    },
    ...["", "{broken", "null", "[]", "7", '"string"'].map((body) => ({ body, expected: {} })),
  ];
  for (const item of cases) {
    const h = await fixture();
    await h.create()(h.input.url + "?secret=query#fragment", { body: item.body });
    const log = h.log("Official MCP request sending");
    const metadata = Object.fromEntries(
      Object.entries(log).filter(([key]) =>
        ["rpcMethod", "rpcId", "rpcToolName", "mcpTraceId"].includes(key),
      ),
    );
    assert.deepEqual(metadata, item.expected);
    assert.equal(log.urlPath, "/mcp");
    assert.equal(JSON.stringify(log).includes("not logged"), false);
    assert.equal(JSON.stringify(log).includes("secret=query"), false);
  }
});

test("body byte count is UTF-8 for text and byteLength only for Uint8Array families", async () => {
  for (const [body, expected] of [
    ["é😃", 6],
    [new Uint8Array([1, 2, 3]), 3],
    [Buffer.from([4, 5]), 2],
    [new ArrayBuffer(5), undefined],
    [new URLSearchParams("x=y"), undefined],
    [new Blob(["blob"]), undefined],
  ] as const) {
    const h = await fixture();
    await h.create()(h.input.url, { body });
    const log = h.log("Official MCP request sending");
    assert.equal(log.requestBodyBytes, expected);
    assert.equal(Object.hasOwn(log, "requestBodyBytes"), true);
    assert.equal(Object.hasOwn(log, "rpcMethod"), false);
  }
});

test("unavailable resolver results and absent ports remain anonymous with distinct diagnostics", async () => {
  for (const reason of [
    "official_auth_unavailable",
    "official_auth_plan_required",
    "official_mcp_origin_untrusted",
  ] as const) {
    const h = await fixture();
    h.authResult = { ok: false, reason };
    await h.create()(h.input.url, { headers: { "x-free": "kept" } });
    assert.equal(h.count("authFailure"), 0);
    assert.equal(new Headers(h.sent().init.headers).has("authorization"), false);
    assert.equal(h.log("Official MCP auth headers unavailable for request").reason, reason);
    assert.deepEqual(h.event("shared.summary")[0], {});
  }
  const h = await fixture();
  h.input.authHeadersPort = undefined;
  await h.create()(h.input.url);
  assert.equal(h.count("resolve"), 0);
  const warning = h.log("Official MCP auth port unavailable for request");
  assert.equal(warning.reason, "official_auth_unavailable");
  assert.equal(Object.hasOwn(warning, "resolveDurationMs"), false);
  assert.equal(Object.hasOwn(h.log("Official MCP request sending"), "resolveDurationMs"), true);
  assert.equal(h.log("Official MCP request sending").resolveDurationMs, undefined);
});

test("sending log preserves ordered base fields, native subtraction and last shared-summary spread", async () => {
  const h = await fixture();
  const times = [20, 10, 50, 45];
  h.clock.now = () => {
    const value = times.shift();
    assert.notEqual(value, undefined);
    return value!;
  };
  h.identity.status = "owned-summary";
  h.identity.attempt = 99;
  await h.create()(h.input.url, { body: rpc() });
  const sending = h.log("Official MCP request sending");
  assert.deepEqual(Object.keys(sending), [
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
    "resolveDurationMs",
    "status",
    "timeoutHint",
    "credentialPresent",
  ]);
  assert.equal(sending.resolveDurationMs, -10);
  assert.equal(sending.status, "owned-summary");
  assert.equal(sending.attempt, 99);
  assert.equal(h.log("Official MCP response received").sendDurationMs, -5);
});

test("native header validation and retained helper errors reject before entering the network catch", async () => {
  for (const fault of ["header", "reserved", "summary"] as const) {
    const h = await fixture();
    const marker = new Error(fault);
    if (fault === "header") h.authResult = { ok: true, headers: { "bad header": "value" } };
    if (fault === "reserved")
      h.shared.isOfficialMcpReservedHeaderName = () => {
        throw marker;
      };
    if (fault === "summary") {
      h.input.logger = undefined;
      h.shared.summarizeOfficialMcpIdentityHeaders = () => {
        throw marker;
      };
    }
    const error = await rejected(h.create()(h.input.url, { headers: { "x-free": "value" } }));
    if (fault === "header") assert.ok(error instanceof TypeError);
    else assert.equal(error, marker);
    assert.equal(h.count("fetch"), 0);
    assert.equal(h.count("authFailure"), 0);
    assert.equal(
      h.calls.some((call) => call.args[0] === "Official MCP request did not complete"),
      false,
    );
  }
});
