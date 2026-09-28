// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SessionEventType, type SessionEvent } from "@knorvia/contracts";
import { InMemoryHookRunner } from "../src/hooks/runner.js";
import type { HookRegistration } from "../src/hooks/types.js";
import { deferred, descriptor, hookPayload, runnerInput } from "./hook-runner-fixture.js";

for (const background of [false, true])
  for (const disabled of [false, true])
    test(`${background ? "background" : "foreground"} dispatch rechecks ${disabled ? "disable" : "revoke"} after Started publication`, async () => {
      const started = deferred(),
        release = deferred();
      const events: SessionEvent[] = [];
      let allowed = true,
        calls = 0,
        checks = 0;
      const runner = new InMemoryHookRunner({
        emitEvent: async (event) => {
          events.push(event);
          if (event.type === SessionEventType.HookRunStarted) {
            started.resolve();
            await release.promise;
          }
        },
        hooks: [
          {
            event: "PreToolUse",
            async: background,
            descriptor: descriptor(),
            admission: () => {
              checks++;
              return {
                allowed,
                skipLifecycle: !allowed && disabled,
                reasonCode: "fixture_revoked",
              };
            },
            callback: () => {
              calls++;
            },
          },
        ],
      });
      const pending = runner.run(runnerInput());
      await started.promise;
      allowed = false;
      release.resolve();
      const result = await pending;
      assert.equal(calls, 0);
      assert.equal(checks, 3);
      assert.deepEqual(result, { additionalContexts: [] });
      assert.deepEqual(
        events.map((e) => e.type),
        [SessionEventType.HookRunStarted, SessionEventType.HookRunBlocked],
      );
      const first = hookPayload(events[0]!),
        last = hookPayload(events[1]!);
      assert.equal(first.hookRunId, last.hookRunId);
      assert.equal(first.hookInvocationId, last.hookInvocationId);
      assert.equal(last.hookCount, 1);
      assert.equal(last.errorCode, "fixture_revoked");
    });

test("initial refusal and skipLifecycle preserve participation, visible count and runtime indices", async () => {
  const events: SessionEvent[] = [],
    callbacks: [string, number][] = [];
  const hooks: HookRegistration[] = [
    {
      event: "PreToolUse",
      admission: () => ({ allowed: false, skipLifecycle: true }),
      descriptor: descriptor(),
      callback: () => {
        throw new Error("disabled callback");
      },
    },
    {
      event: "PreToolUse",
      source: "internal",
      callback: (_input, context) => {
        callbacks.push(["internal", context.hookIndex]);
      },
    },
    {
      event: "PreToolUse",
      source: "refused",
      descriptor: descriptor(),
      admission: () => ({ allowed: false, reasonCode: "initial" }),
      callback: () => {
        throw new Error("refused callback");
      },
    },
    {
      event: "PreToolUse",
      source: "visible",
      descriptor: descriptor(),
      callback: (_input, context) => {
        callbacks.push(["visible", context.hookIndex]);
      },
    },
  ];
  const runner = new InMemoryHookRunner({
    hooks,
    emitEvent: async (event) => {
      events.push(event);
    },
  });
  assert.deepEqual(await runner.run(runnerInput()), { additionalContexts: [] });
  assert.deepEqual(callbacks, [
    ["internal", 0],
    ["visible", 2],
  ]);
  assert.ok(events.every((event) => hookPayload(event).hookCount === 2));
  const refused = events.filter((event) => hookPayload(event).hookSource === "refused");
  assert.deepEqual(
    refused.map((event) => event.type),
    [SessionEventType.HookRunBlocked],
  );
  assert.equal(hookPayload(refused[0]!).hookIndex, 0);
  const visible = events.filter((event) => hookPayload(event).hookSource === "visible");
  assert.equal(hookPayload(visible[0]!).hookIndex, 1);
});

for (const background of [false, true])
  test(`${background ? "background" : "foreground"} late skipLifecycle closes Started even when allowed remains true`, async () => {
    let checks = 0,
      calls = 0;
    const events: SessionEvent[] = [];
    const runner = new InMemoryHookRunner({
      hooks: [
        {
          event: "PreToolUse",
          async: background,
          descriptor: descriptor(),
          admission: () => ({ allowed: true, skipLifecycle: ++checks === 3 }),
          callback: () => {
            calls++;
          },
        },
        { event: "PreToolUse", callback: () => ({ additionalContext: "later" }) },
      ],
      emitEvent: async (event) => {
        events.push(event);
      },
    });
    assert.deepEqual(await runner.run(runnerInput()), { additionalContexts: ["later"] });
    assert.equal(calls, 0);
    assert.deepEqual(
      events.slice(0, 2).map((event) => event.type),
      [SessionEventType.HookRunStarted, SessionEventType.HookRunBlocked],
    );
    assert.equal(hookPayload(events[1]!).hookRunId, hookPayload(events[0]!).hookRunId);
    assert.equal(hookPayload(events[1]!).hookCount, 1);
  });

