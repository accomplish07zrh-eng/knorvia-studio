// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { instanceAt, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";
import type { McpStatus, UnknownRecord } from "./mcp-client-harness/types.ts";

function authorizationFailure(): Error {
  return Object.assign(new Error("authorization required"), {
    fixtureOAuthTrigger: { reason: "no_credentials" },
  });
}

test("authorization notification replaces the status object with ordered projection fields", async () => {
  await withRig(async (rig) => {
    let initial: McpStatus | undefined;
    let authorized: McpStatus | undefined;
    let adapter: ReturnType<typeof rig.adapter>;
    rig.seams.setHook("sdk.client.connect", async () => {
      throw authorizationFailure();
    });
    rig.seams.setHook("oauth.runInteractive", async (_receiver, inputValue) => {
      const input = inputValue as UnknownRecord;
      initial = (await adapter.status()).alpha;
      const notify = input.onAuthorizationRequired as (context: UnknownRecord) => Promise<void>;
      rig.clock.advance(25);
      await notify({
        authorizationUrl: "https://authorize.test",
        redirectUrl: "http://callback",
        serverName: "alpha",
      });
      authorized = (await adapter.status()).alpha;
      return { authorizationUrl: "https://authorize.test", status: "pending" };
    });
    adapter = rig.adapter();
    await adapter.connectServer("alpha", {
      oauth: { type: "authorization_code" },
      type: "http",
      url: "https://mcp.example.test/rpc",
    });
    assert.ok(initial);
    assert.ok(authorized);
    assert.notEqual(authorized, initial);
    assert.equal(authorized.status, "connecting");
    assert.notEqual(authorized.updatedAt, initial.updatedAt);
    const projection = (authorized as UnknownRecord).authorization as UnknownRecord;
    assert.deepEqual(Object.keys(projection), ["type", "authorizationUrl", "startedAt"]);
    assert.deepEqual(projection, {
      type: "oauth_authorization_code",
      authorizationUrl: "https://authorize.test",
      startedAt: new Date().toISOString(),
    });
  });
});

test("connected and lost logs spread process identity at their respective observation times", async () => {
  await withRig(async (rig) => {
    rig.seams.setValue("stdio.pid", 777);
    rig.seams.setValue("stdio.processExit", {
      exitCode: 9,
      exitedAt: 20,
      signal: "SIGTERM",
      startedAt: 10,
    });
    const identity: UnknownRecord = { mcpId: "mcp-a", mcpInstanceId: "instance-a" };
    const telemetry = {
      recordProcessCrashed() {},
      recordProcessStarted() {
        return identity;
      },
    };
    const adapter = rig.adapter({
      connectionContext: { mcpConnectionId: "connection-a", mcpIsolation: "session" },
      telemetry,
    });
    await adapter.connectServer("stdio", stdioConfig());
    const connected = rig.seams
      .callsFor("logger.info")
      .find((call) => call.args[0] === "MCP server connected");
    assert.ok(connected);
    const connectedContext = objectArg(connected.args, 1);
    assert.equal(connectedContext.mcpId, "mcp-a");
    assert.equal(connectedContext.late, undefined);
    assert.equal(connectedContext.connectDurationMs, 0);
    assert.equal(connectedContext.listToolsDurationMs, 0);
    identity.late = "observed-on-close";
    const client = instanceAt(rig, "sdk.client.construct");
    (client.onclose as (() => void) | undefined)?.call(client);
    const lost = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server connection lost");
    assert.ok(lost);
    const lostContext = objectArg(lost.args, 1);
    assert.equal(lostContext.late, "observed-on-close");
    assert.equal(lostContext.mcpTransportPid, 777);
    assert.equal(lostContext.exitCode, 9);
    assert.equal(lostContext.signal, "SIGTERM");
  });
});

test("shared OAuth waiter timer is cleared when owner work settles first", async () => {
  await withRig(async (rig) => {
    const interactive = deferred<{ status: "authorized" }>();
    let connects = 0;
    rig.seams.setHook("sdk.client.connect", async () => {
      connects += 1;
      if (connects === 1) throw authorizationFailure();
    });
    rig.seams.setHook("oauth.runInteractive", async (_receiver, inputValue) => {
      const input = inputValue as UnknownRecord;
      const notify = input.onAuthorizationRequired as (context: UnknownRecord) => Promise<void>;
      await notify({
        authorizationUrl: "https://authorize.test",
        redirectUrl: "http://callback",
        serverName: "alpha",
      });
      return interactive.promise;
    });
    const config = {
      oauth: { type: "authorization_code" },
      type: "http",
      url: "https://mcp.example.test/rpc",
    };
    const adapter = rig.adapter();
    const owner = adapter.connectServer("alpha", config);
    await flushMicrotasks(10);
    const waiter = adapter.connectConfiguredServers(
      { alpha: { ...config } },
      { oauthAuthorizationTimeoutMs: 100 },
    );
    await flushMicrotasks();
    assert.equal(rig.clock.tasks.size, 1);
    interactive.resolve({ status: "authorized" });
    await Promise.all([owner, waiter]);
    assert.equal(rig.clock.tasks.size, 0);
  });
});
