// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SessionEventType, type Logger } from "@knorvia/contracts";
import { InMemoryHookRunner } from "../src/hooks/runner.js";
import { deferred, hookPayload, runnerInput } from "./hook-runner-fixture.js";

for (const background of [false, true])
  test(`${background ? "background" : "foreground"} dispatch has no wait after final admission`, async () => {
    const order: string[] = [],
      completed = deferred();
    let checks = 0;
    const runner = new InMemoryHookRunner({
      hooks: [
        {
          event: "PreToolUse",
          async: background,
          admission: () => {
            if (++checks === 3) queueMicrotask(() => order.push("admission microtask"));
            return { allowed: true };
          },
          callback: () => {
            order.push("callback");
          },
        },
      ],
      emitEvent: async (event) => {
        if (event.type === SessionEventType.HookRunCompleted) completed.resolve();
      },
    });
    await runner.run(runnerInput());
    await completed.promise;
    assert.equal(checks, 3);
    assert.deepEqual(order, ["callback", "admission microtask"]);
  });

test("a failure logger exception escapes once without a second Failed publication", async () => {
  const failure = new Error("fixture logger failure"),
    events: string[] = [];
  let warnings = 0,
    later = 0;
  const logger: Logger = {
    debug() {},
    info() {},
    error() {},
    child() {
      return this;
    },
    warn() {
      assert.equal(this, logger);
      warnings++;
      throw failure;
    },
  };
  const runner = new InMemoryHookRunner({
    logger,
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          throw new Error("fixture callback");
        },
      },
      {
        event: "PreToolUse",
        callback: () => {
          later++;
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event.type);
    },
  });
  await assert.rejects(runner.run(runnerInput()), (error) => error === failure);
  assert.equal(warnings, 1);
  assert.equal(later, 0);
  assert.deepEqual(events, [SessionEventType.HookRunStarted, SessionEventType.HookRunFailed]);
});

test("background launch adds no await before the next foreground occurrence is prepared", async () => {
  const release = deferred(),
    completed = deferred(),
    order: string[] = [];
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        async: true,
        source: "background",
        callback: async () => {
          order.push("background callback");
          queueMicrotask(() => order.push("background microtask"));
          await release.promise;
        },
      },
      {
        event: "PreToolUse",
        descriptor: () => {
          if (order.length) order.push("next descriptor");
          return {
            clientVisible: false,
            commandDisplay: "fixture",
            executionMode: "foreground",
            executionType: "process",
            sourceKind: "internal",
            timeoutMs: 1000,
          };
        },
        callback: () => {
          order.push("next callback");
        },
      },
    ],
    emitEvent: async (event) => {
      if (
        event.type === SessionEventType.HookRunCompleted &&
        hookPayload(event).hookSource === "background"
      )
        completed.resolve();
    },
  });
  await runner.run(runnerInput());
  assert.deepEqual(order, [
    "background callback",
    "next descriptor",
    "background microtask",
    "next callback",
  ]);
  release.resolve();
  await completed.promise;
});
