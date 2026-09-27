// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { CUA_APP_ASSOCIATIONS_META_KEY } from "@knorvia/cua/host-display-contract";
import {
  createComputerUseBridgeGlobals,
  NODE_REPL_CUA_BRIDGE_SYMBOL,
  type ComputerUseRuntimeBridge,
} from "../src/cua-bridge.js";
import { bridgeFixture } from "./bridge-test-support.js";

test("Computer Use sends its complete nested context and preserves structured output", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  const result = {
    content: [{ type: "text", text: "fixture" }],
    isError: true,
    structuredContent: { value: 42 },
  };
  fixture.reply.value = { result };
  assert.equal(fixture.computer!.documentationRoot, "fixture-docs");
  fixture.computer!.assertAvailable();
  assert.deepEqual(await fixture.computer!.call("observe", { display: "fixture" }), result);
  const request = fixture.requests[0]!;
  assert.equal(request.method, "observe");
  assert.deepEqual(request.input, { display: "fixture" });
  assert.deepEqual(request.context, {
    sessionId: "session",
    runtimeScope: "main",
    turnId: "turn",
    trace: { traceId: "trace" },
    workspaceIdentity: "remote:workspace",
    workspacePath: "/project",
    remoteSessionId: "remote-session",
    workspaceKey: "remote:workspace",
    clientMode: "desktop-continuous",
    deliveryKind: "desktop-continuous",
  });
  assert.deepEqual(fixture.observations, []);
});

test("availability rejects a missing Computer Use connection before transport", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  const bridge = createComputerUseBridgeGlobals(fixture.input)[
    NODE_REPL_CUA_BRIDGE_SYMBOL
  ] as ComputerUseRuntimeBridge;
  assert.throws(() => bridge.assertAvailable(), /Computer Use is unavailable/);
  await assert.rejects(bridge.call("observe", {}), /Computer Use is unavailable/);
  fixture.state.active = undefined;
  assert.throws(() => bridge.assertAvailable(), /stale after kernel reset/);
  assert.equal(fixture.requests.length, 0);
});

test("subagents, missing workspace identity and cancellation cannot send Computer Use commands", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  fixture.state.active!.requestMeta = {
    session_id: "session",
    workspace_key: "workspace",
    runtime_scope: "subagent",
  };
  await assert.rejects(
    fixture.computer!.call("observe", {}),
    /Computer Use is not available in subagent/,
  );
  fixture.state.active!.requestMeta = { session_id: "session" };
  await assert.rejects(fixture.computer!.call("observe", {}), /missing workspaceKey/);
  fixture.controller.abort(new Error("cancel fixture"));
  await assert.rejects(fixture.computer!.call("observe", {}), /cancel fixture/);
  assert.equal(fixture.requests.length, 0);
});

test("invalid Computer Use results cannot attach metadata or application identity", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  for (const result of [undefined, null, {}, { content: null }, { content: "text" }]) {
    fixture.reply.value = { result, responseMeta: { fixture: true } };
    await assert.rejects(fixture.computer!.call("observe", {}), /returned no result/);
  }
  assert.deepEqual(fixture.observations, []);
});

test("Computer Use records broker metadata before a normalized primary app identity", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  const associations = {
    primary: { appKey: " app ", displayName: " Name ", private: "not an identity field" },
  };
  const result = { content: [], _meta: { [CUA_APP_ASSOCIATIONS_META_KEY]: associations } };
  fixture.reply.value = { result, responseMeta: { fixture: true } };
  assert.deepEqual(await fixture.computer!.call("observe", {}), result);
  assert.deepEqual(fixture.observations, [
    { name: "metadata", value: { fixture: true } },
    { name: "application", value: { appKey: "app", displayName: "Name" } },
  ]);
});

test("empty or malformed primary identities never receive trusted app attribution", async (t) => {
  const fixture = await bridgeFixture(t, "computer");
  for (const primary of [
    undefined,
    null,
    42,
    "app",
    {},
    { appKey: " " },
    { appKey: 7, displayName: "Name" },
  ]) {
    fixture.reply.value = {
      result: { content: [], _meta: { [CUA_APP_ASSOCIATIONS_META_KEY]: { primary } } },
      responseMeta: "invalid",
    };
    await fixture.computer!.call("observe", {});
  }
  assert.deepEqual(fixture.observations, []);
  fixture.reply.value = {
    result: {
      content: [],
      _meta: {
        [CUA_APP_ASSOCIATIONS_META_KEY]: { primary: { appKey: " app ", displayName: " " } },
      },
    },
  };
  await fixture.computer!.call("observe", {});
  assert.deepEqual(fixture.observations, [{ name: "application", value: { appKey: "app" } }]);
});

test("a disposed execution cannot receive a late Computer Use observation", async (t) => {
  let respond!: () => void;
  const fixture = await bridgeFixture(t, "computer", (request, socket) => {
    respond = () =>
      socket.end(
        JSON.stringify({
          id: request.id,
          ok: true,
          result: { content: [] },
          responseMeta: { fixture: true },
        }) + "\n",
      );
  });
  const pending = fixture.computer!.call("observe", {});
  const rejected = assert.rejects(pending, /stale after kernel reset/);
  await fixture.waitForRequests(1);
  fixture.state.active = undefined;
  respond();
  await rejected;
  assert.deepEqual(fixture.observations, []);
});
