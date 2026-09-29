// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { httpConfig, objectArg, withRig } from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

test("configured convergence keeps removed servers as disconnected snapshots", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectConfiguredServers({
      alpha: httpConfig(),
      beta: httpConfig({ url: "https://beta.test" }),
    });
    const snapshot = await adapter.connectConfiguredServers({
      beta: httpConfig({ url: "https://beta.test" }),
    });
    assert.equal(snapshot.statuses.alpha?.status, "disconnected");
    assert.equal(snapshot.statuses.beta?.status, "connected");
    assert.deepEqual(Object.keys(snapshot.statuses), ["alpha", "beta"]);
  });
});

test("configured servers launch in entry order and connect in parallel", async () => {
  await withRig(async (rig) => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    rig.seams.setHook(
      "sdk.client.connect",
      (_receiver, _transport) =>
        gates[rig.seams.callsFor("sdk.client.connect").length - 1]!.promise,
    );
    const adapter = rig.adapter();
    const pending = adapter.connectConfiguredServers({
      first: httpConfig({ url: "https://first.test" }),
      second: httpConfig({ url: "https://second.test" }),
      third: httpConfig({ url: "https://third.test" }),
    });
    await flushMicrotasks();
    assert.equal(rig.seams.callsFor("sdk.client.connect").length, 3);
    const startedNames = rig.seams
      .callsFor("logger.info")
      .filter((call) => call.args[0] === "MCP server connection started")
      .map((call) => objectArg(call.args, 1).mcpServerName);
    assert.deepEqual(startedNames, ["first", "second", "third"]);
    gates.forEach((gate) => gate.resolve());
    await pending;
  });
});

test("configured result preserves server insertion order and descriptor order", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.construct", (receiver, info) => {
      (receiver as UnknownRecord).fixtureName = (info as UnknownRecord).name;
    });
    let listing = 0;
    rig.seams.setHook("sdk.client.listTools", async () => {
      listing += 1;
      return {
        tools: [
          { inputSchema: {}, name: `tool-${listing}-a` },
          { inputSchema: {}, name: `tool-${listing}-b` },
        ],
      };
    });
    const adapter = rig.adapter();
    const result = await adapter.connectConfiguredServers({
      zeta: httpConfig(),
      alpha: httpConfig(),
    });
    assert.deepEqual(Object.keys(result.statuses), ["zeta", "alpha"]);
    assert.deepEqual(
      result.tools.map((tool) => (tool as UnknownRecord).toolName),
      ["tool-1-a", "tool-1-b", "tool-2-a", "tool-2-b"],
    );
  });
});

test("an already-connected equal config is deliberately reconnected", async () => {
  await withRig(async (rig) => {
    const config = httpConfig();
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", config);
    await adapter.connectConfiguredServers({ alpha: config });
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 2);
    assert.equal(rig.seams.callsFor("sdk.client.close").length, 1);
  });
});

test("authorized connecting work is reused only for deep-equal config", async () => {
  await withRig(async (rig) => {
    const interactive = deferred<{ status: "pending"; authorizationUrl: string }>();
    const connectError = Object.assign(new Error("authorization required"), {
      fixtureOAuthTrigger: { reason: "no_credentials" },
    });
    rig.seams.setHook("sdk.client.connect", async () => {
      throw connectError;
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
    const config = httpConfig({ oauth: { type: "authorization_code" } });
    const adapter = rig.adapter();
    const owner = adapter.connectServer("alpha", config);
    await flushMicrotasks(10);
    const authorizing = (await adapter.status()).alpha as UnknownRecord;
    assert.equal(
      (authorizing.authorization as UnknownRecord).authorizationUrl,
      "https://authorize.test",
    );
    const waiter = adapter.connectConfiguredServers({ alpha: { ...config } });
    await flushMicrotasks();
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 1);
    interactive.resolve({ authorizationUrl: "https://authorize.test", status: "pending" });
    await Promise.all([owner, waiter]);
  });
});

test("a different config supersedes authorized connecting work", async () => {
  await withRig(async (rig) => {
    const firstConnect = deferred<void>();
    rig.seams.setHook("sdk.client.connect", () => firstConnect.promise);
    const adapter = rig.adapter();
    const first = adapter.connectServer("alpha", httpConfig({ timeoutMs: 10 }));
    await flushMicrotasks();
    rig.seams.setHook("sdk.client.connect", async () => undefined);
    const second = adapter.connectConfiguredServers({ alpha: httpConfig({ timeoutMs: 11 }) });
    await second;
    firstConnect.resolve();
    await first;
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 2);
    assert.equal((await adapter.status()).alpha?.status, "connected");
  });
});

test("stale generation completion closes itself and cannot publish old tools", async () => {
  await withRig(async (rig) => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const ids = new WeakMap<object, number>();
    let created = 0;
    rig.seams.setHook("sdk.client.construct", (receiver) => ids.set(receiver as object, ++created));
    rig.seams.setHook("sdk.client.connect", (receiver) =>
      ids.get(receiver as object) === 1 ? firstGate.promise : secondGate.promise,
    );
    rig.seams.setHook("sdk.client.listTools", async (receiver) => ({
      tools: [{ inputSchema: {}, name: ids.get(receiver as object) === 1 ? "old" : "new" }],
    }));
    const adapter = rig.adapter();
    const first = adapter.connectServer("alpha", httpConfig({ url: "https://old.test" }));
    await flushMicrotasks();
    const second = adapter.connectServer("alpha", httpConfig({ url: "https://new.test" }));
    await flushMicrotasks();
    secondGate.resolve();
    await second;
    firstGate.resolve();
    await first;
    const tools = await adapter.listTools();
    assert.equal((tools[0] as UnknownRecord).toolName, "new");
    assert.ok(rig.seams.callsFor("sdk.client.close").length >= 2);
  });
});

test("configured completion reports counts after status and tools settle", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "echo" }],
    }));
    const adapter = rig.adapter();
    await adapter.connectConfiguredServers({
      on: httpConfig(),
      off: httpConfig({ enabled: false }),
    });
    const completed = rig.seams
      .callsFor("logger.info")
      .find((call) => call.args[0] === "MCP configured servers connection completed");
    assert.ok(completed);
    assert.deepEqual(objectArg(completed.args, 1), {
      durationMs: 0,
      event: "mcp.configured_servers.connect.completed",
      serverCount: 2,
      status: "completed",
      statusCounts: { connected: 1, disabled: 1 },
      toolCount: 1,
    });
  });
});
