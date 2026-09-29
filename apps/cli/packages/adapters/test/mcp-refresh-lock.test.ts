// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  bounded,
  deferred,
  fixture,
  rejection,
  snapshot,
  useRealLock,
} from "./mcp-refresh.fixture.js";

test("refresh exposes one arity-one operation and delegates native path and exact lock budget", async () => {
  const h = await fixture();
  assert.equal(h.refresh.length, 1);
  assert.equal(await h.run(), h.next.access_token);
  assert.deepEqual(h.names().slice(0, 4), [
    "loadCredentialPair",
    "sanitizeKeyPrefix",
    "withFileLock",
    "loadCredentialPair",
  ]);
  const [path, operation, options] = h.only("withFileLock");
  assert.equal(path, join(dirname(h.store.filePath), "safe-owned-prefix.refresh"));
  assert.notEqual(path, h.store.filePath);
  assert.equal(operation.length, 0);
  assert.deepEqual(options, { lockMaxWaitMs: 45000 });
  assert.equal(Object.getPrototypeOf(options), Object.prototype);
  assert.equal(h.count("loadCredentialPair"), 2);
  assert.equal(h.count("isKnorviaFileLockTimeoutError"), 0);
});

test("generation winner is reused before checking refresh/client/expiry", async () => {
  for (const [entryGeneration, winnerGeneration] of [
    [undefined, "winner"],
    ["entry", undefined],
    ["entry", "winner"],
  ]) {
    const h = await fixture();
    const entry = snapshot({ generation: entryGeneration });
    const winner = snapshot({
      generation: winnerGeneration,
      clientInformation: undefined,
      expiresAt: 0,
      tokens: { access_token: "winner-access", token_type: "Bearer" },
    });
    let loads = 0;
    h.ports.loadCredentialPair = async () => (++loads === 1 ? entry : winner);
    assert.equal(await h.run(), "winner-access");
    assert.equal(loads, 2);
    assert.deepEqual(h.names(), ["sanitizeKeyPrefix", "withFileLock"]);
  }
  const unchanged = await fixture();
  unchanged.before.generation = undefined;
  assert.equal(await unchanged.run(), "owned-after");
  assert.equal(unchanged.count("refreshAuthorization"), 1, "two undefined generations are equal");
});

test("missing credentials and missing renewal fields request the exact interactive reason", async () => {
  for (const [locked, reason] of [
    [undefined, "no_credentials"],
    [snapshot({ tokens: undefined }), "no_credentials"],
    [
      snapshot({ tokens: { access_token: "old", token_type: "Bearer", refresh_token: "" } }),
      "no_refresh_token",
    ],
    [snapshot({ clientInformation: undefined }), "no_refresh_token"],
  ] as const) {
    const h = await fixture();
    h.current = locked;
    const result = await rejection(h.run());
    assert.ok(result instanceof Error);
    assert.deepEqual(h.only("createInteractiveAuthorizationRequiredError"), [
      { reason, serverName: "owned-server" },
    ]);
    assert.equal(h.count("loadDiscoveryRecord"), 0);
    assert.equal(h.count("refreshAuthorization"), 0);
    assert.equal(h.count("invalidateCanonicalCredentials"), 0);
  }
});

test("a falsy refresh token still precedes the client read", async () => {
  const h = await fixture();
  const reads: string[] = [];
  h.before.tokens = {
    access_token: "old",
    token_type: "Bearer",
    get refresh_token() {
      reads.push("refresh");
      return "";
    },
  };
  Object.defineProperty(h.before, "clientInformation", {
    get() {
      reads.push("client");
      return undefined;
    },
  });
  await rejection(h.run());
  assert.deepEqual(reads, ["refresh", "client"]);
  assert.equal(h.only("createInteractiveAuthorizationRequiredError")[0].reason, "no_refresh_token");
});

test("entry load and path preparation failures stay outside timeout recovery", async () => {
  for (const phase of ["load", "path"] as const) {
    const h = await fixture();
    const error = h.timeout;
    if (phase === "load")
      h.ports.loadCredentialPair = async () => {
        throw error;
      };
    else
      Object.defineProperty(h.store, "filePath", {
        get() {
          throw error;
        },
      });
    assert.equal(await rejection(h.run()), error);
    assert.equal(h.count("withFileLock"), 0);
    assert.equal(h.count("isKnorviaFileLockTimeoutError"), 0);
    assert.equal(h.count("createTemporaryRefreshFailureError"), 0);
  }
});

