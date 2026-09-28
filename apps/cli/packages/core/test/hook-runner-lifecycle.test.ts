// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { SessionEventType, type Logger, type SessionEvent } from "@knorvia/contracts";
import { InMemoryHookRunner } from "../src/hooks/runner.js";
import { deferred, hookPayload, runnerInput } from "./hook-runner-fixture.js";
import type { HookRunOptions } from "../src/hooks/types.js";

test("a pre-cancelled parent never invokes the callback", async () => {
  const parent = new AbortController(),
    events: SessionEvent[] = [];
  let calls = 0;
  parent.abort("before dispatch");
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          calls++;
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event);
    },
  });
  assert.deepEqual(await runner.run(runnerInput(), { signal: parent.signal }), {
    additionalContexts: [],
  });
  assert.equal(calls, 0);
  assert.deepEqual(
    events.map((e) => e.type),
    [SessionEventType.HookRunStarted, SessionEventType.HookRunFailed],
  );
  assert.equal(hookPayload(events[1]!).outcome, "cancelled");
});

test("parent cancellation settles once, unlinks the listener and ignores a late callback result", async (t) => {
  const started = deferred(),
    release = deferred(),
    parent = new AbortController();
  const add = t.mock.method(parent.signal, "addEventListener"),
    remove = t.mock.method(parent.signal, "removeEventListener");
  const events: SessionEvent[] = [];
  let child: AbortSignal | undefined;
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: async (_input, context) => {
          child = context.signal;
          started.resolve();
          await release.promise;
          return { additionalContext: "too late" };
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event);
    },
  });
  const pending = runner.run(runnerInput(), { signal: parent.signal });
  await started.promise;
  parent.abort("parent reason");
  const result = await pending;
  assert.deepEqual(result, { additionalContexts: [] });
  assert.equal(child?.reason, "parent reason");
  assert.equal(add.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(hookPayload(events[1]!).outcome, "cancelled");
  release.resolve();
  await setImmediate();
  assert.equal(events.length, 2);
  assert.deepEqual(result, { additionalContexts: [] });
});

test("timeout starts at callback dispatch while lifecycle duration includes Started waiting", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const publishing = deferred(),
    releasePublication = deferred(),
    executing = deferred(),
    releaseCallback = deferred();
  const parent = new AbortController(),
    events: SessionEvent[] = [];
  const remove = t.mock.method(parent.signal, "removeEventListener");
  const runner = new InMemoryHookRunner({
    defaultTimeoutMs: 25,
    hooks: [
      {
        event: "PreToolUse",
        callback: async () => {
          executing.resolve();
          await releaseCallback.promise;
          return { additionalContext: "late" };
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event);
      if (event.type === SessionEventType.HookRunStarted) {
        publishing.resolve();
        await releasePublication.promise;
      }
    },
  });
  const pending = runner.run(runnerInput(), { signal: parent.signal });
  await publishing.promise;
  t.mock.timers.tick(100);
  assert.equal(events.length, 1);
  releasePublication.resolve();
  await executing.promise;
  t.mock.timers.tick(24);
  assert.equal(events.length, 1);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(hookPayload(events[1]!).outcome, "timed_out");
  assert.equal(hookPayload(events[1]!).durationMs, 125);
  assert.equal(remove.mock.callCount(), 1);
  releaseCallback.resolve();
  await setImmediate();
  assert.equal(events.length, 2);
  assert.deepEqual(result, { additionalContexts: [] });
});

test("normal completion clears the timeout and parent listener", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController(),
    events: SessionEvent[] = [];
  const remove = t.mock.method(parent.signal, "removeEventListener");
  let child: AbortSignal | undefined;
  const runner = new InMemoryHookRunner({
    defaultTimeoutMs: 10,
    hooks: [
      {
        event: "PreToolUse",
        callback: (_input, context) => {
          child = context.signal;
          return { additionalContext: "done" };
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event);
    },
  });
  assert.deepEqual(await runner.run(runnerInput(), { signal: parent.signal }), {
    additionalContexts: ["done"],
  });
  t.mock.timers.tick(50);
  parent.abort("late parent cancellation");
  await setImmediate();
  assert.equal(child?.aborted, false);
  assert.equal(events.length, 2);
  assert.equal(remove.mock.callCount(), 1);
});

