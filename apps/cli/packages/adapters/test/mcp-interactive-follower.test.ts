// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { bounded, drain, fixture, rejection, snapshot } from "./mcp-interactive.fixture.js";

test("follower deduplicates the last URL across absence but reports a return after a different URL", async (t) => {
  const h = await fixture();
  h.input.transactionTtlMs = 2500;
  h.ports.tryAcquireAuthorizationLease = async (...args) => {
    h.record("tryAcquireAuthorizationLease", ...args);
    return undefined;
  };
  const urls = [
    "https://issuer.invalid/a",
    "https://issuer.invalid/a",
    undefined,
    "https://issuer.invalid/b",
    "https://issuer.invalid/a",
  ];
  h.ports.loadPendingAuthorization = async (...args) => {
    h.record("loadPendingAuthorization", ...args);
    const url = urls[h.count("loadPendingAuthorization") - 1];
    return url === undefined
      ? undefined
      : { attemptId: "other", authorizationUrl: url, expiresAt: 99999, state: "not-our-state" };
  };
  const notices: unknown[] = [];
  h.input.onAuthorizationRequired = (context) => {
    notices.push(context);
  };
  h.input.openAuthorizationUrl = () => {
    assert.fail("followers never open a browser");
  };
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const result = h.run();
  for (let poll = 1; poll <= urls.length; poll += 1) {
    await h.called("loadPendingAuthorization", poll);
    await drain();
    t.mock.timers.tick(500);
    await drain();
  }
  assert.deepEqual(await bounded(result, "follower TTL"), {
    status: "pending",
    authorizationUrl: urls[0],
  });
  assert.deepEqual(
    notices,
    [urls[0], urls[3], urls[4]].map((authorizationUrl) => ({
      authorizationUrl,
      redirectUrl: "",
      serverName: h.input.serverName,
    })),
  );
  assert.equal(h.count("loadPendingAuthorization"), 5);
  assert.equal(h.count("tryAcquireAuthorizationLease"), 1);
  for (const name of [
    "createLocalhostOAuthCallbackServer",
    "auth",
    "close",
    "deletePendingAuthorizationIfOwned",
    "release",
  ])
    assert.equal(h.count(name), 0);
  const following = h.calls.find((call) => call.name === "info");
  assert.ok(following);
  assert.deepEqual(following.args, [
    "MCP OAuth authorization is already in progress elsewhere",
    {
      event: "mcp.oauth.authorization.following",
      adapterInstanceId: undefined,
      credentialKeyPrefix: h.input.keyPrefix,
      mcpServerName: h.input.serverName,
      processId: process.pid,
      status: "waiting",
    },
  ]);
});

test("follower can expose an empty URL once without returning an own URL field", async (t) => {
  const h = await fixture();
  h.input.transactionTtlMs = 1000;
  h.ports.tryAcquireAuthorizationLease = async () => undefined;
  h.ports.loadPendingAuthorization = async () => {
    h.record("pending");
    return { attemptId: "other", authorizationUrl: "", expiresAt: 99999, state: "other" };
  };
  const notices: unknown[] = [];
  h.input.onAuthorizationRequired = (context) => {
    notices.push(context);
  };
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const result = h.run();
  for (let poll = 1; poll <= 2; poll += 1) {
    await h.called("pending", poll);
    await drain();
    t.mock.timers.tick(500);
    await drain();
  }
  const outcome = await bounded(result, "empty URL TTL");
  assert.deepEqual(outcome, { status: "pending" });
  assert.deepEqual(Object.keys(outcome), ["status"]);
  assert.deepEqual(notices, [
    { authorizationUrl: "", redirectUrl: "", serverName: h.input.serverName },
  ]);
});

test("follower generation winner overrides force and does not depend on pending baseline", async () => {
  const h = await fixture();
  h.input.forceReauthorization = true;
  h.ports.tryAcquireAuthorizationLease = async () => {
    h.current = snapshot({ generation: "new-generation" });
    return undefined;
  };
  assert.deepEqual(await h.run(), { status: "already-authorized" });
  assert.equal(h.count("loadPendingAuthorization"), 0);
  assert.equal(h.count("release"), 0);
  assert.equal(h.count("auth"), 0);
  assert.equal(h.count("loadCanonicalCredentials"), 2);
});

test("zero negative and NaN TTL or already aborted signals do not enter the follower poll", async () => {
  for (const ttl of [0, -1, Number.NaN]) {
    const h = await fixture();
    h.input.transactionTtlMs = ttl;
    h.ports.tryAcquireAuthorizationLease = async () => undefined;
    assert.deepEqual(await h.run(), { status: "pending" });
    assert.equal(h.count("loadCanonicalCredentials"), 1);
    assert.equal(h.count("loadPendingAuthorization"), 0);
    assert.equal(h.count("info"), 1);
  }
  const h = await fixture();
  const controller = new AbortController();
  controller.abort();
  h.input.signal = controller.signal;
  h.ports.tryAcquireAuthorizationLease = async () => undefined;
  assert.deepEqual(await h.run(), { status: "pending" });
  assert.equal(h.count("loadCanonicalCredentials"), 1);
});

test("abort wakes a follower timer without advancing time or releasing somebody else's lease", async (t) => {
  const h = await fixture();
  const controller = new AbortController();
  h.input.signal = controller.signal;
  h.ports.tryAcquireAuthorizationLease = async () => undefined;
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const result = h.run();
  await h.called("loadPendingAuthorization");
  await drain();
  controller.abort("owned cancellation");
  assert.deepEqual(await bounded(result, "abort follower"), { status: "pending" });
  assert.equal(Date.now(), 10000);
  assert.equal(h.count("loadPendingAuthorization"), 1);
  assert.equal(h.count("release"), 0);
});

test("follower polling and presentation errors reject without leader cleanup", async () => {
  for (const stage of ["canonical", "pending", "hook"] as const) {
    const h = await fixture();
    const reason = { failure: stage };
    h.ports.tryAcquireAuthorizationLease = async () => undefined;
    if (stage === "canonical")
      h.ports.loadCanonicalCredentials = async (...args) => {
        h.record("loadCanonicalCredentials", ...args);
        if (h.count("loadCanonicalCredentials") === 2) throw reason;
        return h.baseline;
      };
    h.ports.loadPendingAuthorization = async () => {
      if (stage === "pending") throw reason;
      return {
        attemptId: "other",
        authorizationUrl: "https://issuer.invalid",
        expiresAt: 99999,
        state: "other",
      };
    };
    h.input.onAuthorizationRequired = () => {
      throw reason;
    };
    assert.equal(await rejection(h.run()), reason);
    for (const name of ["close", "deletePendingAuthorizationIfOwned", "release", "warn"])
      assert.equal(h.count(name), 0);
  }
});
