// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { connectHttp, httpConfig, objectArg, withRig } from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

test("tool call rejects before the attempt boundary when no server is connected", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await assert.rejects(
      () => adapter.callTool({ serverName: "missing", toolName: "echo" }),
      /MCP server is not connected: missing/u,
    );
    assert.equal(rig.seams.callsFor("logger.warn").length, 0);
    assert.equal(rig.seams.callsFor("sdk.client.callTool").length, 0);
  });
});

test("tool caller waits for existing connecting work without becoming its owner", async () => {
  await withRig(async (rig) => {
    const gate = deferred<void>();
    rig.seams.setHook("sdk.client.connect", () => gate.promise);
    const adapter = rig.adapter();
    const connecting = adapter.connectServer("alpha", httpConfig());
    await flushMicrotasks();
    const caller = new AbortController();
    const tool = adapter.callTool(
      { serverName: "alpha", toolName: "echo" },
      { signal: caller.signal, timeoutMs: 800 },
    );
    await flushMicrotasks();
    assert.equal(rig.seams.callsFor("timeout.waitDeadline").length, 1);
    assert.equal(
      rig.seams
        .callsFor("logger.warn")
        .some((call) => call.args[0] === "MCP server reconnecting after lost connection"),
      false,
    );
    caller.abort(new Error("waiter left"));
    const ownerSignal = rig.seams.call("timeout.withTimeout").args[3] as AbortSignal;
    assert.equal(ownerSignal.aborted, false);
    gate.resolve();
    await connecting;
    await tool;
  });
});

test("a disconnected server is reconnected within the original tool deadline", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig, { timeoutMs: 700 });
    await adapter.disconnectServer("alpha");
    rig.seams.clearCalls();
    await adapter.callTool({ serverName: "alpha", toolName: "echo" }, { timeoutMs: 222 });
    assert.equal(rig.seams.callsFor("timeout.createDeadline").length, 1);
    assert.equal(rig.seams.call("timeout.createDeadline").args[0], 222);
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 1);
    assert.ok(rig.seams.callsFor("timeout.waitDeadline").length >= 1);
    assert.equal(
      rig.seams
        .callsFor("logger.warn")
        .filter((call) => call.args[0] === "MCP server reconnecting after lost connection").length,
      1,
    );
  });
});

test("SDK tool call preserves arguments and enables progress timeout reset", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig, { timeoutMs: 900 });
    const args = { zeta: 1, alpha: 2 };
    const controller = new AbortController();
    await adapter.callTool(
      { arguments: args, serverName: "alpha", toolName: "echo" },
      { signal: controller.signal, timeoutMs: 321 },
    );
    const call = rig.seams.call("sdk.client.callTool");
    const params = objectArg(call.args, 0);
    const options = objectArg(call.args, 1);
    assert.equal(params.arguments, args);
    assert.deepEqual(Object.keys(params), ["name", "arguments"]);
    assert.deepEqual(options, {
      signal: controller.signal,
      timeout: 321,
      resetTimeoutOnProgress: true,
    });
    const started = rig.seams
      .callsFor("logger.debug")
      .find((entry) => entry.args[0] === "MCP tool call started");
    assert.ok(started);
    assert.deepEqual(objectArg(started.args, 1).argumentKeys, ["alpha", "zeta"]);
  });
});

test("request context metadata has the contracted keys and shared nested reference", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    await adapter.callTool({
      clientMode: "desktop",
      deliveryKind: "interactive",
      remoteSessionId: "remote-1",
      runtimeScope: "subagent",
      serverName: "alpha",
      toolName: "echo",
      trace: {
        attributes: { ignored: true },
        parentId: "ignored",
        parentSpanId: "parent",
        queryId: "ignored",
        sessionId: "session",
        spanId: "span",
        traceId: "trace",
        turnId: "trace-turn",
      },
      turnId: "request-turn",
      workspaceIdentity: "identity",
      workspaceKey: "workspace-key",
      workspacePath: "D:/workspace",
    });
    const params = objectArg(rig.seams.call("sdk.client.callTool").args, 0);
    const meta = params._meta as UnknownRecord;
    const context = meta["com.knorvia-studio/request-context"] as UnknownRecord;
    assert.deepEqual(Object.keys(context), [
      "trace_id",
      "span_id",
      "parent_span_id",
      "session_id",
      "turn_id",
      "runtime_scope",
      "workspace_path",
      "workspace_identity",
      "workspace_key",
      "remote_session_id",
      "client_mode",
      "delivery_kind",
    ]);
    assert.equal(meta["com.knorvia-studio/request-context"], context);
    for (const [key, value] of Object.entries(context)) assert.equal(meta[key], value);
    assert.equal(context.turn_id, "trace-turn");
    assert.equal(meta.query_id, undefined);
  });
});

