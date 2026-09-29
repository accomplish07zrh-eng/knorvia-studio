// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  isolated,
  lookup,
  policy,
  publicRows,
  rejection,
  turn,
  url,
} from "./public-egress.fixture.js";

for (const reason of [new Error("owned caller reason"), "non-error reason", null]) {
  test(`pre-aborted query does not call resolver for ${String(reason)}`, async () => {
    const abort = new AbortController();
    abort.abort(reason);
    let calls = 0;
    const error = await rejection(
      policy.assertPublicEgressDestination(
        new URL(url),
        async () => {
          calls++;
          return publicRows();
        },
        { signal: abort.signal },
      ),
    );
    if (reason instanceof Error) assert.equal(error, reason);
    else {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "HTTP request was cancelled");
    }
    assert.equal(calls, 0);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  });
}
test("resolver synchronous throw wins over an abort it also triggers", async () => {
  const abort = new AbortController(),
    failure = new Error("owned throw");
  const error = await rejection(
    policy.assertPublicEgressDestination(
      new URL(url),
      () => {
        abort.abort();
        throw failure;
      },
      { signal: abort.signal },
    ),
  );
  assert.equal(error, failure);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("resolver returning a fulfilled promise after abort still chooses cancellation", async () => {
  const abort = new AbortController(),
    reason = new Error("owned abort");
  const error = await rejection(
    policy.assertPublicEgressDestination(
      new URL(url),
      () => {
        abort.abort(reason);
        return Promise.resolve(publicRows());
      },
      { signal: abort.signal },
    ),
  );
  assert.equal(error, reason);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
for (const late of ["resolve", "reject"] as const) {
  test(`pending DNS cancellation returns before late ${late}, with no listener leak`, async () => {
    const pending = Promise.withResolvers<ReturnType<typeof publicRows>>();
    const abort = new AbortController();
    const reason = new Error("owned abort");
    const result = rejection(
      policy.assertPublicEgressDestination(new URL(url), () => pending.promise, {
        signal: abort.signal,
      }),
    );
    assert.equal(getEventListeners(abort.signal, "abort").length, 1);
    abort.abort(reason);
    assert.equal(await result, reason);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
    if (late === "resolve") pending.resolve(publicRows());
    else pending.reject(new Error("owned late rejection"));
    await turn();
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  });
}
for (const rejectionValue of [
  new Error("owned lookup error"),
  undefined,
  null,
  "owned non-error failure",
]) {
  test(`DNS rejection ${String(rejectionValue)} wins before a later abort`, async () => {
    const abort = new AbortController();
    const error = await rejection(
      policy.assertPublicEgressDestination(new URL(url), () => Promise.reject(rejectionValue), {
        signal: abort.signal,
      }),
    );
    abort.abort();
    assert.equal(error, rejectionValue);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  });
}
test("successful DNS clears its listener and ignores later cancellation", async () => {
  const abort = new AbortController();
  assert.equal(
    await policy.assertPublicEgressDestination(new URL(url), async () => publicRows(), {
      signal: abort.signal,
    }),
    undefined,
  );
  abort.abort();
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("lookup cancellation calls done once despite a later resolver failure", async () => {
  const pending = Promise.withResolvers<ReturnType<typeof publicRows>>();
  const abort = new AbortController();
  const reason = new Error("owned abort");
  const result = lookup("fixture.invalid", () => pending.promise, {}, abort.signal);
  abort.abort(reason);
  const outcome = await result;
  assert.equal(outcome.args[0], reason);
  assert.equal(outcome.count, 1);
  pending.reject(new Error("owned late DNS failure"));
  await turn();
  assert.equal(outcome.count, 1);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("parallel calls keep cancellation and result ownership separate", async () => {
  const pending = Promise.withResolvers<ReturnType<typeof publicRows>>();
  const abort = new AbortController();
  const cancelled = rejection(
    policy.assertPublicEgressDestination(new URL(url), () => pending.promise, {
      signal: abort.signal,
    }),
  );
  const successful = policy.assertPublicEgressDestination(new URL(url), async () => publicRows());
  abort.abort(new Error("owned cancellation"));
  assert.ok((await cancelled) instanceof Error);
  assert.equal(await successful, undefined);
  pending.resolve(publicRows());
  await turn();
});
for (const mode of ["assert-error", "assert-undefined", "lookup-error", "lookup-undefined"]) {
  test(`resolver Promise remains observed after synchronous abort in ${mode}`, async () => {
    const result = await isolated(mode);
    assert.equal(result.primary, true);
    assert.equal(result.calls, 1);
    assert.deepEqual(
      result.unhandled,
      [],
      "owned resolver rejection must have a handler even after second abort check",
    );
  });
}
