// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionBrokerResult } from "@knorvia/contracts";
import { responders, reactions } from "./permission-approval-fixture.js";

test("broker starts synchronously before hooks with input receivers and ordered result keys", async () => {
  const f = responders(),
    result: PermissionBrokerResult = { decision: "allow" };
  const pending = f.start();
  assert.deepEqual(f.timeline, ["broker-start", "hook-start"]);
  assert.equal(f.listeners(), 2);
  f.broker.resolve(result);
  f.hooks.resolve({ decision: "deny" });
  const outcome = await pending;
  assert.equal(outcome.result, result);
  assert.deepEqual(Object.keys(outcome), ["result", "source"]);
  assert.equal(outcome.source, "broker");
  assert.equal(f.signal("hook").aborted, true);
  assert.equal(f.signal("broker").aborted, false);
  assert.equal(f.listeners(), 0);
  assert.equal(f.claim(), false);
});

test("two previously fulfilled native promises still prefer the first registered broker reaction", async () => {
  const f = responders();
  f.hooks.resolve({ decision: "deny" });
  f.broker.resolve({ decision: "allow" });
  assert.equal((await f.start()).source, "broker");
});

test("hook winner does not wait for an uncooperative broker and consumes its late rejection", async () => {
  const f = responders(),
    result: PermissionBrokerResult = { decision: "modify", modifiedInput: { fixture: 1 } };
  const pending = f.start();
  f.hooks.resolve(result);
  const outcome = await pending;
  assert.equal(outcome.result, result);
  assert.equal(outcome.source, "hook");
  assert.equal(f.signal("broker").aborted, true);
  assert.equal(f.signal("hook").aborted, false);
  assert.equal(f.signal("broker").reason.name, "AbortError");
  assert.equal(f.listeners(), 0);
  f.broker.reject({ late: true });
  await reactions();
  assert.deepEqual(f.failures, []);
});

test("hook abstention and hook rejection leave the broker pending", async () => {
  for (const rejected of [false, true]) {
    const f = responders(),
      failure = { hook: "failed" };
    let completed = false;
    const pending = f.start().then((outcome) => {
      completed = true;
      return outcome;
    });
    if (rejected) f.hooks.reject(failure);
    else f.hooks.resolve(undefined);
    await reactions();
    assert.equal(completed, false);
    assert.equal(f.signal("broker").aborted, false);
    assert.deepEqual(f.failures, rejected ? [failure] : []);
    f.broker.resolve({ decision: "deny" });
    assert.equal((await pending).source, "broker");
  }
});

test("broker rejection keeps original failure and late hook rejection cannot report again", async () => {
  const f = responders(),
    failure = { broker: "failed" };
  const pending = f.start();
  f.broker.reject(failure);
  await assert.rejects(pending, (error) => error === failure);
  assert.equal(f.signal("hook").aborted, true);
  assert.equal(f.listeners(), 0);
  f.hooks.reject({ late: true });
  await reactions();
  assert.deepEqual(f.failures, []);
});

test("claim reserves broker before hook reaction and remains reusable until broker completion", async () => {
  const f = responders();
  let completed = false;
  const pending = f.start().then((outcome) => {
    completed = true;
    return outcome;
  });
  f.hooks.resolve({ decision: "allow" });
  assert.equal(f.claim(), true);
  assert.equal(f.claim(), true);
  assert.equal(f.signal("hook").aborted, true);
  await reactions();
  assert.equal(completed, false);
  // 持久提交失败后请求仍在，重试必须保留 claim 能力，不能让 Hook 重新接管。
  assert.equal(f.claim(), true);
  f.broker.resolve({ decision: "deny" });
  assert.equal((await pending).source, "broker");
  assert.equal(f.claim(), false);
});

test("hook failure after claim is reported until broker truly settles", async () => {
  const f = responders(),
    failure = { hook: "cancelled" };
  const pending = f.start();
  assert.equal(f.claim(), true);
  f.hooks.reject(failure);
  await reactions();
  assert.deepEqual(f.failures, [failure]);
  f.broker.resolve({ decision: "allow" });
  await pending;
});

test("parent cancellation forwards the original reason but broker owns the rejection", async () => {
  const f = responders(),
    reason = { stopped: true };
  let completed = false;
  const pending = f.start();
  void pending.then(
    () => {
      completed = true;
    },
    () => {
      completed = true;
    },
  );
  f.parent.abort(reason);
  assert.equal(f.signal("broker").reason, reason);
  assert.equal(f.signal("hook").reason, reason);
  assert.equal(f.claim(), false);
  await reactions();
  assert.equal(completed, false);
  f.broker.reject(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(f.listeners(), 0);
});

test("pre-aborted input still invokes both responders and cannot claim", async () => {
  const f = responders(),
    reason = { stopped: "before" };
  f.parent.abort(reason);
  const pending = f.start();
  assert.deepEqual(f.timeline, ["broker-start", "hook-start"]);
  assert.equal(f.signal("hook").reason, reason);
  assert.equal(f.signal("broker").reason, reason);
  assert.equal(f.claim(), false);
  f.broker.reject(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(f.listeners(), 0);
});

test("loser abort sees settled state and parent listeners are gone before caller resumes", async () => {
  const f = responders();
  const pending = f.start();
  const originalRemove = f.parent.signal.removeEventListener.bind(f.parent.signal);
  f.parent.signal.removeEventListener = (...args: Parameters<typeof originalRemove>) => {
    f.timeline.push("unlink");
    originalRemove(...args);
  };
  f.signal("hook").addEventListener("abort", () => assert.equal(f.claim(), false), { once: true });
  f.broker.resolve({ decision: "allow" });
  await pending;
  f.timeline.push("caller");
  assert.deepEqual(f.timeline, [
    "broker-start",
    "hook-start",
    "hook-abort",
    "unlink",
    "unlink",
    "caller",
  ]);
  f.parent.abort("after");
  assert.equal(f.signal("broker").aborted, false);
});

test("synchronous broker startup failure skips hook and unlinks parent signals", async () => {
  const f = responders(),
    failure = { startup: "broker" };
  f.input.requestBroker = () => {
    throw failure;
  };
  await assert.rejects(f.start(), (error) => error === failure);
  assert.deepEqual(f.timeline, []);
  assert.equal(f.listeners(), 0);
});

test("synchronous hook startup failure retains the existing late broker cleanup boundary", async () => {
  const f = responders(),
    failure = { startup: "hook" };
  f.input.runHooks = () => {
    throw failure;
  };
  await assert.rejects(f.start(), (error) => error === failure);
  assert.deepEqual(f.timeline, ["broker-start"]);
  assert.equal(f.signal("broker").aborted, false);
  assert.equal(f.listeners(), 0);
  f.parent.abort("after");
  assert.equal(f.signal("broker").aborted, false);
  f.broker.resolve({ decision: "deny" });
  await reactions();
});
