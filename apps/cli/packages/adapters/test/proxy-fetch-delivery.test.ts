// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { api, directory, nodeFixture, rejected, turns, watch } from "./proxy-fetch.fixture.js";

for (const method of ["GET", "HEAD"])
  test(`${method} CA acquisition preserves the asynchronous normalization boundary`, async (t) => {
    const dir = await directory(t),
      first = join(dir, "first.pem"),
      second = join(dir, "second.pem");
    await writeFile(first, "first public fixture");
    await writeFile(second, "second public fixture");
    const mutable = { env: {}, caCertFile: first },
      fixture = nodeFixture(t, { secure: true });
    const pending = api.createNetworkProxyFetch(mutable)("https://target.invalid/", { method });
    mutable.caCertFile = second;
    await pending;
    const agent = fixture.captured[0]?.agent;
    assert.ok(agent instanceof https.Agent);
    assert.deepEqual(agent.options.ca, Buffer.from("second public fixture"));
  });
for (const input of ["ftp://target.invalid/", "invalid URL"])
  test(`synchronous direct fetch failure is delivered once: ${input}`, async () => {
    const reason = new Error("owned synchronous direct failure");
    let calls = 0;
    const fetch = api.createNetworkProxyFetch({
      env: {},
      fetch: () => {
        calls++;
        throw reason;
      },
    });
    const state = watch(fetch(input));
    await turns();
    assert.equal(rejected(state()), reason);
    assert.equal(calls, 1);
  });
