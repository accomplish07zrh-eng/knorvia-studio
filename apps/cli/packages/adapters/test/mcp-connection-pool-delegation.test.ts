// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { config, fixture, rejection, status } from "./mcp-connection-pool.fixture.js";

test("creation and replacement preserve references receivers and new-before-old callback order", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease({ sessionId: " s " });
  const first = config();
  await lease.connectServer("a", first);
  const before = h.calls.length;
  const second = { ...config(), source: { kind: "plugin" as const }, command: "new" };
  const options = { workingDirectory: " raw " };
  await lease.connectServer("a", second, options);
  const order = h.calls.slice(before).map((call) => call.name);
  assert.deepEqual(order, [
    "uuid",
    "telemetry.register",
    "factory",
    "adapter.connect",
    "info",
    "telemetry.release",
    "info",
    "timer.set",
    "timer.unref",
    "telemetry.acquire",
    "info",
  ]);
  const input = h.adapter(1).input;
  assert.equal(input.config, second);
  assert.equal(input.workingDirectory, " raw ");
  const registration = h.calls.filter((call) => call.name === "telemetry.register")[1]?.args[0];
  assert.deepEqual(registration, {
    connectionId: input.connectionContext.mcpConnectionId,
    isolation: "workspace",
    serverName: "a",
    source: "plugin",
  });
  const forwarded = h.calls.filter((call) => call.name === "adapter.connect")[1]?.args;
  assert.deepEqual(forwarded, [1, "a", second, options]);
  assert.equal(forwarded?.[2], second);
  assert.equal(forwarded?.[3], options);
  const created = h.calls.slice(before).find((call) => call.name === "info");
  assert.deepEqual(created?.args, [
    "MCP pooled connection created",
    {
      ...input.connectionContext,
      event: "mcp.pool.connection.created",
      mcpServerName: "a",
      transport: "stdio",
    },
  ]);
  assert.deepEqual(pool.stats(), { activeConnections: 2, pendingCloseConnections: 1 });
});

test("registration factory and synchronous connect failure do not trigger compensating cleanup", async () => {
  for (const stage of ["register", "factory", "connect"] as const) {
    const h = await fixture();
    const reason = new Error(stage);
    if (stage === "register")
      h.telemetry.registerConnection = () => {
        h.record("telemetry.register");
        throw reason;
      };
    if (stage !== "register")
      h.options.createAdapter = function (input) {
        assert.equal(this, h.options);
        h.record("factory", input);
        if (stage === "factory") throw reason;
        const control = h.createAdapter(input);
        control.port.connectServer = () => {
          throw reason;
        };
        return control.port;
      };
    const pool = h.makePool();
    assert.equal(await rejection(pool.acquireLease().connectServer("a", config())), reason);
    assert.deepEqual(pool.stats(), { activeConnections: 0, pendingCloseConnections: 0 });
    assert.equal(h.count("telemetry.unregister"), 0);
    assert.equal(h.count("adapter.close"), 0);
    assert.equal(h.count("telemetry.acquire"), 0);
  }
  const h = await fixture();
  const reason = new Error("child failed");
  h.logger.child = () => {
    throw reason;
  };
  assert.throws(
    () => h.makePool(),
    (error) => error === reason,
  );
});

test("rejected handshakes remain reusable while a resolved failed status stays a returned object", async () => {
  const h = await fixture();
  const reason = new Error("handshake rejected");
  h.options.createAdapter = (input) => {
    const adapter = h.createAdapter(input);
    adapter.port.connectServer = async () => {
      h.record("adapter.connect");
      throw reason;
    };
    return adapter.port;
  };
  const pool = h.makePool();
  const a = pool.acquireLease();
  const b = pool.acquireLease();
  const cfg = config();
  assert.equal(await rejection(a.connectServer("a", cfg)), reason);
  assert.equal(await rejection(b.connectServer("a", cfg)), reason);
  assert.equal(h.adapters.length, 1);
  assert.equal(h.count("adapter.connect"), 1);
  assert.equal(h.count("adapter.close"), 0);
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
  const other = await fixture();
  other.options.createAdapter = (input) => {
    const adapter = other.createAdapter(input);
    adapter.connected = status("failed");
    return adapter.port;
  };
  const returned = await other.makePool().acquireLease().connectServer("failed", config());
  assert.equal(returned, other.adapter().connected);
});

