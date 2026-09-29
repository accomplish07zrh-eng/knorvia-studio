// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import {
  bounded,
  config,
  deferred,
  fixture,
  rejection,
  status,
} from "./mcp-connection-pool.fixture.js";

test("connecting disabled and untrusted observations do not ping or reconnect", async () => {
  for (const kind of ["connecting", "disabled", "untrusted"] as const) {
    const h = await fixture();
    const lease = h.makePool().acquireLease();
    const cfg = config();
    await lease.connectServer("a", cfg);
    h.adapter().statuses.a = status(kind);
    assert.equal(await lease.connectServer("a", cfg, { revalidate: true }), h.adapter().connected);
    assert.equal(h.count("adapter.status"), 1);
    assert.equal(h.count("adapter.ping"), 0);
    assert.equal(h.count("adapter.connect"), 1);
    assert.equal(h.count("debug"), 0);
    assert.equal(h.count("warn"), 0);
  }
});

test("connected ping missing and nullish means alive while false reconnects", async () => {
  for (const mode of ["missing", "undefined", "false"] as const) {
    const h = await fixture();
    const lease = h.makePool().acquireLease();
    const cfg = config();
    await lease.connectServer("a", cfg);
    if (mode === "missing") delete h.adapter().port.pingServer;
    else
      h.adapter().port.pingServer = async function (...args) {
        assert.equal(this, h.adapter().port);
        h.record("adapter.ping", ...args);
        return mode === "false" ? false : (undefined as unknown as boolean);
      };
    assert.equal(await lease.connectServer("a", cfg, { revalidate: true }), h.adapter().connected);
    assert.equal(h.count("adapter.connect"), mode === "false" ? 2 : 1);
    assert.equal(h.count("debug"), mode === "false" ? 0 : 1);
    assert.equal(h.count("warn"), mode === "false" ? 1 : 0);
    if (mode !== "missing")
      assert.deepEqual(h.calls.find((call) => call.name === "adapter.ping")?.args, ["a"]);
  }
});

test("concurrent revalidation shares one status ping and reconnect with the initiating options", async (t) => {
  const h = await fixture();
  const pool = h.makePool();
  const a = pool.acquireLease();
  const b = pool.acquireLease();
  const c = pool.acquireLease();
  const cfg = config();
  await a.connectServer("a", cfg);
  const ping = deferred<boolean>();
  const updated = { ...status(), toolCount: 8 };
  h.adapter().port.pingServer = async function (...args) {
    assert.equal(this, h.adapter().port);
    h.record("ping-gate", ...args);
    return ping.promise;
  };
  h.adapter().port.connectServer = async function (...args) {
    assert.equal(this, h.adapter().port);
    h.record("reconnect", ...args);
    return updated;
  };
  const firstOptions = { revalidate: true, oauthAuthorizationTimeoutMs: 123 };
  const secondOptions = { revalidate: true, oauthAuthorizationTimeoutMs: 456 };
  const first = b.connectServer("a", cfg, firstOptions);
  const second = c.connectServer("a", { ...cfg }, secondOptions);
  t.after(() => ping.resolve(false));
  await h.called("ping-gate");
  assert.equal(h.count("adapter.status"), 1);
  assert.equal(h.count("ping-gate"), 1);
  assert.equal(h.count("reconnect"), 0);
  ping.resolve(false);
  const results = await bounded(Promise.all([first, second]), "shared revalidation");
  assert.equal(results[0], updated);
  assert.equal(results[1], updated);
  assert.equal(h.count("reconnect"), 1);
  const args = h.calls.find((call) => call.name === "reconnect")?.args;
  assert.equal(args?.[1], cfg);
  assert.equal(args?.[2], firstOptions);
  assert.equal(h.count("telemetry.acquire"), 3);
});

