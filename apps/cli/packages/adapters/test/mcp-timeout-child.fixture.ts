// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { timeout as api } from "./mcp-primitives.fixture.js";

const mode = process.argv[2];
const unhandled: unknown[] = [];
const failure = new Error("owned source failure"),
  cancellation = new Error("owned cancellation");
const observe = (reason: unknown) => unhandled.push(reason);
process.on("unhandledRejection", observe);
const source = Promise.withResolvers<object>(),
  controller = new AbortController();
const timersBefore = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
let synchronous = false;
if (mode === "pre-aborted-rejected" || mode === "pre-aborted-late") {
  controller.abort(cancellation);
  if (mode === "pre-aborted-rejected") source.reject(failure);
  await assert.rejects(
    api.withTimeout(source.promise, 60_000, "unused", controller.signal),
    (error) => error === cancellation,
  );
  if (mode === "pre-aborted-late") source.reject(failure);
} else if (mode === "expired-rejected" || mode === "expired-late") {
  controller.abort(cancellation);
  if (mode === "expired-rejected") source.reject(failure);
  try {
    api.waitWithinMcpDeadline(
      source.promise,
      { expiresAt: 0, timeoutMs: 0 },
      "owned expiry",
      controller.signal,
    );
  } catch (error) {
    assert.ok(error instanceof api.McpTimeoutError);
    assert.equal(error.message, "owned expiry");
    synchronous = true;
  }
  assert.equal(synchronous, true);
  if (mode === "expired-late") source.reject(failure);
} else if (mode === "pending-cancel-late") {
  const waiting = api.withTimeout(source.promise, 60_000, "unused", controller.signal);
  controller.abort(cancellation);
  await assert.rejects(waiting, (error) => error === cancellation);
  source.reject(failure);
} else if (mode === "timed-out-late") {
  await assert.rejects(
    api.withTimeout(source.promise, 0, "owned timeout", controller.signal),
    api.McpTimeoutError,
  );
  source.reject(failure);
} else if (mode === "settled-resources") {
  const value = {};
  source.resolve(value);
  assert.equal(await api.withTimeout(source.promise, 60_000, "unused", controller.signal), value);
} else throw new Error("Unknown owned fixture mode");
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.ok(unhandled.every((reason) => reason === failure));
const timersAfter = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
const abortListeners = getEventListeners(controller.signal, "abort").length;
process.removeListener("unhandledRejection", observe);
console.log(
  JSON.stringify({
    mode,
    synchronous,
    unhandled: unhandled.length,
    abortListeners,
    timerDelta: timersAfter - timersBefore,
  }),
);
