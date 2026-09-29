// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import path from "node:path";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import {
  httpConfig,
  objectArg,
  sseConfig,
  stdioConfig,
  withRig,
} from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

test("disabled connect publishes the ordered disabled shape without transport work", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    const config = httpConfig({ enabled: false });
    const status = await adapter.connectServer("off", config);
    assert.deepEqual(Object.keys(status), [
      "status",
      "transport",
      "toolCount",
      "updatedAt",
      "authorization",
      "error",
      "failureKind",
      "protocolEra",
      "serverRequestId",
    ]);
    assert.equal(status.status, "disabled");
    assert.equal(status.transport, "http");
    assert.equal(status.toolCount, 0);
    assert.equal(rig.seams.callsFor("network.createFetch").length, 0);
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 0);
  });
});

test("disabled status is committed even when the skipped log throws", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    const boom = new Error("skip audit failed");
    rig.seams.setHook("logger.info", (_receiver, message) => {
      if (message === "MCP server connection skipped") throw boom;
    });
    await assert.rejects(() => adapter.connectServer("off", httpConfig({ enabled: false })), boom);
    assert.equal((await adapter.status()).off?.status, "disabled");
  });
});

test("status and tool containers are fresh while their values remain shared", async () => {
  await withRig(async (rig) => {
    const tool = { description: "fixture", inputSchema: {}, name: "echo" };
    rig.seams.setHook("sdk.client.listTools", async () => ({ tools: [tool] }));
    const adapter = rig.adapter();
    await adapter.connectServer("alpha", httpConfig());
    const firstStatus = await adapter.status();
    const secondStatus = await adapter.status();
    const firstTools = await adapter.listTools();
    const secondTools = await adapter.listTools();
    assert.notEqual(firstStatus, secondStatus);
    assert.equal(firstStatus.alpha, secondStatus.alpha);
    assert.notEqual(firstTools, secondTools);
    assert.equal(firstTools[0], secondTools[0]);
    (firstStatus.alpha as UnknownRecord).externalMarker = "visible";
    assert.equal((await adapter.status()).alpha?.externalMarker, "visible");
  });
});

test("stdio construction preserves args, overlays env, and resolves a truthy cwd", async () => {
  await withRig(async (rig) => {
    const args = ["--fixture"];
    const env = { LOCAL: "yes" };
    rig.seams.setValue("network.stdioEnv", { BASE: "kept", LOCAL: "base" });
    const adapter = rig.adapter({
      env: { HOST: "1" },
      network: { noProxy: "example.test" },
      workingDirectory: "D:/base",
    });
    await adapter.connectServer("stdio", stdioConfig({ args, cwd: "child", env }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    assert.equal(parameters.args, args);
    assert.equal(parameters.cwd, path.resolve("D:/base", "child"));
    assert.deepEqual(parameters.env, { BASE: "kept", LOCAL: "yes" });
    assert.equal(parameters.stderr, "pipe");
    const envInput = objectArg(rig.seams.call("network.buildStdioEnv").args, 0);
    assert.deepEqual(envInput.env, { HOST: "1" });
  });
});

test("stdio without config cwd uses the per-call working directory unchanged", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter({ workingDirectory: "D:/adapter" });
    await adapter.connectServer("stdio", stdioConfig(), { workingDirectory: "D:/call" });
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    assert.equal(parameters.cwd, "D:/call");
    assert.deepEqual(parameters.args, []);
  });
});

test("HTTP and SSE keep header references and use their distinct transport ports", async () => {
  await withRig(async (rig) => {
    const headers = { "X-Fixture": "one" };
    const adapter = rig.adapter();
    await adapter.connectServer("http", httpConfig({ headers }));
    const httpOptions = objectArg(rig.seams.call("sdk.http.construct").args, 1);
    assert.equal((httpOptions.requestInit as UnknownRecord).headers, headers);
    await adapter.connectServer("sse", sseConfig({ headers }));
    const sseOptions = objectArg(rig.seams.call("sdk.sse.construct").args, 1);
    assert.equal((sseOptions.requestInit as UnknownRecord).headers, headers);
    assert.equal(rig.seams.callsFor("official.createFetch").length, 0);
  });
});