test("old handshake rejection bypasses status and a rejected reconnect becomes the current result", async () => {
  const h = await fixture();
  const oldError = new Error("old handshake");
  const newError = new Error("new handshake");
  h.options.createAdapter = (input) => {
    const adapter = h.createAdapter(input);
    adapter.port.connectServer = async () => {
      throw oldError;
    };
    return adapter.port;
  };
  const lease = h.makePool().acquireLease();
  const cfg = config();
  assert.equal(await rejection(lease.connectServer("a", cfg)), oldError);
  h.adapter().port.connectServer = async () => {
    h.record("reconnect");
    throw newError;
  };
  assert.equal(await rejection(lease.connectServer("a", cfg, { revalidate: true })), newError);
  assert.equal(await rejection(lease.connectServer("a", cfg)), newError);
  assert.equal(h.count("adapter.status"), 0);
  assert.equal(h.count("reconnect"), 1);
  const warning = h.calls.find((call) => call.name === "warn");
  assert.ok(warning);
  assert.deepEqual(warning.args, [
    "MCP pooled connection is stale; reconnecting",
    {
      ...h.adapter().input.connectionContext,
      event: "mcp.pool.connection.stale",
      mcpConnectionState: "unknown",
      mcpServerName: "a",
      status: "started",
    },
  ]);
  h.adapter().port.connectServer = async () => h.adapter().connected;
  assert.equal(await lease.connectServer("a", cfg, { revalidate: true }), h.adapter().connected);
});

test("status and ping errors do not reconnect and preserve the already-added owner", async () => {
  for (const phase of ["status", "ping"] as const) {
    const h = await fixture();
    const pool = h.makePool();
    const a = pool.acquireLease();
    const b = pool.acquireLease();
    const cfg = config();
    await a.connectServer("a", cfg);
    const reason = new Error(phase);
    const oldStatus = h.adapter().port.status;
    const oldPing = h.adapter().port.pingServer;
    if (phase === "status")
      h.adapter().port.status = async () => {
        throw reason;
      };
    else
      h.adapter().port.pingServer = async () => {
        throw reason;
      };
    assert.equal(await rejection(b.connectServer("a", cfg, { revalidate: true })), reason);
    assert.equal(h.count("adapter.connect"), 1);
    assert.equal(h.count("warn"), 0);
    await a.close();
    assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
    assert.equal(h.count("telemetry.acquire"), 1);
    h.adapter().port.status = oldStatus;
    h.adapter().port.pingServer = oldPing;
    assert.equal(await b.connectServer("a", cfg, { revalidate: true }), h.adapter().connected);
    assert.equal(h.count("telemetry.acquire"), 1);
  }
});

test("synchronous reconnect throw retains old promise and close does not fence a pending revalidation", async (t) => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  const cfg = config();
  await lease.connectServer("a", cfg);
  const reason = new Error("sync reconnect");
  h.adapter().statuses.a = status("failed");
  h.adapter().port.connectServer = () => {
    throw reason;
  };
  assert.equal(await rejection(lease.connectServer("a", cfg, { revalidate: true })), reason);
  assert.equal(await lease.connectServer("a", cfg), h.adapter().connected);
  h.adapter().statuses.a = h.adapter().connected;
  const ping = deferred<boolean>();
  h.adapter().port.pingServer = async () => {
    h.record("ping-gate");
    return ping.promise;
  };
  h.adapter().port.connectServer = async () => {
    h.record("after-close-reconnect");
    return h.adapter().connected;
  };
  const reconnect = lease.connectServer("a", cfg, { revalidate: true });
  t.after(() => ping.resolve(false));
  await h.called("ping-gate");
  await pool.close();
  assert.equal(h.count("adapter.close"), 1);
  ping.resolve(false);
  assert.equal(await bounded(reconnect, "unfenced revalidation"), h.adapter().connected);
  assert.equal(h.count("after-close-reconnect"), 1);
  assert.deepEqual(pool.stats(), { activeConnections: 0, pendingCloseConnections: 0 });
  assert.throws(() => pool.acquireLease(), { message: "MCP connection pool is closed" });
});
