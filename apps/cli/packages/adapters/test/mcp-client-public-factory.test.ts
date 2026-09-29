// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { httpConfig, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";
import type { McpPortLike, UnknownRecord } from "./mcp-client-harness/types.ts";

test("public factories are synchronous zero-arity entry points", async () => {
  await withRig(async (rig) => {
    assert.equal(rig.candidate.createMcpAdapter.length, 0);
    assert.equal(rig.candidate.createMcpAdapterConnectionPool.length, 0);
    const adapter = rig.candidate.createMcpAdapter();
    assert.equal(typeof adapter.status, "function");
    assert.equal(adapter instanceof Promise, false);
    assert.equal(rig.candidate.createMcpAdapterConnectionPool() instanceof Promise, false);
  });
});

test("port methods live on the prototype and require their instance receiver", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    assert.equal(Object.hasOwn(adapter, "connectServer"), false);
    assert.equal(Object.hasOwn(adapter, "callTool"), false);
    assert.equal(Object.hasOwn(adapter, "close"), false);
    const detached = adapter.status;
    await assert.rejects(() => detached.call(undefined));
  });
});

test("adapter UUID is requested before construction options are read", async () => {
  await withRig(async (rig) => {
    const observations: string[] = [];
    rig.seams.setHook("crypto.randomUUID", () => {
      observations.push("uuid");
      return "fixture-id";
    });
    const options = Object.defineProperty({}, "clientName", {
      enumerable: true,
      get() {
        observations.push("clientName");
        return "reader";
      },
    });
    rig.candidate.createMcpAdapter(options);
    assert.deepEqual(observations, ["uuid", "clientName"]);
  });
});

test("UUID failure propagates synchronously without reading options", async () => {
  await withRig((rig) => {
    let read = false;
    const boom = new Error("uuid unavailable");
    rig.seams.setHook("crypto.randomUUID", () => {
      throw boom;
    });
    const options = Object.defineProperty({}, "env", {
      get() {
        read = true;
        return {};
      },
    });
    assert.throws(() => rig.candidate.createMcpAdapter(options), boom);
    assert.equal(read, false);
  });
});

test("client defaults are nullish-only and reach the SDK constructor", async () => {
  await withRig(async (rig) => {
    const defaults = rig.adapter({ clientName: null, clientVersion: undefined });
    await defaults.connectServer("default", httpConfig());
    const defaultInfo = objectArg(rig.seams.call("sdk.client.construct", 0).args, 0);
    assert.deepEqual(defaultInfo, { name: "knorvia", version: "0.0.0" });

    const empty = rig.adapter({ clientName: "", clientVersion: "" });
    await empty.connectServer("empty", httpConfig());
    const emptyInfo = objectArg(rig.seams.call("sdk.client.construct", 1).args, 0);
    assert.deepEqual(emptyInfo, { name: "", version: "" });
  });
});

test("logger child preserves receiver and ordered connection context", async () => {
  await withRig((rig) => {
    const context = { mcpConnectionId: "c1", mcpIsolation: "session", sessionId: "s1" };
    rig.candidate.createMcpAdapter({ connectionContext: context, logger: rig.logger });
    const call = rig.seams.call("logger.child");
    assert.equal(call.receiver, rig.logger);
    assert.deepEqual(Object.keys(objectArg(call.args, 0)), [
      "mcpConnectionId",
      "mcpIsolation",
      "sessionId",
      "module",
    ]);
    assert.deepEqual(call.args[0], { ...context, module: "adapters.mcp" });
  });
});

test("logger child failure blocks construction synchronously", async () => {
  await withRig((rig) => {
    const boom = new Error("logger child failed");
    rig.seams.setHook("logger.child", () => {
      throw boom;
    });
    assert.throws(() => rig.adapter(), boom);
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 0);
  });
});

test("environment and network objects remain live references", async () => {
  await withRig(async (rig) => {
    const env: UnknownRecord = { BEFORE: "1" };
    const network = { httpProxy: "http://before" };
    const adapter = rig.adapter({ env, network });
    env.AFTER = "2";
    network.httpProxy = "http://after";
    await adapter.connectServer("alpha", httpConfig());
    const fetchOptions = objectArg(rig.seams.call("network.createFetch").args, 0);
    assert.equal(fetchOptions.env, env);
    assert.equal(fetchOptions.network, network);
    assert.equal((fetchOptions.env as UnknownRecord).AFTER, "2");
  });
});

test("pool and telemetry exports preserve retained module identity", async () => {
  await withRig((rig) => {
    assert.equal(rig.candidate.createMcpConnectionPool, rig.retained.createMcpConnectionPool);
    assert.equal(rig.candidate.createMcpTelemetryTracker, rig.retained.createMcpTelemetryTracker);
    assert.equal(rig.candidate.resolvePluginName, rig.retained.resolvePluginName);
  });
});

test("pool forwards logger and telemetry and reads live options in createAdapter", async () => {
  await withRig(async (rig) => {
    const telemetry = { marker: "telemetry" };
    const options: UnknownRecord = {
      logger: rig.logger,
      telemetry,
      workingDirectory: "D:/initial",
    };
    rig.candidate.createMcpAdapterConnectionPool(options);
    const poolOptions = objectArg(rig.seams.call("pool.create").args, 0);
    assert.equal(poolOptions.logger, rig.logger);
    assert.equal(poolOptions.telemetry, telemetry);
    options.workingDirectory = "D:/changed";
    const createAdapter = poolOptions.createAdapter as (input: UnknownRecord) => McpPortLike;
    const adapter = createAdapter({
      config: httpConfig(),
      connectionContext: { mcpConnectionId: "pool-c1", mcpIsolation: "workspace" },
      serverName: "ignored",
    });
    await adapter.connectServer("stdio", stdioConfig({ cwd: "relative" }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    assert.match(String(parameters.cwd), /changed[\\/]relative$/u);
  });
});
