// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerConfig, McpToolDescriptor } from "@knorvia/contracts";
import {
  bounded,
  config,
  deferred,
  drain,
  fixture,
  rejection,
  status,
} from "./mcp-connection-pool.fixture.js";

test("batch snapshots keep status/tool references and compute enabled startup counts once", async () => {
  const h = await fixture();
  const shared: McpToolDescriptor = { serverName: "foreign", toolName: "shared", inputSchema: {} };
  h.options.createAdapter = function (input) {
    assert.equal(this, h.options);
    const adapter = h.createAdapter(input);
    adapter.connected = status(
      input.serverName === "disabled"
        ? "disabled"
        : input.serverName === "failed"
          ? "failed"
          : "connected",
    );
    adapter.statuses[input.serverName] = adapter.connected;
    adapter.tools = [shared, shared];
    return adapter.port;
  };
  const lease = h.makePool().acquireLease({ sessionId: " session " });
  const servers: Record<string, McpServerConfig> = {
    disabled: { ...config(), enabled: false },
    stdio: config(),
    http: { type: "http", url: "https://owned.invalid", isolation: "workspace" },
    failed: config(),
  };
  const snapshot = await lease.connectConfiguredServers(servers);
  assert.deepEqual(Object.keys(snapshot), ["statuses", "tools"]);
  assert.equal(Object.getPrototypeOf(snapshot.statuses), Object.prototype);
  assert.deepEqual(Object.keys(snapshot.statuses), ["disabled", "stdio", "http", "failed"]);
  assert.equal(h.adapters.length, 4);
  for (const adapter of h.adapters)
    assert.equal(snapshot.statuses[adapter.input.serverName], adapter.connected);
  assert.equal(snapshot.tools.length, 8);
  for (const tool of snapshot.tools) assert.equal(tool, shared);
  assert.deepEqual(
    h.calls
      .filter((call) => ["adapter.status", "adapter.tools"].includes(call.name))
      .map((call) => [call.name, call.args[0]]),
    [
      ["adapter.status", 0],
      ["adapter.tools", 0],
      ["adapter.status", 1],
      ["adapter.tools", 1],
      ["adapter.status", 2],
      ["adapter.tools", 2],
      ["adapter.status", 3],
      ["adapter.tools", 3],
    ],
  );
  assert.deepEqual(h.calls.find((call) => call.name === "telemetry.startup")?.args, [
    {
      configuredCount: 3,
      connectedCount: 2,
      failedCount: 1,
      processCount: 1,
      sessionId: "session",
    },
  ]);
  await lease.status();
  await lease.listTools();
  assert.equal(h.count("telemetry.startup"), 1);
});

test("direct connections report zero configured servers and absent or throwing startup sinks consume the flag", async () => {
  for (const mode of ["present", "absent", "throws"] as const) {
    const h = await fixture();
    if (mode === "absent") h.options.telemetry = undefined;
    const reason = new Error("startup sink");
    if (mode === "throws")
      h.telemetry.recordSessionStartup = () => {
        h.record("startup-throws");
        throw reason;
      };
    const lease = h.makePool().acquireLease({ sessionId: "s" });
    await lease.connectServer("a", config());
    assert.equal(h.count("telemetry.startup"), 0);
    if (mode === "throws") assert.equal(await rejection(lease.status()), reason);
    else await lease.status();
    h.options.telemetry = h.telemetry;
    await lease.listTools();
    if (mode === "present")
      assert.deepEqual(h.calls.find((call) => call.name === "telemetry.startup")?.args, [
        { configuredCount: 0, connectedCount: 0, failedCount: 0, processCount: 0, sessionId: "s" },
      ]);
    assert.equal(h.count("telemetry.startup"), mode === "present" ? 1 : 0);
    assert.equal(h.count("startup-throws"), mode === "throws" ? 1 : 0);
    assert.equal(h.count("adapter.status"), 2);
    assert.equal(h.count("adapter.tools"), 2);
  }
});

test("snapshot status/tool errors stop serial traversal without consuming startup", async () => {
  for (const phase of ["status", "tools"] as const) {
    const h = await fixture();
    const reason = new Error(phase);
    let restore = () => {};
    h.options.createAdapter = (input) => {
      const adapter = h.createAdapter(input);
      if (input.serverName === "a") {
        if (phase === "status") {
          const original = adapter.port.status;
          adapter.port.status = async () => {
            h.record("failed.status");
            throw reason;
          };
          restore = () => {
            adapter.port.status = original;
          };
        } else {
          const original = adapter.port.listTools;
          adapter.port.listTools = async () => {
            h.record("failed.tools");
            throw reason;
          };
          restore = () => {
            adapter.port.listTools = original;
          };
        }
      }
      return adapter.port;
    };
    const lease = h.makePool().acquireLease({ sessionId: "s" });
    assert.equal(
      await rejection(lease.connectConfiguredServers({ a: config(), b: config() })),
      reason,
    );
    assert.equal(h.count("telemetry.startup"), 0);
    assert.equal(
      h.calls.some((call) => call.name === "adapter.status" && call.args[0] === 1),
      false,
    );
    restore();
    await lease.status();
    assert.equal(h.count("telemetry.startup"), 1);
  }
});

