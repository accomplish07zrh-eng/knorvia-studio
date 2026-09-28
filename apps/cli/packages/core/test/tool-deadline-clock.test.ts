// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SessionEventType, type SessionEvent } from "@knorvia/contracts";
import {
  ToolDeadline,
  observeToolAdmissionClock,
  resolveTimeoutMs,
  linkAbortSignal,
} from "../src/tool/executor/timeout.js";
import { clock, entry } from "./tool-deadline-fixture.js";

test("nested waits count their union and preserve the remaining running budget", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(100);
  let expired = 0;
  deadline.start(() => expired++);
  time.tick(20);
  deadline.pause();
  assert.equal(time.pending.size, 0);
  time.tick(30);
  deadline.pause();
  assert.equal(deadline.queuedMs, 30);
  time.tick(10);
  deadline.resume();
  assert.equal(time.pending.size, 0);
  time.tick(20);
  deadline.resume();
  assert.equal(deadline.queuedMs, 60);
  assert.deepEqual(time.delays, [100, 80]);
  time.tick(79);
  assert.equal(expired, 0);
  time.tick(1);
  assert.equal(expired, 1);
  assert.equal(deadline.queuedMs, 60);
});

test("pre-start pause, no-timeout accounting and redundant resume remain well defined", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(undefined);
  deadline.resume();
  deadline.pause();
  time.tick(8);
  deadline.pause();
  deadline.start(() => assert.fail("no timeout"));
  time.tick(9);
  deadline.resume();
  assert.equal(deadline.queuedMs, 17);
  time.tick(3);
  deadline.resume();
  deadline.resume();
  assert.equal(deadline.queuedMs, 20);
  assert.equal(time.pending.size, 0);
  assert.deepEqual(time.delays, []);
});

test("clear preserves queue accounting and remaining budget but disables automatic rearm", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(100);
  let expired = 0;
  deadline.start(() => expired++);
  time.tick(25);
  deadline.pause();
  time.tick(10);
  deadline.clear();
  time.tick(20);
  deadline.resume();
  assert.equal(deadline.queuedMs, 30);
  assert.equal(time.pending.size, 0);
  deadline.start(() => (expired += 2));
  assert.equal(time.delays.at(-1), 75);
  time.tick(75);
  assert.equal(expired, 2);
  deadline.clear();
  deadline.pause();
  time.tick(10);
  deadline.resume();
  assert.equal(deadline.queuedMs, 40);
  assert.equal(time.pending.size, 0);
});

test("overdue pause clamps to zero and clear while running does not charge unpaused elapsed", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(10);
  deadline.start(() => {});
  time.elapse(15);
  deadline.pause();
  deadline.resume();
  assert.equal(time.delays.at(-1), 0);
  deadline.clear();
  const again = new ToolDeadline(50);
  again.start(() => {});
  time.elapse(20);
  again.clear();
  again.start(() => {});
  assert.equal(time.delays.at(-1), 50);
  again.clear();
});

test("repeated start keeps its existing non-reset behavior and only clear removes the current timer", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(10);
  let first = 0;
  let second = 0;
  deadline.start(() => first++);
  time.elapse(2);
  deadline.start(() => second++);
  assert.equal(time.pending.size, 2);
  time.tick(8);
  assert.equal(first, 0);
  assert.equal(second, 1);
  time.tick(2);
  assert.equal(second, 2);
  deadline.clear();
});

test("status observations affect only this tool and only queued/admitted types", (t) => {
  const time = clock(t);
  const deadline = new ToolDeadline(10);
  const observe = (payload: unknown, type = SessionEventType.ModelNetworkStatus) =>
    observeToolAdmissionClock({ type, payload } as SessionEvent, "current", deadline);
  deadline.start(() => {});
  observe(undefined);
  observe({ toolCallId: "other", type: "model_request_queued" });
  observe({ toolCallId: "current", type: "unrelated" });
  assert.equal(time.pending.size, 1);
  observe({ toolCallId: "current", type: "model_request_queued" });
  assert.equal(time.pending.size, 0);
  time.tick(7);
  observe({ toolCallId: "current", type: "model_request_admitted" });
  assert.equal(time.pending.size, 1);
  assert.equal(deadline.queuedMs, 7);
  deadline.clear();
});

test("budget precedence and coercion preserve resolver, override, caps and grace", () => {
  const tool = entry({
    timeout: { defaultMs: 80, allowCallOverride: true, maxMs: 70, cleanupGraceMs: 3.9 },
  });
  assert.equal(resolveTimeoutMs(tool, {}, 90), 73);
  assert.equal(resolveTimeoutMs(tool, { timeout: 12.9, timeout_ms: 14.9 }, 90), 17);
  assert.equal(resolveTimeoutMs(tool, { timeout: -5 }, 90), 4);
  tool.resolveTimeoutBudgetMs = function (_input, supplied) {
    assert.equal(this, tool);
    assert.equal(supplied, modelContext);
    return 40.7;
  };
  const modelContext = {};
  assert.equal(resolveTimeoutMs(tool, { timeout_ms: 1 }, 90, modelContext), 43);
  tool.timeout = { kind: "none" };
  assert.equal(resolveTimeoutMs(tool, {}, 1), undefined);
  const plain = entry();
  assert.equal(resolveTimeoutMs(plain, {}, 90), 100);
  plain.metadata.timeoutMs = undefined;
  assert.equal(resolveTimeoutMs(plain, {}, 90), 90);
});

test("invalid numeric budgets retain the existing Math semantics instead of silent defaults", () => {
  for (const value of [NaN, Infinity, -Infinity, 0, -4, 1.9]) {
    const tool = entry({
      timeout: { defaultMs: value, allowCallOverride: false, cleanupGraceMs: -1.9 },
    });
    assert.ok(
      Object.is(resolveTimeoutMs(tool, { timeout_ms: 3 }, 8), Math.max(1, Math.trunc(value))),
    );
  }
});

test("abort links preserve reason, unlink isolation and existing child cancellation", () => {
  const parent = new AbortController();
  const child = new AbortController();
  const unlink = linkAbortSignal(parent.signal, child);
  unlink();
  unlink();
  parent.abort("late");
  assert.equal(child.signal.aborted, false);
  linkAbortSignal(parent.signal, child);
  assert.equal(child.signal.reason, "late");
  const other = new AbortController();
  other.abort("own");
  linkAbortSignal(parent.signal, other);
  assert.equal(other.signal.reason, "own");
  linkAbortSignal(undefined, new AbortController())();
});
