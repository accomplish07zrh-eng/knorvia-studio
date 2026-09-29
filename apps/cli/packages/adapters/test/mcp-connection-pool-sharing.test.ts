// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerConfig } from "@knorvia/contracts";
import { config, fixture, rejection } from "./mcp-connection-pool.fixture.js";

test("public surfaces are ordinary detached-call-safe objects with declared arities", async () => {
  const h = await fixture();
  assert.deepEqual(Object.keys(h.api), ["createMcpConnectionPool"]);
  assert.equal(h.api.createMcpConnectionPool.length, 1);
  const pool = h.makePool();
  assert.equal(Object.getPrototypeOf(pool), Object.prototype);
  assert.deepEqual(Object.keys(pool), ["acquireLease", "close", "stats"]);
  for (const method of Object.values(pool)) assert.equal(method.length, 0);
  const { acquireLease, stats } = pool;
  const lease = acquireLease();
  assert.equal(Object.getPrototypeOf(lease), Object.prototype);
  assert.deepEqual(Object.keys(lease), [
    "callTool",
    "close",
    "connectConfiguredServers",
    "connectServer",
    "disconnectServer",
    "listTools",
    "pingServer",
    "status",
  ]);
  const lengths: Record<string, number> = {
    callTool: 2,
    close: 0,
    connectConfiguredServers: 1,
    connectServer: 2,
    disconnectServer: 1,
    listTools: 0,
    pingServer: 2,
    status: 0,
  };
  for (const [name, method] of Object.entries(lease)) assert.equal(method.length, lengths[name]);
  const { connectServer } = lease;
  assert.equal(await connectServer("a", config()), h.adapter().connected);
  assert.deepEqual(stats(), { activeConnections: 1, pendingCloseConnections: 0 });
  assert.deepEqual(h.calls[0]?.args, [{ module: "adapters.mcp.pool" }]);
});

test("workspace sharing trims only identity and preserves initial references and raw cwd", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const first = pool.acquireLease({ leaseId: "same", sessionId: " first " });
  const second = pool.acquireLease({ leaseId: "same", sessionId: " second " });
  const cfg = config();
  const initialOptions = { workspaceIdentity: " work ", workingDirectory: " raw-cwd " };
  assert.equal(await first.connectServer(" name ", cfg, initialOptions), h.adapter().connected);
  assert.equal(
    await second.connectServer(
      " name ",
      { ...cfg },
      { workspaceIdentity: "work", workingDirectory: "other", oauthAuthorizationTimeoutMs: 77 },
    ),
    h.adapter().connected,
  );
  await first.connectServer(" name ", cfg, { workspaceIdentity: "work" });
  assert.equal(h.adapters.length, 1);
  assert.equal(h.count("uuid"), 1);
  assert.equal(h.count("telemetry.acquire"), 2);
  const input = h.adapter().input;
  assert.equal(input.config, cfg);
  assert.equal(input.workingDirectory, " raw-cwd ");
  assert.deepEqual(Object.keys(input), [
    "connectionContext",
    "config",
    "serverName",
    "workingDirectory",
  ]);
  assert.deepEqual(Object.keys(input.connectionContext), [
    "mcpConnectionId",
    "mcpIsolation",
    "workspaceKey",
  ]);
  assert.match(input.connectionContext.mcpConnectionId, /^[0-9a-f-]{36}$/);
  assert.equal(input.connectionContext.workspaceKey, "work");
  assert.deepEqual(h.calls.find((call) => call.name === "adapter.connect")?.args, [
    0,
    " name ",
    cfg,
    initialOptions,
  ]);
  const owners = h.calls
    .filter((call) => call.name === "telemetry.acquire")
    .map((call) => call.args[0]);
  assert.deepEqual(owners, [
    {
      connectionId: input.connectionContext.mcpConnectionId,
      ownerId: "1:same",
      sessionId: "first",
    },
    {
      connectionId: input.connectionContext.mcpConnectionId,
      ownerId: "2:same",
      sessionId: "second",
    },
  ]);
});