test("synchronous callback failure cleans up and later hooks still execute", async (t) => {
  const parent = new AbortController(),
    events: SessionEvent[] = [];
  const remove = t.mock.method(parent.signal, "removeEventListener");
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          throw new Error("fixture sync failure");
        },
      },
      { event: "PreToolUse", callback: () => ({ additionalContext: "later" }) },
    ],
    emitEvent: async (event) => {
      events.push(event);
    },
  });
  assert.deepEqual(await runner.run(runnerInput(), { signal: parent.signal }), {
    additionalContexts: ["later"],
  });
  assert.equal(remove.mock.callCount(), 2);
  assert.equal(hookPayload(events[1]!).outcome, "failed");
  assert.equal(hookPayload(events[1]!).errorMessage, "fixture sync failure");
});

test("Started publication failure escapes unchanged without callback or failure event", async () => {
  const failure = new Error("fixture started publication"),
    events: string[] = [];
  let calls = 0;
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          calls++;
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event.type);
      throw failure;
    },
  });
  await assert.rejects(runner.run(runnerInput()), (error) => error === failure);
  assert.equal(calls, 0);
  assert.deepEqual(events, [SessionEventType.HookRunStarted]);
});

test("failure publication failure escapes unchanged and stops the remaining hooks", async () => {
  const failure = new Error("fixture failed publication"),
    events: string[] = [];
  let later = 0;
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          throw new Error("callback failure");
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
      if (event.type === SessionEventType.HookRunFailed) throw failure;
    },
  });
  await assert.rejects(runner.run(runnerInput()), (error) => error === failure);
  assert.equal(later, 0);
  assert.deepEqual(events, [SessionEventType.HookRunStarted, SessionEventType.HookRunFailed]);
});

test("only blocked outcomes attach trimmed and bounded callback diagnostics", async () => {
  for (const blocked of [false, true]) {
    const events: SessionEvent[] = [];
    const runner = new InMemoryHookRunner({
      hooks: [
        {
          event: "PreToolUse",
          callback: () => ({
            kind: "hookCallbackResult",
            diagnostics: {
              errorMessage: "  detail  ",
              stderrPreview: "x".repeat(4100),
              stdoutPreview: "   ",
            },
            output: blocked
              ? { decision: "block", reason: "refused" }
              : { additionalContext: "accepted" },
          }),
        },
      ],
      emitEvent: async (event) => {
        events.push(event);
      },
    });
    await runner.run(runnerInput());
    const result = hookPayload(events[1]!);
    assert.equal(result.errorMessage, blocked ? "detail" : undefined);
    assert.equal(result.stderrPreview?.length, blocked ? 4000 : undefined);
    assert.equal(Object.hasOwn(result, "stdoutPreview"), false);
  }
});

test("signal is read after Started so a replacement cancelled signal prevents dispatch", async () => {
  const publishing = deferred(),
    release = deferred(),
    cancelled = new AbortController();
  const options: HookRunOptions = { signal: new AbortController().signal };
  const events: SessionEvent[] = [];
  let calls = 0;
  const runner = new InMemoryHookRunner({
    hooks: [
      {
        event: "PreToolUse",
        callback: () => {
          calls++;
        },
      },
    ],
    emitEvent: async (event) => {
      events.push(event);
      if (event.type === SessionEventType.HookRunStarted) {
        publishing.resolve();
        await release.promise;
      }
    },
  });
  const pending = runner.run(runnerInput(), options);
  await publishing.promise;
  cancelled.abort("replacement");
  options.signal = cancelled.signal;
  release.resolve();
  await pending;
  assert.equal(calls, 0);
  assert.equal(hookPayload(events[1]!).outcome, "cancelled");
});

for (const background of [false, true])
  test(`${background ? "background" : "foreground"} signal access failure preserves its original catch boundary`, async () => {
    const failure = new Error("fixture signal getter"),
      events: string[] = [],
      warnings: string[] = [];
    const logger: Logger = {
      debug() {},
      info() {},
      error() {},
      child() {
        return this;
      },
      warn(message) {
        assert.equal(this, logger);
        warnings.push(message);
      },
    };
    const runner = new InMemoryHookRunner({
      logger,
      hooks: [
        {
          event: "PreToolUse",
          async: background,
          callback: () => {
            throw new Error("must not dispatch");
          },
        },
      ],
      emitEvent: async (event) => {
        events.push(event.type);
      },
    });
    const pending = runner.run(runnerInput(), {
      get signal(): AbortSignal {
        throw failure;
      },
    });
    if (background) {
      await assert.rejects(pending, (error) => error === failure);
      assert.deepEqual(events, [SessionEventType.HookRunStarted]);
      assert.deepEqual(warnings, []);
    } else {
      assert.deepEqual(await pending, { additionalContexts: [] });
      assert.deepEqual(events, [SessionEventType.HookRunStarted, SessionEventType.HookRunFailed]);
      assert.deepEqual(warnings, ["Hook execution failed"]);
    }
  });