test("tool and public ping forwarding use exact argument references and no snapshot", async () => {
  const h = await fixture();
  const lease = h.makePool().acquireLease();
  const missing = await rejection(lease.callTool({ serverName: "missing", toolName: "t" }));
  assert.ok(missing instanceof Error);
  assert.equal(missing.message, "MCP server is not leased by this session: missing");
  assert.equal(await lease.pingServer!("missing"), false);
  await lease.connectServer("a", config());
  const request = { serverName: "a", toolName: "t", arguments: { keep: {} } };
  const options = { timeoutMs: 123, signal: new AbortController().signal };
  const ping = { timeoutMs: 456 };
  const { callTool } = lease;
  assert.equal(await callTool(request, options), h.adapter().result);
  assert.equal(await lease.pingServer!("a", ping), true);
  const call = h.calls.find((item) => item.name === "adapter.call")?.args;
  assert.equal(call?.[1], request);
  assert.equal(call?.[2], options);
  assert.deepEqual(h.calls.find((item) => item.name === "adapter.ping")?.args, [0, "a", ping]);
  delete h.adapter().port.pingServer;
  assert.equal(await lease.pingServer!("a"), true);
  assert.equal(h.count("adapter.status"), 0);
  assert.equal(h.count("adapter.tools"), 0);
  assert.equal(h.count("telemetry.startup"), 0);
});

test("disconnect returns a timestamped shallow copy only after a successful status read", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  await lease.connectServer("a", config());
  const original = h.adapter().connected;
  const authorization = {
    type: "oauth_authorization_code" as const,
    authorizationUrl: "https://owned.invalid",
    startedAt: "old",
  };
  original.authorization = authorization;
  const reason = new Error("status failure");
  const read = h.adapter().port.status;
  h.adapter().port.status = async () => {
    throw reason;
  };
  assert.equal(await rejection(lease.disconnectServer("a")), reason);
  assert.equal(h.count("telemetry.release"), 0);
  h.adapter().port.status = read;
  const disconnected = await lease.disconnectServer("a");
  assert.notEqual(disconnected, original);
  assert.deepEqual(disconnected, {
    ...original,
    status: "disconnected",
    toolCount: 0,
    updatedAt: new Date(h.time).toISOString(),
  });
  assert.equal(disconnected?.authorization, authorization);
  assert.equal(original.status, "connected");
  assert.equal(original.toolCount, 1);
  assert.equal(h.count("date.construct"), 1);
  assert.equal(await lease.disconnectServer("a"), undefined);
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 1 });
});

test("post-install log and owner-notification failures retain their documented partial states", async () => {
  for (const stage of ["created-log", "owner"] as const) {
    const h = await fixture();
    const reason = new Error(stage);
    if (stage === "created-log") {
      const info = h.child.info;
      h.child.info = function (message, context) {
        if (message === "MCP pooled connection created") throw reason;
        info.call(this, message, context);
      };
    } else
      h.telemetry.acquireOwner = () => {
        throw reason;
      };
    const pool = h.makePool();
    const lease = pool.acquireLease();
    assert.equal(await rejection(lease.connectServer("a", config())), reason);
    assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
    const call = lease.callTool({ serverName: "a", toolName: "t" });
    if (stage === "owner") assert.equal(await call, h.adapter().result);
    else assert.ok((await rejection(call)) instanceof Error);
    await pool.close();
    assert.equal(h.count("adapter.close"), 1);
  }
});