test("a rejected batch leaves other handshakes active and does not run a snapshot", async (t) => {
  const h = await fixture();
  const a = deferred<ReturnType<typeof status>>();
  const b = deferred<ReturnType<typeof status>>();
  const reason = new Error("a failed");
  h.options.createAdapter = (input) => {
    const adapter = h.createAdapter(input);
    adapter.port.connectServer = async () => {
      h.record("pending.connect", input.serverName);
      return input.serverName === "a" ? a.promise : b.promise;
    };
    return adapter.port;
  };
  const pool = h.makePool();
  const lease = pool.acquireLease({ sessionId: "s" });
  const result = lease.connectConfiguredServers({ a: config(), b: config() });
  t.after(() => {
    a.resolve(status());
    b.resolve(status());
  });
  await h.called("pending.connect", 2);
  a.reject(reason);
  assert.equal(await rejection(result), reason);
  assert.equal(h.count("adapter.status"), 0);
  assert.equal(h.count("adapter.tools"), 0);
  assert.equal(h.count("telemetry.startup"), 0);
  assert.deepEqual(pool.stats(), { activeConnections: 2, pendingCloseConnections: 0 });
  b.resolve(status());
  await drain();
  await lease.status();
  assert.equal(h.count("telemetry.startup"), 1);
});

test("snapshot iteration sees a binding appended while the first status call is waiting", async (t) => {
  const h = await fixture();
  const lease = h.makePool().acquireLease();
  await lease.connectServer("a", config());
  const gate = deferred<Record<string, ReturnType<typeof status>>>();
  h.adapter().port.status = async () => {
    h.record("status-gate");
    return gate.promise;
  };
  const result = lease.status();
  t.after(() => gate.resolve(h.adapter().statuses));
  await h.called("status-gate");
  await lease.connectServer("b", config());
  gate.resolve(h.adapter().statuses);
  const statuses = await bounded(result, "live snapshot iteration");
  assert.deepEqual(Object.keys(statuses), ["a", "b"]);
  assert.equal(statuses.a, h.adapter().connected);
  assert.equal(statuses.b, h.adapter(1).connected);
  assert.deepEqual(
    h.calls.filter((call) => call.name === "adapter.tools").map((call) => call.args[0]),
    [0, 1],
  );
});

test("later configuration batches release removed bindings but retain unchanged connections", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  const cfg = config();
  await lease.connectConfiguredServers({ a: cfg, b: cfg });
  await lease.connectServer("direct", cfg);
  const snapshot = await lease.connectConfiguredServers({ b: { ...cfg } });
  assert.deepEqual(Object.keys(snapshot.statuses), ["b"]);
  assert.equal(h.adapters.length, 3);
  assert.equal(h.count("telemetry.release"), 2);
  assert.deepEqual(pool.stats(), { activeConnections: 3, pendingCloseConnections: 2 });
  assert.equal(h.timeouts.length, 2);
});

test("startup always computes enabled/connected stages but skips processCount when telemetry is absent", async (t) => {
  for (const phase of ["type", "enabled", "connected"] as const) {
    const h = await fixture();
    h.options.telemetry = undefined;
    h.options.logger = undefined;
    const gate = deferred<Record<string, ReturnType<typeof status>>>();
    h.options.createAdapter = (input) => {
      const adapter = h.createAdapter(input);
      adapter.port.status = async () => {
        h.record("startup-gate");
        return gate.promise;
      };
      return adapter.port;
    };
    const cfg = config();
    const lease = h.makePool().acquireLease({ sessionId: "s" });
    const result = lease.connectConfiguredServers({ a: cfg });
    t.after(() => gate.resolve(h.adapter().statuses));
    await h.called("startup-gate");
    const reason = new Error(`late ${phase}`);
    let reads = 0;
    const target = phase === "connected" ? h.adapter().connected : cfg;
    const key = phase === "connected" ? "status" : phase;
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        throw reason;
      },
    });
    gate.resolve(h.adapter().statuses);
    if (phase === "type") {
      await result;
      assert.equal(reads, 0);
    } else {
      assert.equal(await rejection(result), reason);
      assert.equal(reads, 1);
    }
    await lease.status();
    assert.equal(reads, phase === "type" ? 0 : 1);
    assert.equal(h.count("telemetry.startup"), 0);
  }
});
