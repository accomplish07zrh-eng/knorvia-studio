// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  api,
  captureRequests,
  fulfilled,
  getEventListeners,
  lastSignal,
  message,
  nodeFixture,
  options,
  rejected,
  turns,
  url,
  watch,
} from "./proxy-fetch.fixture.js";

test("pending abort preserves Error identity and releases signal association", async (t) => {
  const seen = captureRequests(t),
    fixture = nodeFixture(t, { auto: false }),
    cancel = new AbortController(),
    reason = new Error("owned pending abort");
  const state = watch(api.createNetworkProxyFetch(options)(url, { signal: cancel.signal }));
  await turns();
  cancel.abort(reason);
  await turns();
  assert.equal(rejected(state()), reason);
  assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
  assert.equal(fixture.destroyed[0], reason);
  assert.deepEqual(fixture.escaped, []);
});
for (const reason of [undefined, "owned text", { owned: true }])
  test(`non-Error cancellation uses public AbortError: ${JSON.stringify(reason)}`, async (t) => {
    const fixture = nodeFixture(t, { auto: false }),
      cancel = new AbortController();
    const state = watch(api.createNetworkProxyFetch(options)(url, { signal: cancel.signal }));
    await turns();
    cancel.abort(reason);
    await turns();
    const error = rejected(state());
    assert.ok(error instanceof Error);
    assert.equal(error.name, "AbortError");
    if (reason !== undefined) assert.equal(error.message, "The operation was aborted.");
    assert.equal(fixture.destroyed[0], error);
    assert.deepEqual(fixture.escaped, []);
  });
test("already aborted request rejects before native transport", async (t) => {
  const seen = captureRequests(t),
    fixture = nodeFixture(t),
    reason = new Error("preaborted"),
    cancel = new AbortController();
  cancel.abort(reason);
  const state = watch(api.createNetworkProxyFetch(options)(url, { signal: cancel.signal }));
  await turns();
  assert.equal(rejected(state()), reason);
  assert.equal(fixture.captured.length, 0);
  assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
});
for (const stage of ["setupError", "endError"] as const)
  test(`${stage} preserves its cause and removes signal listener`, async (t) => {
    const seen = captureRequests(t),
      reason = new Error(stage),
      fixture = nodeFixture(t, { [stage]: reason, auto: false });
    const state = watch(api.createNetworkProxyFetch(options)(url));
    await turns();
    assert.equal(rejected(state()), reason);
    assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
    assert.deepEqual(fixture.escaped, []);
  });
test("early request error rejects once and leaves late errors observed", async (t) => {
  const seen = captureRequests(t),
    fixture = nodeFixture(t, { auto: false }),
    reason = new Error("first request error");
  const state = watch(api.createNetworkProxyFetch(options)(url));
  await turns();
  fixture.emit("error", reason);
  await turns();
  assert.equal(rejected(state()), reason);
  assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
  fixture.emit("error", new Error("late owned error"));
  await turns();
  assert.deepEqual(fixture.escaped, []);
  assert.equal(rejected(state()), reason);
});
test("late response after rejection is released rather than delivered", async (t) => {
  const fixture = nodeFixture(t, { auto: false, message: message(200, null) }),
    reason = new Error("first failure");
  const state = watch(api.createNetworkProxyFetch(options)(url));
  await turns();
  fixture.emit("error", reason);
  fixture.reply();
  await turns();
  assert.equal(rejected(state()), reason);
  assert.equal(fixture.incoming.destroyed, true);
  assert.deepEqual(fixture.escaped, []);
});
for (const status of [204, 205, 304])
  test(`no-body ${status} resolves and releases native message without reading`, async (t) => {
    const seen = captureRequests(t),
      incoming = message(status, null),
      fixture = nodeFixture(t, { message: incoming });
    const state = watch(api.createNetworkProxyFetch(options)(url));
    await turns();
    const response = fulfilled(state());
    assert.equal(response.status, status);
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
    assert.equal(incoming.destroyed, true);
    assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
    assert.deepEqual(fixture.escaped, []);
  });
