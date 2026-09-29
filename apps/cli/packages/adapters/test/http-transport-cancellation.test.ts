// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  api,
  options,
  url,
  fetchWith,
  timers,
  rejected,
  portError,
  createHttpClientError,
  getEventListeners,
  turn,
} from "./http-transport.fixture.js";

for (const value of [0, -1, NaN])
  test(`nonpositive or NaN timeout schedules no timer: ${value}`, async (t) => {
    const time = timers(t);
    fetchWith(t, async () => new Response(null));
    await new api.NodeHttpClientAdapter({ env: {}, timeoutMs: 123 }).request({
      url,
      timeoutMs: value,
    });
    assert.deepEqual(time.delays, []);
    assert.deepEqual(time.cleared, []);
  });
test("request timeout overrides adapter timeout and is removed on success", async (t) => {
  const time = timers(t);
  fetchWith(t, async () => new Response(null));
  await new api.NodeHttpClientAdapter({ env: {}, timeoutMs: 80 }).request({ url, timeoutMs: 25 });
  assert.deepEqual(time.delays, [25]);
  assert.equal(time.cleared.length, 1);
});
test("parent signal listener is owned and removed after success", async (t) => {
  const parent = new AbortController();
  const before = getEventListeners(parent.signal, "abort").length;
  fetchWith(t, async (_, init) => {
    assert.equal(getEventListeners(parent.signal, "abort").length, before + 1);
    assert.ok(init?.signal);
    return new Response(null);
  });
  await new api.NodeHttpClientAdapter(options).request({ url }, { signal: parent.signal });
  assert.equal(getEventListeners(parent.signal, "abort").length, before);
});
test("already aborted parent preserves reason without adding listener", async (t) => {
  const parent = new AbortController(),
    cause = new Error("owned abort");
  parent.abort(cause);
  fetchWith(t, async (_, init) => {
    assert.equal(init?.signal?.reason, cause);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
    throw cause;
  });
  const error = portError(
    await rejected(
      new api.NodeHttpClientAdapter(options).request({ url }, { signal: parent.signal }),
    ),
    "cancelled",
  );
  assert.equal(error.cause, cause);
  assert.equal(error.message, cause.message);
});
test("caller cancellation propagates to pending transport and unlinks on failure", async (t) => {
  const parent = new AbortController(),
    pending = Promise.withResolvers<Response>(),
    reason = new Error("owned caller");
  let signal: AbortSignal | undefined;
  fetchWith(t, (_, init) => {
    signal = init?.signal ?? undefined;
    return pending.promise;
  });
  const request = new api.NodeHttpClientAdapter(options).request(
    { url },
    { signal: parent.signal },
  );
  parent.abort(reason);
  assert.equal(signal?.aborted, true);
  assert.equal(signal?.reason, reason);
  pending.reject(reason);
  const error = portError(await rejected(request), "cancelled");
  assert.equal(error.cause, reason);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});
test("timeout flag outranks earlier caller abort if work is still pending", async (t) => {
  const time = timers(t),
    parent = new AbortController(),
    pending = Promise.withResolvers<Response>();
  const first = new Error("owned parent");
  let signal: AbortSignal | undefined;
  fetchWith(t, (_, init) => {
    signal = init?.signal ?? undefined;
    return pending.promise;
  });
  const request = new api.NodeHttpClientAdapter({ env: {}, timeoutMs: 19 }).request(
    { url },
    { signal: parent.signal },
  );
  parent.abort(first);
  time.callbacks[0]!();
  assert.equal(signal?.reason, first);
  pending.reject(first);
  const error = portError(await rejected(request), "timeout");
  assert.equal(error.message, first.message);
  assert.equal(error.cause, first);
  assert.equal(time.cleared.length, 1);
});
test("timer cancellation message is visible to transport and normalization", async (t) => {
  const time = timers(t),
    pending = Promise.withResolvers<Response>();
  let signal: AbortSignal | undefined;
  fetchWith(t, (_, init) => {
    signal = init?.signal ?? undefined;
    return pending.promise;
  });
  const request = new api.NodeHttpClientAdapter({ env: {}, timeoutMs: 23 }).request({ url });
  time.callbacks[0]!();
  const cause = signal?.reason;
  assert.ok(cause instanceof Error);
  assert.equal(cause.message, "HTTP request timed out after 23ms");
  pending.reject(cause);
  const error = portError(await rejected(request), "timeout");
  assert.equal(error.cause, cause);
  assert.equal(error.message, cause.message);
});
test("existing port error keeps identity despite cancellation and timeout", async (t) => {
  const time = timers(t),
    pending = Promise.withResolvers<Response>();
  const original = createHttpClientError({
    code: "too_large",
    url: "https://owned.invalid",
    status: 418,
    message: "owned limit",
  });
  fetchWith(t, () => pending.promise);
  const request = new api.NodeHttpClientAdapter({ env: {}, timeoutMs: 1 }).request({ url });
  time.callbacks[0]!();
  pending.reject(original);
  assert.equal(await rejected(request), original);
});
for (const cause of [undefined, "owned failure", 0])
  test(`plain rejection ${String(cause)} retains cause and fallback message`, async (t) => {
    fetchWith(t, async () => {
      throw cause;
    });
    const error = portError(
      await rejected(new api.NodeHttpClientAdapter(options).request({ url })),
      "network_error",
    );
    assert.equal(error.message, "HTTP request failed");
    assert.equal(error.cause, cause);
    assert.equal(error.status, undefined);
  });
test("DOM AbortError maps to cancelled without an aborted controller", async (t) => {
  const cause = new DOMException("native detail", "AbortError");
  fetchWith(t, async () => {
    throw cause;
  });
  const error = portError(
    await rejected(new api.NodeHttpClientAdapter(options).request({ url })),
    "cancelled",
  );
  assert.equal(error.cause, cause);
  assert.equal(error.message, "HTTP request was cancelled");
});
test("ordinary Error named AbortError remains a network error", async (t) => {
  const cause = new Error("ordinary detail");
  cause.name = "AbortError";
  fetchWith(t, async () => {
    throw cause;
  });
  const error = portError(
    await rejected(new api.NodeHttpClientAdapter(options).request({ url })),
    "network_error",
  );
  assert.equal(error.cause, cause);
  assert.equal(error.message, cause.message);
});
test("concurrent requests keep separate signals and completion cleanup", async (t) => {
  const first = Promise.withResolvers<Response>(),
    second = Promise.withResolvers<Response>(),
    parent = new AbortController();
  const signals: AbortSignal[] = [];
  let count = 0;
  fetchWith(t, (_, init) => {
    assert.ok(init?.signal);
    signals.push(init.signal);
    return count++ === 0 ? first.promise : second.promise;
  });
  const adapter = new api.NodeHttpClientAdapter(options),
    one = adapter.request({ url }, { signal: parent.signal }),
    two = adapter.request({ url });
  assert.notEqual(signals[0], signals[1]);
  parent.abort("owned");
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
  first.reject(undefined);
  const error = portError(await rejected(one), "cancelled");
  assert.equal(error.message, "HTTP request was cancelled");
  second.resolve(new Response("second"));
  assert.equal((await two).bytes, 6);
  await turn();
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});
