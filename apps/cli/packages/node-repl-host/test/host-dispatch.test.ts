// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { NodeReplExecuteInput } from "../src/executor.js";
import { windowsRuntime, watch } from "./dispatch-test-support.js";
import {
  fixture,
  captured,
  capturedRuntime,
  captureComputerUseRuntimeFromEnvironment,
  setNodeReplMcpProcessTitle,
} from "./dispatch-fixture.js";

test("MCP host identity and tool listing preserve native tools before js", async (t) => {
  const { server } = fixture(t, undefined, {
    windowsRuntime: windowsRuntime({
      listTools: () => [
        { name: "computer_fixture", description: "fixture", inputSchema: { type: "object" } },
      ],
    }),
  });
  assert.deepEqual(server.identity, { name: "node_repl", version: "0.8.0" });
  assert.deepEqual(server.configuration.capabilities, { tools: {} });
  const listing = await server.list();
  assert.deepEqual(
    listing.tools.map((tool) => tool.name),
    ["computer_fixture", "js"],
  );
  assert.ok((listing.tools[1].inputSchema.required as string[]).includes("title"));
  const target = { title: "before" };
  setNodeReplMcpProcessTitle(target);
  assert.equal(target.title, "knorvia-node-repl-mcp");
});

test("MCP host rejects invalid js shapes and returns empty-source diagnostics without execution", async (t) => {
  let calls = 0;
  const { server } = fixture(t, async () => {
    calls++;
    return { logs: "" };
  });
  for (const args of [
    undefined,
    null,
    [],
    {},
    { code: 3 },
    { code: "x", extra: true },
    { code: "x", title: "" },
    { code: "x", title: "x".repeat(121) },
    ...[0, -1, 1.5, 120001, NaN, Infinity].map((timeout_ms) => ({ code: "x", timeout_ms })),
  ]) {
    await assert.rejects(
      server.call({ name: "js", arguments: args }),
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === -32602 &&
        error.message === "Invalid js tool arguments",
    );
  }
  await assert.rejects(server.call({ name: "unknown", arguments: { code: "x" } }), /Invalid js/);
  assert.deepEqual(await server.call({ name: "js", arguments: { code: " \n\t " } }), {
    content: [{ type: "text", text: "js expects non-empty JavaScript source" }],
    isError: true,
  });
  assert.equal(calls, 0);
});

test("MCP host projects normalized context, extensions, title and execution budget", async (t) => {
  const calls: NodeReplExecuteInput[] = [];
  const { server } = fixture(t, async (input) => {
    calls.push(input);
    return { logs: "" };
  });
  await server.call(
    { name: "js", arguments: { code: "x", title: "visible", timeout_ms: 17 } },
    {
      session_id: " session ",
      title: "untrusted",
      trace_id: "trace",
      workspace_identity: "workspace",
      remote_session_id: "remote",
    },
  );
  assert.deepEqual(calls[0].requestMeta, {
    session_id: "session",
    runtime_scope: "main",
    title: "visible",
    trace_id: "trace",
    workspace_identity: "workspace",
    remote_session_id: "remote",
  });
  assert.equal(calls[0].syncTimeoutMs, 17);
  assert.equal(calls[0].code, "x");
  await server.call(
    { name: "js", arguments: { code: "x" } },
    { runtime_scope: "invalid", session_id: "session" },
  );
  assert.deepEqual(calls[1].requestMeta, {});
  assert.equal(calls[1].syncTimeoutMs, 60000);
});

test("MCP host serializes a normalized session and continues after predecessor rejection", async (t) => {
  const gate = Promise.withResolvers<void>(),
    calls: string[] = [];
  const { server } = fixture(t, async ({ code }) => {
    calls.push(code);
    if (code === "first") {
      await gate.promise;
      throw new Error("first failed");
    }
    return { logs: code };
  });
  const first = watch(
    server.call({ name: "js", arguments: { code: "first" } }, { session_id: " same " }),
  );
  const second = watch(
    server.call({ name: "js", arguments: { code: "second" } }, { session_id: "same" }),
  );
  try {
    await setImmediate();
    assert.deepEqual([...calls], ["first"]);
  } finally {
    gate.resolve();
  }
  await assert.rejects(first.promise, /first failed/);
  assert.equal((await second.promise).content[0].type, "text");
  assert.deepEqual(calls, ["first", "second"]);
});

test("MCP host independent sessions can enter before either completes", async (t) => {
  const gate = Promise.withResolvers<void>(),
    calls: string[] = [];
  const { server } = fixture(t, async ({ code }) => {
    calls.push(code);
    await gate.promise;
    return { logs: code };
  });
  const pending = ["a", "b"].map((id) =>
    server.call({ name: "js", arguments: { code: id } }, { session_id: id }),
  );
  try {
    await setImmediate();
    assert.deepEqual([...calls], ["a", "b"]);
  } finally {
    gate.resolve();
    await Promise.allSettled(pending);
  }
});