test("SDK connect and listTools each receive the full independent timeout", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("slow", httpConfig({ timeoutMs: 1234 }));
    const timeoutCalls = rig.seams.callsFor("timeout.withTimeout");
    assert.equal(timeoutCalls.length, 2);
    assert.deepEqual(
      timeoutCalls.map((call) => call.args.slice(1, 3)),
      [
        [1234, "MCP server slow connection timed out after 1234ms"],
        [1234, "MCP server slow tool listing timed out after 1234ms"],
      ],
    );
    assert.ok(rig.seams.call("sdk.client.connect").sequence < timeoutCalls[0]!.sequence);
    assert.ok(rig.seams.call("sdk.client.listTools").sequence < timeoutCalls[1]!.sequence);
  });
});

test("protocol modes and probe timeouts follow pin, legacy, SSE, and auto rules", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer(
      "pin",
      httpConfig({ protocolVersion: "2026-07-28", timeoutMs: 9.9 }),
    );
    await adapter.connectServer("legacy", httpConfig({ protocolVersion: "legacy", timeoutMs: 50 }));
    await adapter.connectServer("sse", sseConfig({ protocolVersion: "2026-07-28", timeoutMs: 0 }));
    await adapter.connectServer("auto", httpConfig({ timeoutMs: 20_000 }));
    const options = rig.seams
      .callsFor("sdk.client.construct")
      .map((call) => objectArg(call.args, 1).versionNegotiation);
    assert.deepEqual(options, [
      { mode: { pin: "2026-07-28" }, probe: { timeoutMs: 9 } },
      { mode: "legacy" },
      { mode: { pin: "2026-07-28" }, probe: { timeoutMs: 1 } },
      { mode: "auto", probe: { timeoutMs: 5000 } },
    ]);
    const modes = rig.seams
      .callsFor("logger.info")
      .filter((call) => call.args[0] === "MCP server connected")
      .map((call) => objectArg(call.args, 1).mcpVersionNegotiationMode);
    assert.deepEqual(modes, ["2026-07-28", "legacy", "2026-07-28", "auto"]);
  });
});

test("owner signal aborts the internal lifecycle while an already-aborted owner still constructs", async () => {
  await withRig(async (rig) => {
    const gate = deferred<void>();
    rig.seams.setHook("sdk.client.connect", () => gate.promise);
    const external = new AbortController();
    const adapter = rig.adapter();
    const pending = adapter.connectServer("alpha", httpConfig(), { signal: external.signal });
    await flushMicrotasks();
    const internal = rig.seams.call("timeout.withTimeout").args[3] as AbortSignal;
    assert.notEqual(internal, external.signal);
    const reason = new Error("caller stopped");
    external.abort(reason);
    assert.equal(internal.aborted, true);
    assert.equal(internal.reason, reason);
    gate.resolve();
    await pending;

    const preAborted = new AbortController();
    preAborted.abort("not-an-error");
    rig.seams.setHook("sdk.client.connect", async () => undefined);
    await adapter.connectServer("beta", httpConfig(), { signal: preAborted.signal });
    assert.equal(rig.seams.callsFor("sdk.http.construct").length, 2);
    const secondInternal = rig.seams.callsFor("timeout.withTimeout")[2]!.args[3] as AbortSignal;
    assert.equal(secondInternal.aborted, true);
    assert.equal(preAborted.signal.reason, "not-an-error");
    assert.notEqual(secondInternal.reason, preAborted.signal.reason);
    assert.ok(secondInternal.reason instanceof DOMException);
    assert.equal(secondInternal.reason.name, "AbortError");
  });
});

test("disconnect clears tools and permits a later reconnect", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "one" }],
    }));
    const adapter = rig.adapter();
    const config = httpConfig();
    await adapter.connectServer("alpha", config);
    assert.equal((await adapter.listTools()).length, 1);
    const disconnected = await adapter.disconnectServer("alpha");
    assert.equal(disconnected?.status, "disconnected");
    assert.equal((await adapter.listTools()).length, 0);
    await adapter.connectServer("alpha", config);
    assert.equal((await adapter.status()).alpha?.status, "connected");
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 2);
  });
});