test("sent HEAD resolves with null body and closes untransferred stream", async (t) => {
  const incoming = message(200, null),
    fixture = nodeFixture(t, { message: incoming });
  const state = watch(api.createNetworkProxyFetch(options)(url, { method: "HEAD" }));
  await turns();
  assert.equal(fulfilled(state()).body, null);
  assert.equal(incoming.destroyed, true);
  assert.equal(fixture.captured[0]?.method, "HEAD");
  assert.deepEqual(fixture.escaped, []);
});
for (const kind of ["headers", "status", "metadata"] as const)
  test(`asynchronous ${kind} conversion rejects instead of escaping delivery`, async (t) => {
    const incoming = message(),
      reason = new Error("owned metadata error");
    if (kind === "headers") incoming.headers = { "bad\nname": "owned" };
    if (kind === "status") incoming.statusCode = 600;
    if (kind === "metadata")
      Object.defineProperty(incoming, "headers", {
        get() {
          throw reason;
        },
      });
    const seen = captureRequests(t),
      fixture = nodeFixture(t, { message: incoming });
    const state = watch(api.createNetworkProxyFetch(options)(url));
    await turns();
    const error = rejected(state());
    if (kind === "metadata") assert.equal(error, reason);
    else assert.ok(error instanceof TypeError || error instanceof RangeError);
    assert.equal(incoming.destroyed, true);
    assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
    assert.deepEqual(fixture.escaped, []);
  });
test("no-body cleanup failure does not replace successful response", async (t) => {
  const incoming = message(204, null);
  t.mock.method(incoming, "destroy", () => {
    throw new Error("owned release failure");
  });
  const fixture = nodeFixture(t, { message: incoming }),
    state = watch(api.createNetworkProxyFetch(options)(url));
  await turns();
  assert.equal(fulfilled(state()).status, 204);
  assert.deepEqual(fixture.escaped, []);
  t.mock.restoreAll();
});
test("response body cancellation preserves its Error after transfer", async (t) => {
  const seen = captureRequests(t),
    incoming = message(200, null),
    fixture = nodeFixture(t, { message: incoming }),
    cancel = new AbortController(),
    reason = new Error("owned streamed abort");
  const state = watch(api.createNetworkProxyFetch(options)(url, { signal: cancel.signal }));
  await turns();
  const response = fulfilled(state());
  const reader = response.body?.getReader();
  assert.ok(reader);
  const read = watch(reader.read());
  cancel.abort(reason);
  await turns();
  assert.equal(rejected(read()), reason);
  assert.equal(fulfilled(state()), response);
  assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
  assert.deepEqual(fixture.escaped, []);
  reader.releaseLock();
});
test("ordinary stream closes naturally and detaches cancellation", async (t) => {
  const seen = captureRequests(t),
    incoming = message(200, "owned bytes"),
    fixture = nodeFixture(t, { message: incoming });
  const response = await api.createNetworkProxyFetch(options)(url);
  assert.equal(await response.text(), "owned bytes");
  await turns();
  assert.equal(getEventListeners(lastSignal(seen), "abort").length, 0);
  assert.deepEqual(fixture.escaped, []);
});
test("one request cancellation does not cancel another request", async (t) => {
  const fixture = nodeFixture(t, { auto: false }),
    cancel = new AbortController(),
    fetch = api.createNetworkProxyFetch(options);
  const first = watch(fetch(url, { signal: cancel.signal }));
  await turns();
  const other = nodeFixture(t, { auto: false });
  const second = watch(fetch(url));
  await turns();
  other.reply();
  await turns();
  const response = fulfilled(second());
  assert.equal(await response.text(), "owned");
  const reason = new Error("first only");
  cancel.abort(reason);
  await turns();
  assert.equal(rejected(first()), reason);
  assert.equal(fulfilled(second()), response);
  assert.deepEqual(fixture.escaped, []);
  assert.deepEqual(other.escaped, []);
});
