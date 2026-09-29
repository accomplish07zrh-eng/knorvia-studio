// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";

const target = process.argv[2],
  mode = process.argv[3];
assert.ok(target && mode);
type Policy = typeof import("../src/http/public-egress-policy.js");
const policy = (await import(target)) as Policy;
const abort = new AbortController(),
  reason = new Error("owned caller abort");
const failure = mode.endsWith("undefined") ? undefined : new Error("owned resolver failure");
let owned: Promise<{ address: string; family: number }[]> | undefined,
  calls = 0;
let continuation: Promise<unknown> | undefined;
const unhandled: boolean[] = [];
const record = (error: unknown, promise: Promise<unknown>) => {
  if (mode === "callback-throw") {
    assert.equal(error, failure);
    continuation = promise;
    primary = true;
  } else assert.equal(promise, owned);
  unhandled.push(error === failure);
};
const handled = () => {};
process.on("unhandledRejection", record);
process.on("rejectionHandled", handled);
let primary = false;
try {
  const resolver = () => {
    calls++;
    abort.abort(reason);
    owned = Promise.reject(failure);
    return owned;
  };
  if (mode === "callback-throw") {
    const fn = policy.createPublicEgressLookup("https://fixture.invalid", async () => [
      { address: "8.8.8.8", family: 4 },
    ]);
    fn("fixture.invalid", {}, (error) => {
      calls++;
      assert.equal(error, null);
      throw failure;
    });
  } else if (mode.startsWith("assert")) {
    await policy
      .assertPublicEgressDestination(new URL("https://fixture.invalid"), resolver, {
        signal: abort.signal,
      })
      .catch((error) => {
        primary = error === reason;
      });
  } else {
    await new Promise<void>((resolve) => {
      const fn = policy.createPublicEgressLookup("https://fixture.invalid", resolver, {
        signal: abort.signal,
      });
      fn("fixture.invalid", {}, (error) => {
        primary = error === reason;
        resolve();
      });
    });
  }
  await setImmediate();
  const result = { primary, unhandled: [...unhandled], calls };
  await owned?.catch(() => {});
  await continuation?.catch(() => {});
  await setImmediate();
  process.stdout.write(JSON.stringify(result));
} finally {
  process.off("unhandledRejection", record);
  process.off("rejectionHandled", handled);
}
