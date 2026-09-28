// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  HookJSONOutputSchema,
  SessionEventType,
  type HookJSONOutput,
  type PreToolUseHookInput,
} from "@knorvia/contracts";
import { InMemoryHookRunner } from "../src/hooks/runner.js";
import { runPermissionRequestHooks } from "../src/tool/executor/hook-flow.js";
import { permissionFlow } from "./permission-flow-fixture.js";
import { gate, invocation } from "./tool-invocation-fixture.js";

function input(value = "first"): PreToolUseHookInput {
  const f = permissionFlow();
  return {
    cwd: ".",
    hookEventName: "PreToolUse",
    mode: "build",
    sessionId: f.deps.sessionId,
    timestamp: "2026-09-28T00:00:00Z",
    traceId: f.trace.traceId,
    riskLevel: "low",
    toolCallId: f.call.id,
    toolName: "Fixture",
    toolInput: { value },
  };
}

test("real Runner and permission adapter keep a structured refusal after a later allow or modify", async () => {
  for (const updatedInput of [undefined, { value: "modified" }]) {
    const f = permissionFlow();
    const events: string[] = [];
    const outputs: HookJSONOutput[] = [
      {
        additionalContext: "first",
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny", message: "DENY" },
        },
      },
      {
        additionalContext: "later",
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "allow", updatedInput },
        },
      },
    ];
    outputs.forEach((output) => assert.ok(HookJSONOutputSchema.safeParse(output).success));
    const order: number[] = [];
    f.deps.hookRunner = new InMemoryHookRunner({
      emitEvent: async (event) => {
        events.push(event.type);
      },
      hooks: outputs.map((output, index) => ({
        event: "PermissionRequest",
        callback: () => {
          order.push(index);
          return output;
        },
      })),
    });
    assert.deepEqual(
      await runPermissionRequestHooks(
        f.deps,
        f.call,
        f.call.input,
        "fixture",
        f.state.decision,
        "build",
        f.trace,
      ),
      { decision: "deny", reason: "DENY" },
    );
    assert.deepEqual(order, [0, 1]);
    assert.deepEqual(events, [
      SessionEventType.HookRunStarted,
      SessionEventType.HookRunBlocked,
      SessionEventType.HookRunStarted,
      SessionEventType.HookRunCompleted,
    ]);
  }
});

test("legacy PermissionRequest stop remains dominant across valid mixed output forms", async () => {
  for (const stop of [{ continue: false }, { decision: "block" as const }]) {
    const f = permissionFlow();
    f.deps.hookRunner = new InMemoryHookRunner({
      hooks: [
        { event: "PermissionRequest", callback: () => ({ ...stop, reason: "STOP" }) },
        {
          event: "PermissionRequest",
          callback: () => ({
            decision: "approve",
            hookSpecificOutput: {
              hookEventName: "PermissionRequest",
              decision: { behavior: "allow", updatedInput: null },
            },
          }),
        },
      ],
    });
    assert.deepEqual(
      await runPermissionRequestHooks(
        f.deps,
        f.call,
        {},
        "fixture",
        f.state.decision,
        "build",
        f.trace,
      ),
      { decision: "deny", reason: "STOP" },
    );
  }
});

test("actual tool admission shows the winning Pre refusal and never invokes its handler", async () => {
  const f = invocation();
  f.deps.hookRunner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => ({
          decision: "block",
          reason: "REAL REFUSAL",
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: "ALLOW",
          },
        }),
      },
    ],
  });
  const result = await f.run();
  assert.equal(result.success, false);
  assert.match(result.error?.message ?? "", /REAL REFUSAL/u);
  assert.equal(f.observed.inputs.length, 0);
});

