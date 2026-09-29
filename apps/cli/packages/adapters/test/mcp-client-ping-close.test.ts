// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import {
  httpConfig,
  instanceAt,
  objectArg,
  stdioConfig,
  withRig,
} from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

type ErrorConstructor = new (message?: string, code?: number) => Error;

test("ping returns false without an active connected client", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    assert.equal(await adapter.pingServer?.("missing"), false);
    await adapter.connectServer("off", httpConfig({ enabled: false }));
    assert.equal(await adapter.pingServer?.("off"), false);
    assert.equal(rig.seams.callsFor("sdk.client.ping").length, 0);
  });
});

test("ping uses the smaller caller and server timeout", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig({ timeoutMs: 9000 }));
    assert.equal(await adapter.pingServer?.("alpha", { timeoutMs: 123 }), true);
    assert.deepEqual(rig.seams.call("sdk.client.ping").args[0], { timeout: 123 });
  });
});

test("protocol errors and numeric-code responses prove the peer answered", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig());
    const ProtocolError = rig.retained.ProtocolError as ErrorConstructor;
    rig.seams.setHook("sdk.client.ping", async () => {
      throw new ProtocolError("remote protocol response", -32_001);
    });
    assert.equal(await adapter.pingServer?.("alpha"), true);
    rig.seams.setHook("sdk.client.ping", async () => {
      throw { code: 418 };
    });
    assert.equal(await adapter.pingServer?.("alpha"), true);
    assert.equal((await adapter.status()).alpha?.status, "connected");
  });
});

test("current ping failure disconnects but retains descriptors and transport", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "echo" }],
    }));
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig());
    const client = instanceAt(rig, "sdk.client.construct");
    rig.seams.setHook("sdk.client.ping", async () => {
      throw new Error("silence");
    });
    assert.equal(await adapter.pingServer?.("alpha"), false);
    const status = (await adapter.status()).alpha;
    assert.equal(status?.status, "disconnected");
    assert.equal(status?.failureKind, "unexpected_disconnect");
    assert.equal((await adapter.listTools()).length, 1);
    assert.equal(rig.seams.call("logger.warn").args[0], "MCP server ping failed");
    assert.equal(rig.seams.call("sdk.client.ping").receiver, client);
  });
});

test("stale ping failure cannot damage a newer generation", async () => {
  await withRig(async (rig) => {
    const gate = deferred<unknown>();
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig({ url: "https://old.test" }));
    rig.seams.setHook("sdk.client.ping", () => gate.promise);
    const ping = adapter.pingServer?.("alpha");
    await flushMicrotasks();
    await adapter.connectServer("alpha", httpConfig({ url: "https://new.test" }));
    gate.reject(new Error("old peer silent"));
    assert.equal(await ping, false);
    assert.equal((await adapter.status()).alpha?.status, "connected");
  });
});

test("onclose marks the matching generation disconnected and keeps tools", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "echo" }],
    }));
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig());
    const client = instanceAt(rig, "sdk.client.construct");
    const onclose = client.onclose as (() => void) | undefined;
    assert.equal(typeof onclose, "function");
    onclose?.call(client);
    const status = (await adapter.status()).alpha;
    assert.equal(status?.status, "disconnected");
    assert.equal(status?.error, "MCP server connection closed unexpectedly");
    assert.equal((await adapter.listTools()).length, 1);
  });
});

test("old client onclose is ignored after reconnect", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig({ url: "https://old.test" }));
    const oldClient = instanceAt(rig, "sdk.client.construct", 0);
    const oldOnclose = oldClient.onclose as (() => void) | undefined;
    await adapter.connectServer("alpha", httpConfig({ url: "https://new.test" }));
    oldOnclose?.call(oldClient);
    assert.equal((await adapter.status()).alpha?.status, "connected");
  });
});

test("stdio close orders process tree, client, transport, telemetry, and close log", async () => {
  await withRig(async (rig) => {
    rig.seams.setValue("stdio.pid", 4321);
    rig.seams.setValue("stdio.processAlive", false);
    const identity = { mcpId: "mcp-a", mcpInstanceId: "instance-a" };
    const telemetry = {
      recordProcessClosed(this: unknown, input: UnknownRecord) {
        rig.seams.invoke("telemetry.closed", this, [input]);
      },
      recordProcessStarted(this: unknown, input: UnknownRecord) {
        rig.seams.invoke("telemetry.started", this, [input]);
        return identity;
      },
    };
    const adapter = rig.adapter({
      connectionContext: { mcpConnectionId: "connection-a", mcpIsolation: "session" },
      telemetry,
    });
    await adapter.connectServer("stdio", stdioConfig());
    rig.seams.clearCalls();
    await adapter.disconnectServer("stdio");
    const order = [
      rig.seams.call("processTree.terminate").sequence,
      rig.seams.call("sdk.client.close").sequence,
      rig.seams.call("sdk.transport.close").sequence,
      rig.seams.call("telemetry.closed").sequence,
      rig.seams.callsFor("logger.info").find((call) => call.args[0] === "MCP server closed")!
        .sequence,
    ];
    assert.deepEqual(
      order,
      [...order].sort((left, right) => left - right),
    );
    assert.deepEqual(rig.seams.call("processTree.terminate").args[0], 4321);
    assert.deepEqual(rig.seams.call("telemetry.closed").args[0], { connectionId: "connection-a" });
  });
});

test("client close failure is logged and transport close is still attempted", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig());
    rig.seams.clearCalls();
    rig.seams.setHook("sdk.client.close", async () => {
      throw new Error("client close failed");
    });
    await adapter.disconnectServer("alpha");
    assert.equal(rig.seams.callsFor("sdk.transport.close").length, 1);
    const debug = rig.seams
      .callsFor("logger.debug")
      .find((call) => call.args[0] === "MCP client close failed");
    assert.ok(debug);
    assert.equal(objectArg(debug.args, 1).error, "client close failed");
  });
});

test("adapter close clears records and does not permanently fence reconnect", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectConfiguredServers({ alpha: httpConfig(), beta: httpConfig() });
    await adapter.close();
    assert.deepEqual(await adapter.status(), {});
    assert.deepEqual(await adapter.listTools(), []);
    await adapter.connectServer("alpha", httpConfig());
    assert.equal((await adapter.status()).alpha?.status, "connected");
    const closed = rig.seams
      .callsFor("logger.info")
      .find((call) => call.args[0] === "MCP adapter closed");
    assert.ok(closed);
    assert.equal(objectArg(closed.args, 1).serverCount, 2);
  });
});
