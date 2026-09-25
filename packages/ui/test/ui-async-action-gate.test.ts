import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { UiAsyncActionGate } from "../src/studio/agents/uiAsyncActionGate.js";

test("dialog cancellation and route replacement suppress late handoff navigation", async () => {
  const gate = new UiAsyncActionGate();
  const events: string[] = [];
  let sendCount = 0;
  let resolveAck: ((sessionId: string) => void) | undefined;
  const ack = new Promise<string>((resolve) => {
    resolveAck = resolve;
  });
  const handlers = {
    onStart: () => events.push("busy"),
    onSuccess: (sessionId: string) => events.push(`navigate:${sessionId}`),
    onError: () => events.push("error"),
    onSettled: () => events.push("idle"),
  };

  // Closing before confirmation never starts destination work.
  gate.activate();
  gate.deactivate();
  assert.equal(
    gate.run(async () => {
      sendCount++;
      return "unexpected";
    }, handlers),
    false,
  );
  assert.equal(sendCount, 0);

  gate.activate();
  assert.equal(
    gate.run(async () => {
      sendCount++;
      return ack;
    }, handlers),
    true,
  );
  assert.equal(gate.isRunning, true);
  assert.equal(
    gate.run(async () => "duplicate", handlers),
    false,
  );
  await setImmediate();
  assert.equal(sendCount, 1);
  gate.deactivate();
  resolveAck?.("native-session");
  await setImmediate();
  assert.deepEqual(events, ["busy"]);

  // A new route has its own generation; an old reply cannot clear its busy state.
  gate.activate();
  assert.equal(gate.isRunning, false);
  assert.equal(
    gate.run(async () => "new-session", handlers),
    true,
  );
  await setImmediate();
  assert.equal(gate.isRunning, false);
  assert.deepEqual(events, ["busy", "busy", "navigate:new-session", "idle"]);
});

test("current dialog receives an error and becomes retryable", async () => {
  const gate = new UiAsyncActionGate();
  const events: string[] = [];
  gate.activate();
  gate.run(
    async () => {
      throw new Error("reply lost");
    },
    {
      onStart: () => events.push("busy"),
      onSuccess: () => events.push("unexpected"),
      onError: (cause) => events.push(cause instanceof Error ? cause.message : String(cause)),
      onSettled: () => events.push("idle"),
    },
  );
  await setImmediate();
  assert.deepEqual(events, ["busy", "reply lost", "idle"]);
  assert.equal(
    gate.run(async () => "retry", {
      onStart: () => events.push("retrying"),
      onSuccess: (value) => events.push(value),
      onError: () => events.push("unexpected"),
      onSettled: () => events.push("settled"),
    }),
    true,
  );
  await setImmediate();
  assert.deepEqual(events.slice(-3), ["retrying", "retry", "settled"]);
});

test("a navigation callback failure reaches the current dialog error state", async () => {
  const gate = new UiAsyncActionGate();
  const events: string[] = [];
  gate.activate();
  gate.run(async () => "native-session", {
    onStart: () => events.push("busy"),
    onSuccess: () => {
      throw new Error("navigation failed");
    },
    onError: (error) => events.push(error instanceof Error ? error.message : String(error)),
    onSettled: () => events.push("idle"),
  });
  await setImmediate();
  assert.deepEqual(events, ["busy", "navigation failed", "idle"]);
});