test("MCP host unscoped admission never collides with a literal session identifier", async (t) => {
  const gate = Promise.withResolvers<void>(),
    calls: string[] = [];
  const { server } = fixture(t, async ({ code }) => {
    calls.push(code);
    await gate.promise;
    return { logs: code };
  });
  const pending = [
    server.call({ name: "js", arguments: { code: "unscoped" } }),
    server.call({ name: "js", arguments: { code: "named" } }, { session_id: "__unscoped__" }),
  ];
  try {
    await setImmediate();
    assert.deepEqual([...calls], ["unscoped", "named"]);
  } finally {
    gate.resolve();
    await Promise.allSettled(pending);
  }
});

test("MCP host allocates the JS deadline only when its queue slot is admitted", async (t) => {
  const gate = Promise.withResolvers<void>(),
    budgets: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    budgets.push(ms);
    return new AbortController().signal;
  });
  const { server } = fixture(t, async ({ code }) => {
    if (code === "first") await gate.promise;
    return { logs: code };
  });
  const pending = [
    server.call(
      { name: "js", arguments: { code: "first", timeout_ms: 1000 } },
      { session_id: "same" },
    ),
    server.call(
      { name: "js", arguments: { code: "second", timeout_ms: 10 } },
      { session_id: "same" },
    ),
  ];
  try {
    await setImmediate();
    assert.deepEqual(budgets, [1000]);
  } finally {
    gate.resolve();
    await Promise.allSettled(pending);
  }
  assert.deepEqual(budgets, [1000, 10]);
});

test("MCP host queued cancellation never invokes the executor", async (t) => {
  const gate = Promise.withResolvers<void>(),
    controller = new AbortController(),
    calls: string[] = [];
  const { server } = fixture(t, async ({ code }) => {
    calls.push(code);
    await gate.promise;
    return { logs: code };
  });
  const first = server.call({ name: "js", arguments: { code: "first" } }, { session_id: "same" });
  const second = watch(
    server.call(
      { name: "js", arguments: { code: "second" } },
      { session_id: "same" },
      controller.signal,
    ),
  );
  await setImmediate();
  controller.abort(new Error("caller cancelled"));
  gate.resolve();
  await first;
  await assert.rejects(second.promise, /caller cancelled/);
  assert.deepEqual(calls, ["first"]);
});

test("MCP native Windows calls retain their own arguments, result and trusted context", async (t) => {
  const calls: unknown[] = [];
  const result = {
    content: [{ type: "text" as const, text: "native" }],
    structuredContent: { native: true },
  };
  const { server } = fixture(t, async () => assert.fail("No JS dispatch"), {
    windowsRuntime: windowsRuntime({
      listTools: () => [{ name: "computer_fixture", description: "fixture", inputSchema: {} }],
      execute: async (input) => {
        calls.push(input);
        return result;
      },
    }),
  });
  const response = await server.call(
    { name: "computer_fixture", arguments: { session_id: "forged", approved: true } },
    {
      session_id: "trusted",
      runtime_scope: "main",
      workspace_key: "workspace",
      client_mode: "desktop-continuous",
      delivery_kind: "desktop-continuous",
    },
  );
  assert.deepEqual(response, result);
  const call = calls[0] as {
    context: Record<string, unknown>;
    arguments: unknown;
    signal: AbortSignal;
  };
  assert.equal(call.context.sessionId, "trusted");
  assert.equal(call.context.runtimeScope, "main");
  assert.equal(call.context.approved, undefined);
  assert.equal(call.signal.aborted, false);
  assert.deepEqual(call.arguments, { session_id: "forged", approved: true });
});

test("MCP environment capture is opt-in and trims only existing configuration fields", () => {
  assert.equal(captureComputerUseRuntimeFromEnvironment({}), undefined);
  assert.equal(
    captureComputerUseRuntimeFromEnvironment({ KNORVIA_CUA_PERMISSION_BROKER_SOCKET: " " }),
    undefined,
  );
  const runtime = captureComputerUseRuntimeFromEnvironment({
    KNORVIA_CUA_PERMISSION_BROKER_SOCKET: " fixture-pipe ",
    KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER: " marker ",
  });
  assert.equal(runtime, capturedRuntime);
  assert.deepEqual(captured.at(-1), {
    brokerSocketPath: "fixture-pipe",
    refreshMarkerPath: "marker",
  });
});
