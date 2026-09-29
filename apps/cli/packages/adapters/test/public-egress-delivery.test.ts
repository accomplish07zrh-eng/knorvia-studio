// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  lookup,
  policy,
  portError,
  publicRows,
  url,
  type RuntimeLookup,
} from "./public-egress.fixture.js";

for (const initial of [true, false]) {
  test(`callback shape captures initial all:${initial} while DNS is pending`, async () => {
    const pending = Promise.withResolvers<ReturnType<typeof publicRows>>();
    const delivered = Promise.withResolvers<unknown[]>();
    const options = { all: initial };
    const fn = policy.createPublicEgressLookup(url, () => pending.promise) as RuntimeLookup;
    fn("fixture.invalid", options, (...args) => delivered.resolve(args));
    options.all = !initial;
    const rows = publicRows();
    pending.resolve(rows);
    const args = await delivered.promise;
    if (initial) {
      assert.equal(args.length, 2);
      assert.equal(args[1], rows);
    } else assert.deepEqual(args, [null, rows[0]!.address, rows[0]!.family]);
  });
}
test("optional public options retain the two-argument runtime arity", () => {
  assert.equal(policy.assertPublicEgressDestination.length, 2);
  assert.equal(policy.createPublicEgressLookup.length, 2);
});
for (const all of [true, false]) {
  test(`delivery after first property changes preserves all:${all} branch`, async () => {
    const entry = publicRows()[0]!;
    const rows = [entry];
    let read = false;
    // 明确的结构化边界：校验读到合法地址，交付时该同一数组首项已不再可读。
    Object.defineProperty(rows, 0, {
      get() {
        if (read) return undefined;
        read = true;
        return entry;
      },
    });
    if (all) {
      const result = await lookup("fixture.invalid", async () => rows, { all: true });
      assert.equal(result.args[0], null);
      assert.equal(result.args[1], rows);
    } else {
      const original = "https://CONTEXT.invalid:443/resource";
      const delivered = Promise.withResolvers<unknown[]>();
      const fn = policy.createPublicEgressLookup(original, async () => rows) as RuntimeLookup;
      fn("fixture.invalid", { all: false }, (...args) => delivered.resolve(args));
      portError(
        (await delivered.promise)[0],
        "HTTP public egress DNS lookup returned no addresses",
        original,
      );
    }
  });
}