test("identity-only metadata retains the compatibility omission", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    await adapter.callTool({
      clientMode: "desktop",
      deliveryKind: "interactive",
      remoteSessionId: "remote",
      serverName: "alpha",
      toolName: "echo",
      turnId: "turn",
      workspaceIdentity: "workspace",
    });
    const params = objectArg(rig.seams.call("sdk.client.callTool").args, 0);
    assert.equal(Object.hasOwn(params, "_meta"), false);
  });
});

test("tool result projection preserves valid references and normalizes invalid fields", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    const content = [{ text: "ok", type: "text" }];
    const meta = { retained: true };
    rig.seams.setHook("sdk.client.callTool", async () => ({
      content,
      isError: false,
      structuredContent: 0,
      _meta: meta,
    }));
    const valid = await adapter.callTool({ serverName: "alpha", toolName: "echo" });
    assert.deepEqual(Object.keys(valid), ["content", "structuredContent", "isError", "_meta"]);
    assert.equal(valid.content, content);
    assert.equal(valid._meta, meta);
    assert.equal(valid.structuredContent, 0);
    rig.seams.setHook("sdk.client.callTool", async () => ({
      content: "invalid",
      isError: "yes",
      _meta: [],
    }));
    const invalid = await adapter.callTool({ serverName: "alpha", toolName: "echo" });
    assert.deepEqual(invalid, {
      content: [{ text: "", type: "text" }],
      structuredContent: undefined,
      isError: undefined,
      _meta: undefined,
    });
  });
});

test("exact Not connected retries once and returns the second attempt", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    let attempts = 0;
    rig.seams.setHook("sdk.client.callTool", async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Not connected");
      return { content: [{ text: "retried", type: "text" }] };
    });
    const result = await adapter.callTool({ serverName: "alpha", toolName: "echo" });
    assert.equal(attempts, 2);
    assert.equal(((result.content as unknown[])[0] as UnknownRecord).text, "retried");
    assert.equal(rig.seams.callsFor("sdk.client.construct").length, 2);
    assert.equal(
      rig.seams
        .callsFor("logger.warn")
        .filter((call) => call.args[0] === "MCP server reconnecting after lost connection").length,
      1,
    );
  });
});

test("failed lost-connection reconnect preserves the original tool error", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    const original = new Error("Not connected");
    rig.seams.setHook("sdk.client.callTool", async () => {
      throw original;
    });
    rig.seams.setHook("sdk.client.connect", async () => {
      throw new Error("reconnect failed");
    });
    await assert.rejects(
      () => adapter.callTool({ serverName: "alpha", toolName: "echo" }),
      original,
    );
    const reconnectLog = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server reconnect failed");
    assert.equal(reconnectLog, undefined);
  });
});

test("a rejected reconnect wait logs failure and preserves the original tool error", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    const original = new Error("Not connected");
    const waitFailure = new Error("deadline wait failed");
    let reconnectPromise: Promise<unknown> | undefined;
    rig.seams.setHook("sdk.client.callTool", async () => {
      throw original;
    });
    rig.seams.setHook("timeout.waitDeadline", async (_receiver, promise) => {
      reconnectPromise = Promise.resolve(promise);
      throw waitFailure;
    });
    await assert.rejects(
      () => adapter.callTool({ serverName: "alpha", toolName: "echo" }),
      original,
    );
    const reconnectLog = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server reconnect failed");
    assert.ok(reconnectLog);
    assert.equal(objectArg(reconnectLog.args, 1).error, "deadline wait failed");
    assert.ok(reconnectPromise);
    await reconnectPromise;
  });
});

test("non-Error tool failures are not retried and log errorName unknown", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    const original = "not connected";
    rig.seams.setHook("sdk.client.callTool", async () => {
      throw original;
    });
    await assert.rejects(
      () => adapter.callTool({ serverName: "alpha", toolName: "echo" }),
      (error: unknown) => error === original,
    );
    assert.equal(rig.seams.callsFor("sdk.client.callTool").length, 1);
    assert.equal(rig.seams.callsFor("oauth.runInteractive").length, 0);
    const failed = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP tool call failed");
    assert.ok(failed);
    assert.equal(objectArg(failed.args, 1).errorName, "unknown");
  });
});

test("failure log classifies AbortError timeout and budget exhaustion", async () => {
  await withRig(async (rig) => {
    const adapter = await connectHttp(rig);
    const failure = Object.assign(new Error("cancelled"), { name: "AbortError" });
    rig.seams.setHook("sdk.client.callTool", async () => {
      rig.clock.advance(95);
      throw failure;
    });
    await assert.rejects(
      () =>
        adapter.callTool(
          { arguments: { value: 1 }, serverName: "alpha", toolName: "echo" },
          { timeoutMs: 100 },
        ),
      failure,
    );
    const failed = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP tool call failed");
    assert.ok(failed);
    const context = objectArg(failed.args, 1);
    assert.equal(context.timedOut, true);
    assert.equal(context.budgetExhausted, true);
    assert.equal(context.durationMs, 95);
  });
});
