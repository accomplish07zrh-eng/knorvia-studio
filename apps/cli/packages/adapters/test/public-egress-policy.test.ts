// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { lookup as nativeLookup } from "node:dns/promises";
import test from "node:test";
import { lookup, policy, portError, publicRows, rejection, url } from "./public-egress.fixture.js";

test("default resolver exposes Node function identity without executing DNS", () => {
  assert.equal(policy.defaultPublicDnsLookup(), nativeLookup);
  assert.deepEqual(Object.keys(policy).sort(), [
    "assertPublicEgressDestination",
    "createPublicEgressLookup",
    "defaultPublicDnsLookup",
  ]);
});
for (const host of ["localhost", "LOCALHOST.", "work.localhost", "printer.local"]) {
  test(`local host ${host} is rejected without resolving, even already aborted`, async () => {
    let calls = 0;
    const abort = new AbortController();
    abort.abort();
    const value = new URL(`https://${host}/`);
    const error = await rejection(
      policy.assertPublicEgressDestination(
        value,
        async () => {
          calls++;
          return publicRows();
        },
        { signal: abort.signal },
      ),
    );
    portError(
      error,
      `HTTP public egress blocked local hostname ${host.toLowerCase().replace(/\.$/, "")}`,
      value.toString(),
    );
    assert.equal(calls, 0);
  });
}
test("empty URL hostname is blocked before invoking resolver", async () => {
  const value = new URL("file:///fixture");
  let calls = 0;
  portError(
    await rejection(
      policy.assertPublicEgressDestination(value, async () => {
        calls++;
        return publicRows();
      }),
    ),
    "HTTP public egress requires a hostname",
    value.toString(),
  );
  assert.equal(calls, 0);
});
test("non-IP single host is blocked", async () => {
  const value = new URL("https://intranet/");
  portError(
    await rejection(policy.assertPublicEgressDestination(value, async () => publicRows())),
    "HTTP public egress requires a public hostname",
    value.toString(),
  );
});
for (const host of ["8.8.8.8", "[2606:4700:4700::1111]"]) {
  test(`public literal ${host} ignores aborted DNS signal and never resolves`, async () => {
    let calls = 0;
    const abort = new AbortController();
    abort.abort();
    assert.equal(
      await policy.assertPublicEgressDestination(
        new URL(`https://${host}/`),
        async () => {
          calls++;
          return [];
        },
        { signal: abort.signal },
      ),
      undefined,
    );
    assert.equal(calls, 0);
  });
}
for (const host of ["127.0.0.1", "10.0.0.1", "[::1]", "[::ffff:7f00:1]"]) {
  test(`restricted literal ${host} is rejected using retained IP policy`, async () => {
    const value = new URL(`https://${host}/`);
    const normalized = value.hostname.replace(/^\[|\]$/g, "");
    let calls = 0;
    portError(
      await rejection(
        policy.assertPublicEgressDestination(value, async () => {
          calls++;
          return publicRows();
        }),
      ),
      `HTTP public egress blocked ${normalized} because it resolved to a non-public address`,
      value.toString(),
    );
    assert.equal(calls, 0);
  });
}
test("actual lookup hostname is normalized independently from error-context URL", async () => {
  const queries: unknown[] = [];
  const rows = publicRows();
  const result = await lookup(
    "API.EXAMPLE.",
    async (hostname, options) => {
      queries.push({ hostname, options });
      return rows;
    },
    { all: true },
  );
  assert.deepEqual(queries, [{ hostname: "api.example", options: { all: true, verbatim: true } }]);
  assert.equal(result.args[0], null);
  assert.equal(result.args[1], rows);
  assert.equal(result.returned, undefined);
  assert.equal(result.calledOnStack, false);
  assert.equal(result.count, 1);
});
test("empty DNS result has its host-specific public error", async () => {
  portError(
    await rejection(policy.assertPublicEgressDestination(new URL(url), async () => [])),
    "HTTP public egress DNS lookup returned no addresses for context.invalid",
  );
});
for (const address of ["127.0.0.1", "10.0.0.1", "::1", "::ffff:7f00:1", "not-an-ip"]) {
  for (const blockedFirst of [true, false]) {
    test(`mixed results reject all when ${address} is ${blockedFirst ? "first" : "last"}`, async () => {
      const blocked = { address, family: address.includes(":") ? 6 : 4 },
        allowed = publicRows()[0]!;
      const rows = blockedFirst ? [blocked, allowed] : [allowed, blocked];
      portError(
        await rejection(policy.assertPublicEgressDestination(new URL(url), async () => rows)),
        "HTTP public egress blocked context.invalid because it resolved to a non-public address",
      );
      assert.deepEqual(rows, blockedFirst ? [blocked, allowed] : [allowed, blocked]);
    });
  }
}
test("all mode retains full array, duplicate identity, order and family values", async () => {
  const entry = { address: "8.8.8.8", family: 99 };
  const rows = [entry, publicRows()[1]!, entry];
  const result = await lookup("fixture.invalid", async () => rows, { all: true });
  assert.equal(result.args[1], rows);
  assert.equal(rows[0], entry);
  assert.equal(rows[2], entry);
  assert.equal(rows[0]!.family, 99);
});
test("lookup empty hostname reports context URL and does not resolve", async () => {
  let calls = 0;
  const result = await lookup("", async () => {
    calls++;
    return publicRows();
  });
  portError(result.args[0], "HTTP public egress requires a hostname");
  assert.equal(calls, 0);
  assert.equal(result.calledOnStack, false);
});
