// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { bounded, config, deferred, fixture, rejection } from "./mcp-connection-pool.fixture.js";

test("idle release schedules once and reuse cancels the owned timer", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const a = pool.acquireLease();
  const b = pool.acquireLease();
  const cfg = config();
  await a.connectServer("a", cfg);
  await a.close();
  await a.close();
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 1 });
  assert.equal(h.timeouts.length, 1);
  assert.equal(h.timeouts[0]?.delay, 30000);
  assert.equal(h.count("timer.unref"), 1);
  await b.connectServer("a", cfg);
  assert.equal(h.timeouts[0]?.cleared, true);
  assert.equal(h.count("timer.clear"), 1);
  assert.equal(h.adapters.length, 1);
  await b.close();
  assert.equal(h.timeouts.length, 2);
  const handle = h.timeouts[1];
  assert.ok(handle);
  handle.callback();
  await h.called("telemetry.unregister");
  assert.equal(h.count("adapter.close"), 1);
  assert.deepEqual(pool.stats(), { activeConnections: 0, pendingCloseConnections: 0 });
});

test("immediate idle close is not awaited and a new connection survives the old close settling", async (t) => {
  const h = await fixture();
  h.options.idleGraceMs = 0;
  const pool = h.makePool();
  const a = pool.acquireLease();
  const cfg = config();
  await a.connectServer("a", cfg);
  const closing = deferred<void>();
  h.adapter().port.close = async () => {
    h.record("old.close");
    await closing.promise;
  };
  t.after(() => closing.resolve());
  await bounded(a.close(), "lease close does not join transport close");
  assert.equal(h.count("old.close"), 1);
  assert.deepEqual(pool.stats(), { activeConnections: 0, pendingCloseConnections: 0 });
  const b = pool.acquireLease();
  await b.connectServer("a", cfg);
  assert.equal(h.adapters.length, 2);
  closing.resolve();
  await h.called("telemetry.unregister");
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
  assert.equal(h.timeouts.length, 0);
});

test("pool close is parallel, does not join prior closes, and only forbids new leases", async (t) => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  await lease.connectServer("a", config());
  await lease.connectServer("b", config());
  const gates = [deferred<void>(), deferred<void>()];
  for (const [index, adapter] of h.adapters.entries())
    adapter.port.close = async () => {
      h.record("closing", index);
      await gates[index]!.promise;
    };
  t.after(() => {
    for (const gate of gates) gate.resolve();
  });
  const first = pool.close();
  assert.equal(h.count("closing"), 2);
  assert.deepEqual(pool.stats(), { activeConnections: 0, pendingCloseConnections: 0 });
  await bounded(pool.close(), "second close does not join first");
  assert.throws(() => pool.acquireLease(), { message: "MCP connection pool is closed" });
  assert.equal(await lease.connectServer("new", config()), h.adapter(2).connected);
  assert.equal(pool.stats().activeConnections, 1);
  await pool.close();
  assert.equal(h.count("adapter.close"), 1);
  for (const gate of gates) gate.resolve();
  await bounded(first, "first parallel closes");
  assert.equal(h.count("telemetry.unregister"), 3);
});

test("a closed lease may reconnect, but its second close does not release the new binding", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  const cfg = config();
  await lease.connectServer("a", cfg);
  await lease.close();
  await lease.connectServer("a", cfg);
  assert.equal(h.adapters.length, 1);
  await lease.close();
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
  assert.equal(h.count("telemetry.release"), 1);
  assert.equal(h.count("telemetry.acquire"), 2);
});

test("close warning and unregister failures preserve the declared exception priority", async () => {
  for (const stage of ["adapter", "closed-log", "warning", "unregister"] as const) {
    const h = await fixture();
    const pool = h.makePool();
    await pool.acquireLease().connectServer("a", config());
    const original = new Error("original close");
    const warning = new Error("warning");
    const unregister = new Error("unregister");
    if (stage !== "closed-log")
      h.adapter().port.close = async () => {
        throw original;
      };
    else {
      const info = h.child.info;
      h.child.info = function (message, context) {
        if (message === "MCP pooled connection closed") throw original;
        info.call(this, message, context);
      };
    }
    const warn = h.child.warn;
    h.child.warn = function (message, context) {
      warn.call(this, message, context);
      if (stage === "warning" || stage === "unregister") throw warning;
    };
    const remove = h.telemetry.unregisterConnection;
    h.telemetry.unregisterConnection = function (input) {
      remove.call(this, input);
      if (stage === "unregister") throw unregister;
    };
    const result = pool.close();
    if (stage === "warning") assert.equal(await rejection(result), warning);
    else if (stage === "unregister") assert.equal(await rejection(result), unregister);
    else await result;
    assert.equal(h.count("telemetry.unregister"), 1);
    assert.deepEqual(h.calls.find((call) => call.name === "warn")?.args, [
      "MCP pooled connection close failed",
      {
        ...h.adapter().input.connectionContext,
        error: original.message,
        event: "mcp.pool.connection.close.failed",
        mcpServerName: "a",
      },
    ]);
  }
});

