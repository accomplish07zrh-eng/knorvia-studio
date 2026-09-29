// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { timeout as api } from "./mcp-primitives.fixture.js";

test("MCP deadline surface retains exports, arities and ordinary Error identity", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "McpTimeoutError",
    "createMcpDeadline",
    "remainingMcpDeadlineMs",
    "waitWithinMcpDeadline",
    "withTimeout",
  ]);
  assert.equal(api.McpTimeoutError.length, 1);
  assert.equal(api.createMcpDeadline.length, 1);
  assert.equal(api.remainingMcpDeadlineMs.length, 2);
  assert.equal(api.waitWithinMcpDeadline.length, 4);
  assert.equal(api.withTimeout.length, 4);
  const error = new api.McpTimeoutError("owned message");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "McpTimeoutError");
  assert.equal(error.message, "owned message");
  assert.ok(error.stack?.includes("owned message"));
});

for (const [label, duration, normalized] of [
  ["zero", 0, 0],
  ["fraction", 5.9, 5],
  ["negative", -5.9, 0],
  ["negative zero", -0, 0],
  ["NaN", NaN, NaN],
  ["infinity", Infinity, Infinity],
  ["negative infinity", -Infinity, 0],
] as const) {
  test(`MCP deadline records normalized ${label} duration and current time`, (t) => {
    t.mock.method(Date, "now", () => 1000);
    const result = api.createMcpDeadline(duration);
    assert.deepEqual(Object.keys(result), ["expiresAt", "timeoutMs"]);
    assert.equal(result.timeoutMs, normalized);
    assert.equal(result.expiresAt, 1000 + normalized);
  });
}

for (const [label, expiresAt, expected] of [
  ["fraction", 1000.75, 0.75],
  ["infinity", Infinity, Infinity],
  ["NaN", NaN, NaN],
] as const) {
  test(`MCP remaining deadline preserves native ${label} result`, (t) => {
    t.mock.method(Date, "now", () => 1000);
    const deadline = Object.freeze({
      expiresAt,
      get timeoutMs(): number {
        throw new Error("must not recompute duration");
      },
    });
    assert.equal(api.remainingMcpDeadlineMs(deadline, "owned deadline"), expected);
  });
}

for (const expiresAt of [1000, 999.5, -Infinity]) {
  test(`MCP remaining deadline throws synchronously at ${expiresAt}`, (t) => {
    t.mock.method(Date, "now", () => 1000);
    let first: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(
        () => api.remainingMcpDeadlineMs({ expiresAt, timeoutMs: 9000 }, "expired"),
        (error) => {
          assert.ok(error instanceof api.McpTimeoutError);
          assert.equal(error.message, "expired");
          assert.notEqual(error, first);
          first = error;
          return true;
        },
      );
    }
  });
}

test("MCP remaining deadline samples current time on every call", (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const deadline = api.createMcpDeadline(10);
  assert.equal(api.remainingMcpDeadlineMs(deadline, "expired"), 10);
  now = 1009.5;
  assert.equal(api.remainingMcpDeadlineMs(deadline, "expired"), 0.5);
  now = 1010;
  assert.throws(() => api.remainingMcpDeadlineMs(deadline, "expired"), api.McpTimeoutError);
  assert.deepEqual(deadline, { expiresAt: 1010, timeoutMs: 10 });
});

test("MCP waiter returns its own Promise and borrows success identity", async () => {
  const value = Object.freeze({ owned: true }),
    source = Promise.resolve(value);
  const waiting = api.withTimeout(source, 60_000, "unused");
  assert.notEqual(waiting, source);
  assert.equal(await waiting, value);
  assert.equal(await source, value);
});

for (const [label, reason] of [
  ["Error", new Error("owned source")],
  ["undefined", undefined],
  ["null", null],
  ["string", "owned failure"],
  ["object", Object.freeze({ owned: "failure" })],
] as const) {
  test(`MCP waiter preserves ${label} rejection identity`, async () => {
    await api.withTimeout(Promise.reject(reason), 60_000, "unused").then(
      () => assert.fail("source must reject"),
      (error: unknown) => assert.equal(error, reason),
    );
  });
}

for (const [label, reason] of [
  ["Error", new Error("owned cancellation")],
  ["DOMException", new DOMException("owned cancellation", "AbortError")],
  ["string", "owned cancellation"],
  ["null", null],
] as const) {
  test(`MCP pre-cancelled waiter retains required ${label} reason semantics`, async () => {
    const controller = new AbortController();
    controller.abort(reason);
    const source = Promise.resolve("already fulfilled");
    const one = api.withTimeout(source, 60_000, "unused", controller.signal);
    const two = api.withTimeout(source, 60_000, "unused", controller.signal);
    const errors = await Promise.all(
      [one, two].map((waiting) =>
        waiting.then(
          () => assert.fail("abort must win"),
          (error: unknown) => error,
        ),
      ),
    );
    for (const error of errors) {
      if (reason instanceof Error) assert.equal(error, reason);
      else {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Operation aborted");
      }
    }
    if (!(reason instanceof Error)) assert.notEqual(errors[0], errors[1]);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(await source, "already fulfilled");
  });
}

