// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import type { JSONRPCMessage } from "@modelcontextprotocol/client";
import { bounded, deferred, fixture, rejected } from "./mcp-process-boundary.fixture.js";

test("transport public surface extends the owned SDK and keeps a distinct own dispose integration descriptor", async () => {
  const h = await fixture();
  const Class = h.stdio.ProcessTreeStdioClientTransport;
  assert.deepEqual(Object.keys(h.stdio), ["ProcessTreeStdioClientTransport"]);
  assert.equal(Class.length, 1);
  assert.equal(Class.prototype.send.length, 1);
  assert.equal(Class.prototype.start.length, 0);
  assert.equal(Class.prototype.terminateWindowsJobObject.length, 0);
  assert.equal(Object.hasOwn(Class.prototype, "close"), false);
  const descriptor = Object.getOwnPropertyDescriptor(Class.prototype, "_dispose");
  assert.ok(descriptor);
  assert.equal(descriptor?.configurable, true);
  assert.equal(descriptor?.enumerable, false);
  assert.equal(descriptor?.writable, false);
  assert.equal((descriptor.value as () => Promise<void>).length, 0);
  const instance = h.transport();
  assert.ok((instance as unknown) instanceof h.OwnedSdk);
  assert.equal(instance.processExit, undefined);
  assert.equal(instance.processAlive, false);
});

test("constructor preserves server reference and captures provider while later calls use transport receiver", async () => {
  const h = await fixture();
  const server = {
    command: "owned",
    requestMetaProvider: async function (this: unknown) {
      h.record("provider", this);
      return { tag: "captured" };
    },
  };
  const transport = h.transport(server);
  assert.equal(h.events("sdk.construct")[0]?.[0], server);
  server.requestMetaProvider = async () => {
    assert.fail("replacement provider must not be captured");
  };
  const message = { jsonrpc: "2.0", id: 1, method: "tools/call" } as const;
  await transport.send(message);
  assert.equal(h.events("provider")[0]?.[0], transport);
  const sent = h.events("sdk.send")[0];
  assert.equal(sent?.[0], transport);
  assert.deepEqual(sent?.[1], { ...message, params: { _meta: { tag: "captured" } } });
  assert.equal(Object.hasOwn(message, "params"), false);
});

test("metadata runs for every message and falsy, empty or symbol-only records preserve identity", async () => {
  const symbol = Symbol("owned");
  for (const meta of [undefined, {}, { [symbol]: "symbol only" }]) {
    const h = await fixture();
    let providers = 0;
    const transport = h.transport({
      command: "owned",
      requestMetaProvider: async () => {
        providers++;
        return meta;
      },
    });
    const request: JSONRPCMessage = { jsonrpc: "2.0", method: "ping" };
    const response: JSONRPCMessage = { jsonrpc: "2.0", id: 1, result: {} };
    await transport.send(request);
    await transport.send(response);
    assert.equal(providers, 2);
    assert.equal(h.events("sdk.send")[0]?.[1], request);
    assert.equal(h.events("sdk.send")[1]?.[1], response);
  }
  const h = await fixture();
  const transport = h.transport();
  const pending = transport.send({ jsonrpc: "2.0", method: "ping" });
  assert.equal(h.count("sdk.send"), 0);
  await pending;
  assert.equal(h.count("sdk.send"), 1);
});

test("merge is shallow, preserves symbols and nested references, and replaces non-record params or meta", async () => {
  const symbol = Symbol("owned");
  const nested = { retained: true };
  for (const params of [
    { value: nested, _meta: { keep: nested, overwrite: "old", [symbol]: "old-symbol" } },
    [],
    null,
    { _meta: [] },
  ]) {
    const h = await fixture();
    const meta = { overwrite: "new", [symbol]: "new-symbol" };
    const transport = h.transport({ command: "owned", requestMetaProvider: async () => meta });
    const message = { jsonrpc: "2.0", method: "ping", params } as unknown as JSONRPCMessage;
    await transport.send(message);
    const sent = h.events("sdk.send")[0]?.[1] as {
      params: { value?: unknown; _meta: Record<PropertyKey, unknown> };
    };
    assert.notEqual(sent, message);
    assert.notEqual(sent.params, params);
    assert.notEqual(sent.params._meta, meta);
    assert.equal(sent.params._meta.overwrite, "new");
    assert.equal(sent.params._meta[symbol], "new-symbol");
    if (params && !Array.isArray(params) && "value" in params) {
      assert.equal(sent.params.value, nested);
      assert.equal(sent.params._meta.keep, nested);
      assert.ok(!Array.isArray(params._meta));
      assert.equal(params._meta.overwrite, "old");
    }
  }
});

test("provider settlement precedes message inspection and concurrent sends have no queue", async () => {
  const h = await fixture();
  const first = deferred<Record<string, unknown>>();
  const second = deferred<Record<string, unknown>>();
  let calls = 0;
  const transport = h.transport({
    command: "owned",
    requestMetaProvider: () => (++calls === 1 ? first.promise : second.promise),
  });
  const a: JSONRPCMessage = { jsonrpc: "2.0", id: 1, method: "before" };
  const b: JSONRPCMessage = { jsonrpc: "2.0", id: 2, method: "second" };
  const pendingA = transport.send(a);
  const pendingB = transport.send(b);
  assert.equal(calls, 2);
  a.method = "after";
  second.resolve({ owner: "B" });
  await bounded(pendingB, "second send");
  first.resolve({ owner: "A" });
  await bounded(pendingA, "first send");
  const sent = h.events("sdk.send").map((event) => event[1] as { id: number; method: string });
  assert.deepEqual(
    sent.map((value) => value.id),
    [2, 1],
  );
  assert.equal(sent[1]?.method, "after");
  const inherited = Object.assign(Object.create({ method: "inherited" }) as object, {
    jsonrpc: "2.0",
    id: 3,
  });
  const other = h.transport({
    command: "owned",
    requestMetaProvider: async () => ({ owned: true }),
  });
  await other.send(inherited as JSONRPCMessage);
  const inheritedSend = h.events("sdk.send")[2];
  assert.ok(inheritedSend);
  assert.deepEqual((inheritedSend[1] as { params: unknown }).params, { _meta: { owned: true } });
});

test("provider and SDK errors propagate without fallback", async () => {
  for (const phase of ["provider", "sdk"] as const) {
    const h = await fixture();
    const marker = new Error(phase);
    const transport = h.transport({
      command: "owned",
      requestMetaProvider: async () => {
        if (phase === "provider") throw marker;
        return {};
      },
    });
    h.sdk.send = async () => {
      throw marker;
    };
    assert.equal(await rejected(transport.send({ jsonrpc: "2.0", method: "ping" })), marker);
    assert.equal(h.count("sdk.send"), phase === "provider" ? 0 : 1);
  }
});
