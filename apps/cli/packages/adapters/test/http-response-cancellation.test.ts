// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  closed,
  observe,
  open,
  portError,
  readResponseBody,
  rejection,
  response,
  signal,
  turn,
  url,
} from "./http-response.fixture.js";

for (const cleanup of ["pending", "rejected", "throwing", "resolved"] as const) {
  test(`pending native read cancels without awaiting ${cleanup} producer cleanup`, async () => {
    const finish = Promise.withResolvers<void>();
    const fixture = open(() => {
      if (cleanup === "pending") return finish.promise;
      if (cleanup === "rejected") return Promise.reject(new Error("owned cleanup failure"));
      if (cleanup === "throwing") throw new Error("owned cleanup throw");
    });
    const abort = new AbortController();
    const baseline = getEventListeners(abort.signal, "abort").length;
    const observed = observe(readResponseBody(response(fixture.body), 5, abort.signal, url));
    await fixture.entered;
    abort.abort(new Error("owned caller reason"));
    await turn();
    const afterAbort = {
      settled: observed.state.settled,
      locked: fixture.body.locked,
      cancels: [...fixture.calls],
      listeners: getEventListeners(abort.signal, "abort").length,
    };
    // 旧实现也必须退出测试；仅解除测试自己的生产者，先保存取消时的真实状态。
    finish.resolve();
    fixture.controller.error(new Error("owned producer release"));
    await observed.done;
    assert.equal(
      afterAbort.settled,
      true,
      "public result must settle before producer cleanup completes",
    );
    assert.equal(afterAbort.locked, false);
    assert.deepEqual(afterAbort.cancels, [undefined]);
    assert.equal(afterAbort.listeners, baseline);
    assert.ok(observed.state.outcome && !observed.state.outcome.ok);
    portError(
      observed.state.outcome.error,
      "cancelled",
      "HTTP request was cancelled while reading response body",
    );
  });
}
test("already cancelled native body is cancelled and unlocked without reading data", async () => {
  const fixture = open();
  const abort = new AbortController();
  abort.abort("owned reason");
  const error = await rejection(readResponseBody(response(fixture.body), 10, abort.signal, url));
  fixture.controller.error(new Error("owned producer release"));
  portError(error, "cancelled", "HTTP request was cancelled while reading response body");
  assert.equal(fixture.body.locked, false);
  assert.deepEqual(fixture.calls, [undefined]);
});
test("abort while registering the listener is not lost", async () => {
  const fixture = open();
  const abort = new AbortController();
  const register = abort.signal.addEventListener.bind(abort.signal);
  Object.defineProperty(abort.signal, "addEventListener", {
    value: (...args: Parameters<AbortSignal["addEventListener"]>) => {
      abort.abort();
      register(...args);
    },
  });
  const observed = observe(readResponseBody(response(fixture.body), 1, abort.signal, url));
  await turn();
  const afterRegistration = { settled: observed.state.settled, locked: fixture.body.locked };
  fixture.controller.error(new Error("owned producer release"));
  await observed.done;
  assert.equal(afterRegistration.settled, true);
  assert.equal(afterRegistration.locked, false);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  assert.ok(observed.state.outcome && !observed.state.outcome.ok);
  portError(
    observed.state.outcome.error,
    "cancelled",
    "HTTP request was cancelled while reading response body",
  );
});
test("settled successful read releases its lock and ignores a later abort", async () => {
  const body = closed([new Uint8Array([4])]);
  const abort = new AbortController();
  const result = await readResponseBody(response(body), 1, abort.signal, url);
  abort.abort();
  assert.deepEqual(result, new Uint8Array([4]));
  assert.equal(body.locked, false);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
for (const [label, reason] of [
  ["error", new Error("owned read error")],
  ["undefined", undefined],
  ["null", null],
  ["string", "owned read rejection"],
] as const) {
  test(`native read ${label} failure observed first keeps identity after later abort`, async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(reason);
      },
    });
    const abort = new AbortController();
    const error = await rejection(readResponseBody(response(body), 1, abort.signal, url));
    abort.abort(new Error("late reason"));
    assert.equal(error, reason);
    assert.equal(body.locked, false);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  });
}
test("null-body pending fallback retains its uncancelled contract", async () => {
  const finish = Promise.withResolvers<ArrayBuffer>();
  const value = response(null);
  const abort = new AbortController();
  Object.defineProperty(value, "arrayBuffer", { value: () => finish.promise });
  const observed = observe(readResponseBody(value, 1, abort.signal, url));
  abort.abort();
  await turn();
  const settledAtAbort = observed.state.settled;
  finish.resolve(new Uint8Array([3]).buffer);
  await observed.done;
  assert.equal(settledAtAbort, false);
  assert.deepEqual(observed.state.outcome, { ok: true, bytes: new Uint8Array([3]) });
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("independent invocations cannot cancel or contaminate each other", async () => {
  const waiting = open();
  const cancelled = new AbortController();
  const first = observe(readResponseBody(response(waiting.body), 10, cancelled.signal, url));
  const second = readResponseBody(response(closed([new Uint8Array([8, 9])])), 2, signal(), url);
  cancelled.abort();
  await turn();
  const firstSettled = first.state.settled;
  waiting.controller.error(new Error("owned producer release"));
  await first.done;
  assert.equal(firstSettled, true);
  assert.deepEqual(await second, new Uint8Array([8, 9]));
});