for (const mode of [
  "fulfilled-sync-abort",
  "resolve-sync-abort",
  "resolve-microtask-abort",
  "fulfilled-zero-timeout",
] as const) {
  test(`MCP waiter arbitrates ${mode} by observed callback order`, async () => {
    const source = Promise.withResolvers<object>(),
      value = {},
      controller = new AbortController();
    const cancellation = new Error("owned cancel");
    if (mode.startsWith("fulfilled")) source.resolve(value);
    const waiting = api.withTimeout(
      source.promise,
      mode === "fulfilled-zero-timeout" ? 0 : 60_000,
      "unused",
      controller.signal,
    );
    if (mode.startsWith("resolve")) source.resolve(value);
    if (mode === "resolve-microtask-abort") await Promise.resolve();
    if (mode !== "fulfilled-zero-timeout") controller.abort(cancellation);
    if (mode === "fulfilled-sync-abort" || mode === "resolve-sync-abort")
      await assert.rejects(waiting, (error) => error === cancellation);
    else assert.equal(await waiting, value);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
}

test("MCP pending abort uses fallback error and removes only its own listener", async () => {
  const controller = new AbortController(),
    source = Promise.withResolvers<string>();
  const unrelated = () => {};
  controller.signal.addEventListener("abort", unrelated);
  const waiting = api.withTimeout(source.promise, 60_000, "unused", controller.signal);
  assert.equal(getEventListeners(controller.signal, "abort").length, 2);
  controller.abort(false);
  await assert.rejects(waiting, { name: "Error", message: "Operation aborted" });
  assert.deepEqual(getEventListeners(controller.signal, "abort"), [unrelated]);
  source.resolve("still available");
  assert.equal(await source.promise, "still available");
  controller.signal.removeEventListener("abort", unrelated);
});

test("MCP timer failures are fresh and leave shared source available", async () => {
  const source = Promise.withResolvers<object>(),
    value = {};
  const controller = new AbortController();
  const waiting = [
    api.withTimeout(source.promise, 0, "deadline", controller.signal),
    api.withTimeout(source.promise, 0, "deadline"),
  ];
  const errors = await Promise.all(
    waiting.map((promise) =>
      promise.then(
        () => assert.fail("must time out"),
        (error: unknown) => error,
      ),
    ),
  );
  for (const error of errors) {
    assert.ok(error instanceof api.McpTimeoutError);
    assert.equal(error.message, "deadline");
  }
  assert.notEqual(errors[0], errors[1]);
  assert.equal(controller.signal.aborted, false);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  source.resolve(value);
  assert.equal(await source.promise, value);
});

test("MCP cancelling one shared waiter leaves another independently successful", async () => {
  const source = Promise.withResolvers<object>(),
    value = {},
    controller = new AbortController();
  const cancellation = new Error("owned cancel");
  const cancelled = api.withTimeout(source.promise, 60_000, "unused", controller.signal);
  const continuing = api.withTimeout(source.promise, 60_000, "unused");
  assert.notEqual(cancelled, continuing);
  controller.abort(cancellation);
  await assert.rejects(cancelled, (error) => error === cancellation);
  source.resolve(value);
  assert.equal(await continuing, value);
});

test("MCP timing out one shared waiter leaves another observing the original rejection", async () => {
  const source = Promise.withResolvers<object>(),
    failure = new Error("owned source failure");
  const timed = api.withTimeout(source.promise, 0, "deadline");
  const continuing = api.withTimeout(source.promise, 60_000, "unused");
  const otherResult = assert.rejects(continuing, (error) => error === failure);
  await assert.rejects(timed, api.McpTimeoutError);
  source.reject(failure);
  await otherResult;
});

test("MCP deadline waiter preserves synchronous expiry before cancellation", () => {
  const controller = new AbortController();
  controller.abort(new Error("must not win"));
  assert.throws(
    () =>
      api.waitWithinMcpDeadline(
        Promise.resolve("settled"),
        { expiresAt: 0, timeoutMs: 9000 },
        "expiry first",
        controller.signal,
      ),
    { name: "McpTimeoutError", message: "expiry first" },
  );
});

test("MCP deadline waiter uses remaining duration rather than original duration", async () => {
  const source = Promise.resolve({ owned: true });
  const waiting = api.waitWithinMcpDeadline(
    source,
    { expiresAt: Date.now() + 60_000, timeoutMs: 0 },
    "unused",
  );
  assert.notEqual(waiting, source);
  assert.equal(await waiting, await source);
});

test("MCP early observation does not swallow rejection for a separate consumer", async () => {
  const failure = new Error("owned original reason"),
    source = Promise.withResolvers<never>();
  const controller = new AbortController();
  controller.abort("owned cancel");
  const wrapper = api.withTimeout(source.promise, 60_000, "unused", controller.signal);
  const rejection = assert.rejects(source.promise, (error) => error === failure);
  await assert.rejects(wrapper, { message: "Operation aborted" });
  source.reject(failure);
  await rejection;
  const second = Promise.reject(failure);
  assert.throws(
    () => api.waitWithinMcpDeadline(second, { expiresAt: 0, timeoutMs: 0 }, "expired"),
    api.McpTimeoutError,
  );
  await assert.rejects(second, (error) => error === failure);
});