test("ordinary lock failures preserve thrown identity while classified timeouts reload once", async () => {
  const h = await fixture();
  const error = { owned: "lock failed" };
  h.ports.withFileLock = async () => {
    throw error;
  };
  assert.equal(await rejection(h.run()), error);
  assert.deepEqual(h.only("isKnorviaFileLockTimeoutError"), [error]);
  assert.equal(h.count("loadCredentialPair"), 1);

  for (const latest of [snapshot({ generation: "winner" }), snapshot(), undefined]) {
    const sample = await fixture();
    let loads = 0;
    sample.ports.loadCredentialPair = async () => (++loads === 1 ? sample.before : latest);
    sample.ports.withFileLock = async () => {
      throw sample.timeout;
    };
    if (latest?.generation === "winner")
      assert.equal(await sample.run(), latest.tokens!.access_token);
    else {
      const caught = await rejection(sample.run());
      assert.ok(caught instanceof Error);
      assert.equal(caught.cause, sample.timeout);
      assert.deepEqual(sample.only("createTemporaryRefreshFailureError"), [
        { cause: sample.timeout, serverName: "owned-server" },
      ]);
    }
    assert.equal(loads, 2);
    assert.equal(sample.count("createInteractiveAuthorizationRequiredError"), 0);
    assert.equal(sample.count("refreshAuthorization"), 0);
  }
});

test("timeout recovery uses live inputs and also covers operation timeouts", async () => {
  const h = await fixture();
  let loads = 0;
  const winner = snapshot({
    generation: "won",
    tokens: { access_token: "won-access", token_type: "Bearer" },
  });
  h.ports.loadCredentialPair = async (store, prefix) => {
    loads++;
    h.record("read", store, prefix);
    return loads === 3 ? winner : h.before;
  };
  h.ports.loadDiscoveryRecord = async () => {
    h.input.keyPrefix = "live-prefix";
    h.input.serverName = "live-server";
    throw h.timeout;
  };
  // Make the owned temporary factory return the same classified timeout.
  h.ports.createTemporaryRefreshFailureError = () =>
    Object.assign(h.timeout, { code: "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE" as const });
  assert.equal(await h.run(), "won-access");
  assert.equal(loads, 3);
  assert.deepEqual(
    h.calls.filter((call) => call.name === "read").map((call) => call.args[1]),
    ["owned-prefix", "owned-prefix", "live-prefix"],
  );
  assert.equal(h.count("isKnorviaFileLockTimeoutError"), 1);
});

test("classifier and recovery-read failures propagate without recursive recovery", async () => {
  for (const phase of ["classifier", "recovery"] as const) {
    const h = await fixture();
    const secondary = new Error(phase);
    let loads = 0;
    let classifications = 0;
    h.ports.withFileLock = async () => {
      throw h.timeout;
    };
    h.ports.loadCredentialPair = async () => {
      if (++loads === 2) throw secondary;
      return h.before;
    };
    h.ports.isKnorviaFileLockTimeoutError = () => {
      classifications++;
      if (phase === "classifier") throw secondary;
      return true;
    };
    assert.equal(await rejection(h.run()), secondary);
    assert.equal(classifications, 1);
    assert.equal(loads, phase === "classifier" ? 1 : 2);
  }
});

test("classified release failure can return credentials already published by the completed operation", async () => {
  const h = await fixture();
  h.ports.withFileLock = async (_path, operation) => {
    await operation();
    throw h.timeout;
  };
  h.ports.publishCanonicalCredentials = async () => {
    h.current = snapshot({ generation: h.published.generation, tokens: h.next });
    return h.published;
  };
  assert.equal(await h.run(), "owned-after");
  assert.equal(h.count("loadCredentialPair"), 3);
  assert.deepEqual(h.only("isKnorviaFileLockTimeoutError"), [h.timeout]);
  assert.equal(h.count("createTemporaryRefreshFailureError"), 0);
});

test(
  "real shared lock makes an overlapping waiter reuse the published winner",
  { timeout: 10000 },
  async (t) => {
    const h = await fixture();
    const { lockRequestedTwice } = await useRealLock(t, h);
    const exchangeEntered = deferred<void>();
    const releaseExchange = deferred<void>();
    let exchanges = 0;
    let publications = 0;
    let loads = 0;
    h.ports.loadCredentialPair = async () => {
      loads++;
      return h.current;
    };
    h.ports.refreshAuthorization = async () => {
      assert.equal(++exchanges, 1, "waiter must not exchange under the held refresh lock");
      exchangeEntered.resolve();
      await releaseExchange.promise;
      return h.next;
    };
    h.ports.publishCanonicalCredentials = async (store, prefix, value) => {
      assert.equal(store, h.input.credentialStore);
      assert.equal(prefix, h.input.keyPrefix);
      assert.equal(value.tokens, h.next);
      publications++;
      h.current = snapshot({ generation: h.published.generation, tokens: value.tokens });
      return h.published;
    };
    const first = h.run();
    let second: Promise<string> | undefined;
    try {
      await bounded(exchangeEntered.promise, "first exchange");
      second = h.run();
      await bounded(lockRequestedTwice.promise, "second lock request");
      assert.equal(publications, 0);
      assert.equal(exchanges, 1);
      releaseExchange.resolve();
      assert.deepEqual(await bounded(Promise.all([first, second]), "both refreshes"), [
        "owned-after",
        "owned-after",
      ]);
      assert.equal(exchanges, 1);
      assert.equal(publications, 1);
      assert.equal(loads, 4);
      assert.equal(h.count("info"), 1);
    } finally {
      releaseExchange.resolve();
      await Promise.allSettled(second ? [first, second] : [first]);
    }
  },
);