for (const background of [false, true])
  test(`${background ? "background" : "foreground"} post-Started refusal reports the full lifecycle duration`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1000 });
    const started = deferred(),
      release = deferred();
    const events: SessionEvent[] = [];
    let allowed = true,
      calls = 0;
    const runner = new InMemoryHookRunner({
      hooks: [
        {
          event: "PreToolUse",
          async: background,
          admission: () => ({ allowed, reasonCode: "revoked" }),
          callback: () => {
            calls++;
          },
        },
      ],
      emitEvent: async (event) => {
        events.push(event);
        if (event.type === SessionEventType.HookRunStarted) {
          started.resolve();
          await release.promise;
        }
      },
    });
    const pending = runner.run(runnerInput());
    await started.promise;
    t.mock.timers.tick(125);
    allowed = false;
    release.resolve();
    await pending;
    assert.equal(calls, 0);
    assert.equal(events[1]!.type, SessionEventType.HookRunBlocked);
    assert.equal(hookPayload(events[1]!).startedAt, 1000);
    assert.equal(hookPayload(events[1]!).durationMs, 125);
  });

test("a run snapshots registration membership while retaining existing registration objects", async () => {
  const started = deferred(),
    release = deferred();
  const order: string[] = [];
  const original: HookRegistration = {
    event: "PreToolUse",
    callback: () => {
      order.push("original");
    },
  };
  const hooks: HookRegistration[] = [
    {
      event: "PreToolUse",
      callback: async () => {
        order.push("first");
        started.resolve();
        await release.promise;
      },
    },
    original,
  ];
  const runner = new InMemoryHookRunner({ hooks });
  hooks.push({
    event: "PreToolUse",
    callback: () => {
      throw new Error("constructor array was not copied");
    },
  });
  const pending = runner.run(runnerInput());
  await started.promise;
  original.callback = () => {
    order.push("modified");
  };
  runner.register({
    event: "PreToolUse",
    callback: () => {
      order.push("late");
    },
  });
  release.resolve();
  await pending;
  assert.deepEqual(order, ["first", "modified"]);
  order.length = 0;
  await runner.run(runnerInput());
  assert.deepEqual(order, ["first", "modified", "late"]);
});

test("injected ports keep their original receivers and input identity", async () => {
  const input = runnerInput();
  let runner: InMemoryHookRunner;
  const seen: string[] = [];
  const hook: HookRegistration = {
    event: "PreToolUse",
    admission: function (value) {
      assert.equal(this, hook);
      assert.equal(value, input);
      seen.push("admission");
      return { allowed: true };
    },
    descriptor: function (value) {
      assert.equal(this, hook);
      assert.equal(value, input);
      seen.push("descriptor");
      return descriptor();
    },
    callback: function (value) {
      assert.equal(this, hook);
      assert.equal(value, input);
      seen.push("callback");
    },
  };
  runner = new InMemoryHookRunner({
    hooks: [hook],
    emitEvent: async function () {
      assert.equal(this, runner);
      seen.push("event");
    },
  });
  await runner.run(input);
  assert.equal(seen.filter((x) => x === "callback").length, 1);
  assert.equal(seen.filter((x) => x === "descriptor").length, 2);
  assert.equal(seen.filter((x) => x === "event").length, 2);
});

for (const revoked of [false, true])
  test(`Started publication cancellation ${revoked ? "with" : "without"} concurrent revocation`, async () => {
    const started = deferred(),
      release = deferred(),
      parent = new AbortController();
    const events: SessionEvent[] = [];
    let allowed = true,
      calls = 0;
    const runner = new InMemoryHookRunner({
      hooks: [
        {
          event: "PreToolUse",
          admission: () => ({ allowed, reasonCode: "revoked" }),
          callback: () => {
            calls++;
          },
        },
      ],
      emitEvent: async (event) => {
        events.push(event);
        if (event.type === SessionEventType.HookRunStarted) {
          started.resolve();
          await release.promise;
        }
      },
    });
    const pending = runner.run(runnerInput(), { signal: parent.signal });
    await started.promise;
    parent.abort("fixture cancellation");
    if (revoked) allowed = false;
    release.resolve();
    assert.deepEqual(await pending, { additionalContexts: [] });
    assert.equal(calls, 0);
    assert.equal(
      events[1]!.type,
      revoked ? SessionEventType.HookRunBlocked : SessionEventType.HookRunFailed,
    );
    assert.equal(hookPayload(events[1]!).outcome, revoked ? "blocked" : "cancelled");
  });
