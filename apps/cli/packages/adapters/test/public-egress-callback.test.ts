// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  isolated,
  lookup,
  policy,
  portError,
  publicRows,
  rejection,
  url,
  type RuntimeLookup,
} from "./public-egress.fixture.js";

test("user callback failure is neither swallowed nor delivered as a second callback", async () => {
  const result = await isolated("callback-throw");
  assert.equal(result.primary, true);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.unhandled, [true]);
});

for (const options of [{}, { all: false }, { all: "true" }, null, "two-arguments"]) {
  test(`first-result callback preserves two or three argument calling form: ${JSON.stringify(options)}`, async () => {
    const rows = publicRows();
    const result = await lookup("fixture.invalid", async () => rows, options);
    assert.deepEqual(result.args, [null, rows[0]!.address, rows[0]!.family]);
    assert.equal(result.count, 1);
    assert.equal(result.calledOnStack, false);
    assert.equal(result.returned, undefined);
  });
}
test("inherited all:true is still recognized without changing array identity", async () => {
  const options = Object.create({ all: true }) as { all: true };
  const rows = publicRows();
  const result = await lookup("fixture.invalid", async () => rows, options);
  assert.equal(result.args[1], rows);
});
test("without callback, invalid URL is never parsed and resolver is not called", () => {
  let calls = 0;
  const fn = policy.createPublicEgressLookup("not a URL", async () => {
    calls++;
    return [];
  }) as RuntimeLookup;
  assert.equal(fn("fixture.invalid", {}), undefined);
  assert.equal(calls, 0);
});
test("invalid URL throws only in lookup invocation with callback", () => {
  let calls = 0;
  const fn = policy.createPublicEgressLookup("not a URL", async () => {
    calls++;
    return [];
  }) as RuntimeLookup;
  assert.throws(
    () =>
      fn("fixture.invalid", {}, () => {
        calls++;
      }),
    TypeError,
  );
  assert.equal(calls, 0);
});
for (const [label, failure] of [
  ["error", new Error("owned native DNS error")],
  ["undefined", undefined],
  ["null", null],
  ["number", 3],
  ["object", { reason: "owned" }],
] as const) {
  test(`lookup projects ${label} failure while assert preserves it`, async () => {
    const resolver = () => Promise.reject(failure);
    assert.equal(
      await rejection(policy.assertPublicEgressDestination(new URL(url), resolver)),
      failure,
    );
    const result = await lookup("fixture.invalid", resolver);
    if (failure instanceof Error) assert.equal(result.args[0], failure);
    else {
      assert.ok(result.args[0] instanceof Error);
      assert.equal(result.args[0].message, String(failure));
      assert.equal("code" in result.args[0], false);
    }
    assert.equal(result.args.length, 1);
    assert.equal(result.count, 1);
    assert.equal(result.calledOnStack, false);
  });
}
test("resolver synchronous throw reaches callback asynchronously as the same Error", async () => {
  const failure = new Error("owned synchronous resolver failure");
  const result = await lookup("fixture.invalid", () => {
    throw failure;
  });
  assert.equal(result.args[0], failure);
  assert.equal(result.calledOnStack, false);
  assert.equal(result.count, 1);
});
test("callback policy failure keeps context URL even when hostname differs", async () => {
  const result = await lookup("other.local", async () => publicRows());
  portError(result.args[0], "HTTP public egress blocked local hostname other.local");
  assert.equal(result.calledOnStack, false);
});