test("foreground hooks await registration order and all see the original input reference", async () => {
  const firstStarted = gate(),
    release = gate();
  const original = input(),
    modified = { value: "replacement" };
  const order: string[] = [];
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: async (value) => {
          assert.equal(value, original);
          order.push("first");
          firstStarted.resolve();
          await release.promise;
          return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: modified } };
        },
      },
      {
        event: "PreToolUse",
        callback: (value) => {
          order.push("second");
          assert.equal(value, original);
          assert.notEqual(value.toolInput, modified);
          return { additionalContext: "second" };
        },
      },
    ],
  });
  const pending = runner.run(original);
  await firstStarted.promise;
  assert.deepEqual(order, ["first"]);
  release.resolve();
  const result = await pending;
  assert.deepEqual(order, ["first", "second"]);
  assert.equal(result.updatedInput, modified);
  assert.deepEqual(result.additionalContexts, ["second"]);
});

test("background output is never decoded or merged into the foreground result", async () => {
  const release = gate(),
    completed = gate();
  const events: string[] = [];
  const runner = new InMemoryHookRunner({
    emitEvent: async (event) => {
      events.push(event.type);
      if (event.type === SessionEventType.HookRunCompleted) completed.resolve();
    },
    hooks: [
      {
        event: "PreToolUse",
        async: true,
        callback: async () => {
          await release.promise;
          return {
            continue: false,
            hookSpecificOutput: { hookEventName: "Stop", additionalContext: "ignored" },
          };
        },
      },
    ],
  });
  const result = await runner.run(input());
  assert.deepEqual(result, { additionalContexts: [] });
  release.resolve();
  await completed.promise;
  assert.deepEqual(result, { additionalContexts: [] });
  assert.deepEqual(events, [SessionEventType.HookRunStarted, SessionEventType.HookRunCompleted]);
});

test("concurrent runs retain separate result accumulators", async () => {
  const started = gate(),
    release = gate();
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: async (value) => {
          assert.equal(value.hookEventName, "PreToolUse");
          if (value.hookEventName !== "PreToolUse") throw new Error("fixture event");
          const name = (value.toolInput as { value: string }).value;
          if (name === "first") {
            started.resolve();
            await release.promise;
          }
          return { additionalContext: name };
        },
      },
    ],
  });
  const pending = runner.run(input("first"));
  await started.promise;
  const second = await runner.run(input("second"));
  release.resolve();
  const first = await pending;
  assert.deepEqual(first.additionalContexts, ["first"]);
  assert.deepEqual(second.additionalContexts, ["second"]);
  assert.notEqual(first.additionalContexts, second.additionalContexts);
});

test("wrong event and callback failure discard only that output and later hooks still run", async () => {
  const events: string[] = [];
  const runner = new InMemoryHookRunner({
    emitEvent: async (event) => {
      events.push(event.type);
    },
    hooks: [
      {
        event: "PreToolUse",
        callback: () => ({
          continue: false,
          additionalContext: "discarded",
          hookSpecificOutput: { hookEventName: "Stop" },
        }),
      },
      {
        event: "PreToolUse",
        callback: () => {
          throw new Error("fixture callback");
        },
      },
      { event: "PreToolUse", callback: () => ({ additionalContext: "accepted" }) },
    ],
  });
  assert.deepEqual(await runner.run(input()), { additionalContexts: ["accepted"] });
  assert.deepEqual(events, [
    SessionEventType.HookRunStarted,
    SessionEventType.HookRunFailed,
    SessionEventType.HookRunStarted,
    SessionEventType.HookRunFailed,
    SessionEventType.HookRunStarted,
    SessionEventType.HookRunCompleted,
  ]);
});

test("terminal publication failure does not undo an already merged output", async () => {
  let rejectCompletion = true;
  const events: string[] = [];
  const runner = new InMemoryHookRunner({
    emitEvent: async (event) => {
      events.push(event.type);
      if (event.type === SessionEventType.HookRunCompleted && rejectCompletion) {
        rejectCompletion = false;
        throw new Error("fixture publication");
      }
    },
    hooks: ["first", "second"].map((value) => ({
      event: "PreToolUse",
      callback: () => ({ additionalContext: value }),
    })),
  });
  assert.deepEqual(await runner.run(input()), { additionalContexts: ["first", "second"] });
  assert.deepEqual(events, [
    SessionEventType.HookRunStarted,
    SessionEventType.HookRunCompleted,
    SessionEventType.HookRunFailed,
    SessionEventType.HookRunStarted,
    SessionEventType.HookRunCompleted,
  ]);
});
