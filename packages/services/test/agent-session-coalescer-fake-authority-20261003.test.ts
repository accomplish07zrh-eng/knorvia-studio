import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { KnorviaAgentServiceEvent } from "../src/agent/agent.js";
import { createBackgroundSessionEventCoalescer } from "../src/agent/sessionEventCoalescer.js";

function wrap(type: string, payload: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: "session.event",
    event: { type, sessionId: "synthetic-session", turnId: "synthetic-turn", payload, ...extra },
  } as unknown as KnorviaAgentServiceEvent;
}
function streaming(
  delta: string,
  payload: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return wrap(
    "model.streaming",
    { kind: "text_delta", delta, inputId: "synthetic-input", ...payload },
    extra,
  );
}

test("synthetic session events preserve ordered identity, anchored timers, handoff and failure references", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const output: KnorviaAgentServiceEvent[] = [];
    const coalescer = createBackgroundSessionEventCoalescer({
      emit: (event) => output.push(event),
      flushDelayMs: 20,
      maxItems: 3,
    });
    const one = streaming("A", { retainedOnlyOnFirst: "synthetic" });
    const progress = wrap("tool.updated", {
      kind: "progress",
      toolCallId: "synthetic-tool",
      value: 1,
    });
    const two = streaming("B", { latestOnly: true }, { traceId: "synthetic-trace" });
    Object.assign(two, { syntheticWrapperExtra: true });
    coalescer.accept(one);
    coalescer.accept(progress);
    mock.timers.tick(19);
    coalescer.accept(two);
    assert.equal(output.length, 0);
    mock.timers.tick(1);
    const merged = output[0] as Extract<KnorviaAgentServiceEvent, { type: "session.event" }>;
    assert.deepEqual(merged, {
      type: "session.event",
      event: {
        ...(two as typeof merged).event,
        payload: { kind: "text_delta", delta: "AB", inputId: "synthetic-input", latestOnly: true },
      },
    });
    assert.deepEqual(Object.keys(merged), ["type", "event"]);
    assert.equal(output[1], progress);
    assert.equal((one as typeof merged).event.payload!.delta, "A");
    output.length = 0;
    const latest = wrap("tool.updated", {
      kind: "progress",
      toolCallId: "synthetic-tool",
      value: 2,
    });
    coalescer.accept(progress);
    coalescer.accept(latest);
    const permission = {
      type: "permission.request",
      request: { synthetic: true },
    } as unknown as KnorviaAgentServiceEvent;
    coalescer.accept(permission);
    assert.equal((output[0] as typeof merged).event, (latest as typeof merged).event);
    assert.equal(output[1], permission);
    output.length = 0;
    const recoveryOne = wrap(
      "streamRecovery.updated",
      { inputId: "synthetic-input", value: 1 },
      { traceId: "synthetic-a" },
    );
    const recoveryTwo = wrap(
      "streamRecovery.updated",
      { inputId: "synthetic-input", value: 2 },
      { traceId: "synthetic-b" },
    );
    coalescer.accept(recoveryOne);
    coalescer.accept(recoveryTwo);
    const differentParent = streaming("parent", { parentToolUseId: "synthetic-parent" });
    coalescer.accept(differentParent);
    assert.deepEqual(output, [recoveryOne, recoveryTwo, differentParent]);
    output.length = 0;
    const boundary = wrap("model.streaming", { kind: "text_delta", delta: 2 });
    coalescer.accept(streaming("handoff"));
    coalescer.accept(boundary);
    assert.equal(output.length, 2);
    assert.equal(output[1], boundary);
    output.length = 0;
    const final = streaming("visible");
    coalescer.accept(final);
    coalescer.dispose();
    coalescer.dispose();
    coalescer.accept(streaming("ignored"));
    mock.timers.tick(100);
    assert.deepEqual(output, [final]);

    const collisionOutput: KnorviaAgentServiceEvent[] = [];
    const collision = createBackgroundSessionEventCoalescer({
      emit: (event) => collisionOutput.push(event),
    });
    collision.accept(streaming("first", { inputId: "x\u0000y", assistantMessageId: "z" }));
    collision.accept(streaming("second", { inputId: "x", assistantMessageId: "y\u0000z" }));
    collision.flush();
    assert.equal(collisionOutput.length, 1);
    assert.equal((collisionOutput[0] as typeof merged).event.payload!.delta, "firstsecond");

    const reentrantOutput: KnorviaAgentServiceEvent[] = [];
    const reentrant = createBackgroundSessionEventCoalescer({
      emit: (event) => {
        reentrantOutput.push(event);
        if (reentrantOutput.length === 1) reentrant.accept(streaming("reentrant"));
      },
    });
    reentrant.accept(streaming("before-dispose"));
    reentrant.dispose();
    mock.timers.tick(2000);
    assert.equal(reentrantOutput.length, 1);
    reentrant.flush();
    assert.equal(reentrantOutput.length, 2);

    const emitFailure = new Error("synthetic emit failure");
    let throwOnce = true;
    const failingOutput: KnorviaAgentServiceEvent[] = [];
    const failing = createBackgroundSessionEventCoalescer({
      emit: (event) => {
        if (throwOnce) {
          throwOnce = false;
          throw emitFailure;
        }
        failingOutput.push(event);
      },
    });
    failing.accept(streaming("dropped-first"));
    failing.accept(streaming("dropped-second", { assistantMessageId: "other" }));
    assert.throws(
      () => failing.dispose(),
      (error) => error === emitFailure,
    );
    failing.accept(streaming("still-accepting"));
    failing.flush();
    assert.equal(failingOutput.length, 1);
    assert.equal((failingOutput[0] as typeof merged).event.payload!.delta, "still-accepting");
    failing.dispose();

    const immediateOutput: KnorviaAgentServiceEvent[] = [];
    const params = {
      emit: (event: KnorviaAgentServiceEvent) => immediateOutput.push(event),
      flushDelayMs: 0,
      maxItems: 0,
    };
    const immediate = createBackgroundSessionEventCoalescer(params);
    const passthrough = streaming("");
    immediate.accept(passthrough);
    assert.equal(immediateOutput[0], passthrough);
    params.emit = (event) => output.push(event);
    output.length = 0;
    immediate.accept(progress);
    assert.equal(output[0], progress);
    immediate.dispose();
    collision.dispose();

    const reads: string[] = [];
    const getterOutput: KnorviaAgentServiceEvent[] = [];
    const getters = createBackgroundSessionEventCoalescer({
      emit: (event) => getterOutput.push(event),
    });
    const current = wrap("model.streaming", {
      kind: "text_delta",
      get delta() {
        reads.push("current-delta");
        return "A";
      },
    });
    const next = wrap("model.streaming", {
      kind: "text_delta",
      get delta() {
        reads.push("next-delta");
        return "B";
      },
    });
    Object.defineProperty((next as typeof merged).event, "traceId", {
      enumerable: true,
      get() {
        reads.push("next-envelope");
        return "synthetic-trace";
      },
    });
    getters.accept(current);
    reads.length = 0;
    getters.accept(next);
    assert.deepEqual(reads, [
      "next-delta",
      "current-delta",
      "next-delta",
      "next-envelope",
      "next-delta",
    ]);
    getters.flush();
    assert.equal((getterOutput[0] as typeof merged).event.payload!.delta, "AB");
    getters.dispose();
  } finally {
    mock.timers.reset();
  }
});