test("session scope never shares across leases but ignores later connect-option changes", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const a = pool.acquireLease({ leaseId: "", sessionId: " s " });
  const b = pool.acquireLease();
  const cfg = config("session");
  await a.connectServer("a", cfg, { workingDirectory: " first " });
  await a.connectServer("a", cfg, { workingDirectory: "second", workspaceIdentity: "different" });
  await b.connectServer("a", cfg);
  assert.equal(h.adapters.length, 2);
  assert.equal(h.count("telemetry.acquire"), 2);
  assert.deepEqual(Object.keys(h.adapter().input.connectionContext), [
    "mcpConnectionId",
    "mcpIsolation",
    "workspaceKey",
    "sessionId",
  ]);
  assert.equal(h.adapter().input.connectionContext.workspaceKey, "first");
  assert.equal(h.adapter().input.connectionContext.sessionId, "s");
  assert.deepEqual(Object.keys(h.adapter(1).input.connectionContext), [
    "mcpConnectionId",
    "mcpIsolation",
  ]);
  const owners = h.calls
    .filter((call) => call.name === "telemetry.acquire")
    .map((call) => call.args[0]);
  assert.deepEqual(owners, [
    {
      connectionId: h.adapter().input.connectionContext.mcpConnectionId,
      ownerId: "1:",
      sessionId: "s",
    },
    { connectionId: h.adapter(1).input.connectionContext.mcpConnectionId, ownerId: "2:lease" },
  ]);
});

test("workspace fallback has no path normalization and server names remain exact", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  const cfg = config();
  await lease.connectServer("a", cfg, { workspaceIdentity: " ", workingDirectory: " folder " });
  await lease.connectServer("a", cfg, { workspaceIdentity: "folder", workingDirectory: "ignored" });
  assert.equal(h.adapters.length, 1);
  await lease.connectServer("a", cfg, { workspaceIdentity: "Folder" });
  await lease.connectServer(" a", cfg, { workspaceIdentity: "Folder" });
  assert.equal(h.adapters.length, 3);
  assert.equal(h.adapter().input.connectionContext.workspaceKey, "folder");
});

test("configuration equality sorts object keys, excludes undefined and preserves array order", async () => {
  const h = await fixture();
  const lease = h.makePool().acquireLease();
  const one: McpServerConfig = {
    type: "stdio",
    command: "owned-command",
    isolation: "workspace",
    env: { B: "b", A: "a" },
    args: ["one", "two"],
  };
  const same: McpServerConfig = {
    args: ["one", "two"],
    env: { A: "a", B: "b" },
    isolation: "workspace",
    command: "owned-command",
    type: "stdio",
    enabled: undefined,
  };
  Object.defineProperty(same, "hidden", { value: 9, enumerable: false });
  Object.assign(same, { [Symbol("ignored")]: 8 });
  await lease.connectServer("a", one);
  await lease.connectServer("a", same);
  assert.equal(h.adapters.length, 1);
  await lease.connectServer("a", { ...same, args: ["two", "one"] });
  assert.equal(h.adapters.length, 2);
  await lease.connectServer("a", { ...same, env: { A: "changed", B: "b" } });
  assert.equal(h.adapters.length, 3);
});

test("stable config handling does not call toJSON and rejects BigInt before disturbing a binding", async () => {
  const h = await fixture();
  const pool = h.makePool();
  const lease = pool.acquireLease();
  const cfg = config();
  Object.assign(cfg, {
    metadata: {
      toJSON() {
        assert.fail("configuration equality must not call toJSON");
      },
      kept: 1,
    },
  });
  await lease.connectServer("a", cfg);
  const request = { serverName: "a", toolName: "owned" };
  assert.equal(await lease.callTool(request), h.adapter().result);
  const invalid = Object.assign(config(), { extra: 1n });
  assert.ok((await rejection(lease.connectServer("a", invalid))) instanceof TypeError);
  assert.equal(h.adapters.length, 1);
  assert.equal(h.count("telemetry.release"), 0);
  assert.equal(await lease.callTool(request), h.adapter().result);
  assert.deepEqual(pool.stats(), { activeConnections: 1, pendingCloseConnections: 0 });
});
