// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  ASK_USER_QUESTION_TOOL_NAME,
  SessionEventType,
  type SessionEvent,
} from "@knorvia/contracts";
import { permissionFlow } from "../../core/test/permission-flow-fixture.js";
import { gate, eventPayload } from "../../core/test/tool-invocation-fixture.js";
import { createProtocolInteractionBroker } from "../src/protocol/interaction-broker.js";
import type { KnorviaProtocolAgentServerContext } from "../src/protocol/server-types.js";
import { V4InteractionRegistry } from "../src/protocol-v4/interaction-registry.js";

test("visible question accepts its first reply after asynchronous restore has registered the route", async () => {
  const f = permissionFlow();
  const restore = gate<[]>(),
    restoring = gate();
  const registry = new V4InteractionRegistry();
  let requestedId: string | undefined,
    acceptedFirst: boolean | undefined,
    rpcCalls = 0;
  const context = {
    v4Interactions: registry,
    deps: {
      sessionStore: {
        sessionEntries: () => {
          restoring.resolve();
          return restore.promise;
        },
      },
    },
    sessions: new Map(),
    requestClient(
      _method: unknown,
      _payload: unknown,
      _schema: unknown,
      options: { signal: AbortSignal },
    ) {
      rpcCalls++;
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) reject(options.signal.reason);
        else
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
      });
    },
  } as unknown as KnorviaProtocolAgentServerContext;
  f.deps.permissionBroker = createProtocolInteractionBroker(context);
  f.call.name = ASK_USER_QUESTION_TOOL_NAME;
  f.entry.metadata.name = ASK_USER_QUESTION_TOOL_NAME;
  f.entry.inputSchema = { type: "object" };
  f.call.input = {
    questions: [
      {
        header: "Choice",
        question: "Which fixture?",
        options: [
          { label: "A", description: "First fixture" },
          { label: "B", description: "Second fixture" },
        ],
        multiSelect: false,
      },
    ],
  };
  f.behavior.event = async (event: SessionEvent) => {
    if (event.type !== SessionEventType.PermissionRequested) return;
    requestedId = String(eventPayload(event).requestId);
    acceptedFirst = registry.resolve(requestedId, { action: "accept", content: { answer: "A" } });
  };
  const pending = f.resolve();
  try {
    await restoring.promise;
    const visibleWhileRestoring = f.events.some(
      (event) => event.type === SessionEventType.PermissionRequested,
    );
    restore.resolve([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    // 旧版需要第二次回答才能结束；先收口真实请求，再断言首次应答，避免失败测试遗留 timer。
    if (requestedId && acceptedFirst === false)
      registry.resolve(requestedId, { action: "accept", content: { answer: "A" } });
    const outcome = await pending;
    assert.equal(
      visibleWhileRestoring,
      false,
      "do not expose an answerable question before its route exists",
    );
    assert.equal(acceptedFirst, true, "the first visible answer must reach the registered request");
    assert.equal(outcome.allowed, true);
    assert.equal(rpcCalls, 0, "an answer during publication must not open a second legacy prompt");
    assert.equal(registry.has(requestedId!), false);
  } finally {
    restore.resolve([]);
    f.controller.abort();
  }
});

test("an expired restore microtask cannot answer a replacement registered with the same ID", async () => {
  const registry = new V4InteractionRegistry({ now: () => 100 });
  const answers: string[] = [];
  const unregisterOld = registry.register("fixture-id", () => answers.push("old"), {
    sessionId: "fixture-session",
    kind: "askUserQuestion",
    initialAutoResolution: { state: "visibleCountdown", startedAt: 0, visibleAt: 1, deadlineAt: 2 },
  });
  unregisterOld();
  const unregisterNew = registry.register("fixture-id", () => answers.push("new"));
  try {
    await Promise.resolve();
    assert.deepEqual(answers, []);
    assert.equal(registry.has("fixture-id"), true);
  } finally {
    unregisterNew();
  }
});

test("cancellation during stored-state preparation cannot create a late visible request", async () => {
  const f = permissionFlow(),
    restoring = gate(),
    release = gate<[]>();
  const registry = new V4InteractionRegistry();
  let rpcCalls = 0;
  const context = {
    v4Interactions: registry,
    sessions: new Map(),
    deps: {
      sessionStore: {
        sessionEntries: () => {
          restoring.resolve();
          return release.promise;
        },
      },
    },
    requestClient: () => {
      rpcCalls++;
      return new Promise(() => {});
    },
  } as unknown as KnorviaProtocolAgentServerContext;
  f.deps.permissionBroker = createProtocolInteractionBroker(context);
  f.call.name = ASK_USER_QUESTION_TOOL_NAME;
  f.entry.metadata.name = ASK_USER_QUESTION_TOOL_NAME;
  f.entry.inputSchema = { type: "object" };
  f.call.input = {
    questions: [
      {
        header: "Fixture",
        question: "Which fixture?",
        options: [
          { label: "A", description: "First" },
          { label: "B", description: "Second" },
        ],
        multiSelect: false,
      },
    ],
  };
  const pending = f.resolve();
  try {
    await restoring.promise;
    f.controller.abort();
    const result = await pending;
    assert.equal(result.allowed, false);
    assert.deepEqual(f.events, []);
    release.resolve([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(f.events, []);
    assert.equal(rpcCalls, 0);
    assert.equal(registry.hasPendingForSession(String(f.deps.sessionId)), false);
    assert.equal(f.observed.hooks.length, 0);
  } finally {
    release.resolve([]);
    f.controller.abort();
  }
});