test("close pre-try failures and lease cleanup failures preserve partial ownership", async () => {
  for (const stage of ["clock", "clear"] as const) {
    const h = await fixture();
    const pool = h.makePool();
    const lease = pool.acquireLease();
    await lease.connectServer("a", config());
    const reason = new Error(stage);
    if (stage === "clock")
      h.clock.read = () => {
        throw reason;
      };
    else {
      await lease.close();
      h.timer.clearTimeout = () => {
        throw reason;
      };
    }
    assert.equal(await rejection(pool.close()), reason);
    assert.equal(h.count("adapter.close"), 0);
    assert.equal(h.count("telemetry.unregister"), 0);
  }
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  await lease.connectServer("a", config());
  const reason = new Error("release notification");
  h.telemetry.releaseOwner = () => {
    throw reason;
  };
  assert.equal(await rejection(lease.close()), reason);
  await lease.close();
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 1 });
  assert.equal(h.timeouts.length, 0);
  assert.ok((await rejection(lease.callTool({ serverName: "a", toolName: "t" }))) instanceof Error);
});

test("unref failure retains the stored timer and later reuse can cancel it", async () => {
  const h = await fixture();
  const original = h.timer.setTimeout;
  const reason = new Error("unref");
  h.timer.setTimeout = function (...args) {
    const handle = original.apply(this, args);
    handle.unref = () => {
      throw reason;
    };
    return handle;
  };
  const pool = h.makePool();
  const lease = pool.acquireLease();
  await lease.connectServer("a", config());
  assert.equal(await rejection(lease.close()), reason);
  assert.equal(h.timeouts.length, 1);
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 1 });
  await pool.acquireLease().connectServer("a", config());
  assert.equal(h.timeouts[0]?.cleared, true);
  assert.equal(h.adapters.length, 1);
});

test("live factory and telemetry coexist with captured logger and mutable connection context", async () => {
  const h = await fixture();
  const pool = h.makePool();
  h.options.logger = undefined;
  h.options.createAdapter = function (input) {
    assert.equal(this, h.options);
    h.record("live.factory");
    input.connectionContext.workspaceKey = "adapter-note";
    return h.createAdapter(input).port;
  };
  const lease = pool.acquireLease();
  await lease.connectServer("a", config());
  assert.equal(h.count("live.factory"), 1);
  h.adapter().input.connectionContext.workspaceKey = "later-note";
  const replacement = {
    ...h.telemetry,
    releaseOwner(input: Parameters<typeof h.telemetry.releaseOwner>[0]) {
      assert.equal(this, replacement);
      h.record("live.release", input);
    },
    unregisterConnection(input: Parameters<typeof h.telemetry.unregisterConnection>[0]) {
      assert.equal(this, replacement);
      h.record("live.unregister", input);
    },
  };
  h.options.telemetry = replacement;
  await lease.close();
  await pool.close();
  assert.equal(h.count("live.release"), 1);
  assert.equal(h.count("live.unregister"), 1);
  const closed = h.calls.find(
    (call) => call.name === "info" && call.args[0] === "MCP pooled connection closed",
  );
  assert.ok(closed);
  assert.deepEqual(closed.args, [
    "MCP pooled connection closed",
    {
      ...h.adapter().input.connectionContext,
      durationMs: 0,
      event: "mcp.pool.connection.closed",
      mcpServerName: "a",
      status: "completed",
    },
  ]);
  const silent = await fixture();
  silent.options.logger = undefined;
  const other = silent.makePool();
  await other.acquireLease().connectServer("a", config());
  await other.close();
  assert.equal(silent.count("date.now"), 1);
});
