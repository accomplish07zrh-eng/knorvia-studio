// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { bounded, deferred, drain, fixture, rejection } from "./mcp-interactive.fixture.js";

test("callback wait alone receives the exact timeout budget, diagnostic and parent signal", async () => {
  const h = await fixture();
  const controller = new AbortController();
  const reason = new Error("owned wait timeout");
  h.input.transactionTtlMs = 42;
  h.input.signal = controller.signal;
  h.ports.auth = async (...args) => {
    h.record("auth", ...args);
    return "REDIRECT";
  };
  const wait = Promise.resolve(h.callbackValue);
  h.callback.waitForCallback = () => {
    h.record("waitForCallback");
    return wait;
  };
  h.ports.withTimeout = async (...args) => {
    h.record("withTimeout", ...args);
    throw reason;
  };
  assert.deepEqual(await h.run(), { status: "failed", error: reason });
  assert.deepEqual(h.only("withTimeout"), [
    wait,
    42,
    "MCP server owned server OAuth authorization timed out",
    controller.signal,
  ]);
  assert.equal(h.count("auth"), 1);
  assert.deepEqual(h.names().slice(-3), ["close", "deletePendingAuthorizationIfOwned", "release"]);
});

test("aborting while the first SDK call is unresolved does not close or release early", async (t) => {
  const h = await fixture();
  const controller = new AbortController();
  h.input.signal = controller.signal;
  const sdk = deferred<"AUTHORIZED">();
  h.ports.auth = async (...args) => {
    h.record("auth", ...args);
    return sdk.promise;
  };
  const result = h.run();
  t.after(() => sdk.resolve("AUTHORIZED"));
  await h.called("auth");
  controller.abort("owned stop");
  await drain();
  assert.equal(h.count("withTimeout"), 0);
  assert.equal(h.count("close"), 0);
  assert.equal(h.count("release"), 0);
  sdk.resolve("AUTHORIZED");
  assert.deepEqual(await bounded(result, "first SDK completion"), { status: "authorized" });
});

test("expired TTL and later cancellation do not detach an outstanding code exchange", async (t) => {
  const h = await fixture();
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  h.input.transactionTtlMs = 5;
  const controller = new AbortController();
  h.input.signal = controller.signal;
  const exchange = deferred<"AUTHORIZED">();
  h.ports.auth = async (...args) => {
    h.record("auth", ...args);
    return h.count("auth") === 1 ? "REDIRECT" : exchange.promise;
  };
  const result = h.run();
  t.after(() => exchange.resolve("AUTHORIZED"));
  await h.called("auth", 2);
  now = 1000000;
  controller.abort();
  await drain();
  assert.equal(h.count("withTimeout"), 1);
  assert.equal(h.count("close"), 0);
  assert.equal(h.count("deletePendingAuthorizationIfOwned"), 0);
  assert.equal(h.count("release"), 0);
  exchange.resolve("AUTHORIZED");
  assert.deepEqual(await bounded(result, "exchange completion"), { status: "authorized" });
  assert.deepEqual(h.names().slice(-3), ["close", "deletePendingAuthorizationIfOwned", "release"]);
});

test("canonical publication remains inside SDK and lease lifetime until it settles", async (t) => {
  const h = await fixture();
  const publication = deferred<typeof h.published>();
  h.input.config.clientId = "static";
  h.ports.publishCanonicalCredentials = async (...args) => {
    h.record("publishCanonicalCredentials", ...args);
    return publication.promise;
  };
  h.ports.auth = async (provider) => {
    await provider.saveTokens(h.tokens);
    h.record("sdk-finished");
    return "AUTHORIZED";
  };
  const result = h.run();
  t.after(() => publication.resolve(h.published));
  await h.called("publishCanonicalCredentials");
  await drain();
  assert.equal(h.count("sdk-finished"), 0);
  assert.equal(h.count("info"), 0);
  assert.equal(h.count("close"), 0);
  assert.equal(h.count("release"), 0);
  publication.resolve(h.published);
  assert.deepEqual(await bounded(result, "publication completion"), { status: "authorized" });
  assert.deepEqual(h.names().slice(-4), [
    "sdk-finished",
    "close",
    "deletePendingAuthorizationIfOwned",
    "release",
  ]);
});

test("async close and pending deletion failures are ignored but release failure owns final rejection", async () => {
  for (const releaseFails of [false, true]) {
    const h = await fixture();
    const primary = new Error("SDK error");
    const releaseError = new Error("release failed");
    h.ports.auth = async () => {
      throw primary;
    };
    h.callback.close = async () => {
      h.record("close");
      throw new Error("close failed");
    };
    h.ports.deletePendingAuthorizationIfOwned = async () => {
      h.record("deletePendingAuthorizationIfOwned");
      throw new Error("pending failed");
    };
    h.lease.release = async () => {
      h.record("release");
      if (releaseFails) throw releaseError;
    };
    const result = h.run();
    if (releaseFails) assert.equal(await rejection(result), releaseError);
    else assert.deepEqual(await result, { status: "failed", error: primary });
    assert.deepEqual(h.names().slice(-3), [
      "close",
      "deletePendingAuthorizationIfOwned",
      "release",
    ]);
  }
});

test("synchronous close failure reaches outer cleanup; synchronous pending failure stops release", async () => {
  for (const stage of ["close", "pending"] as const) {
    const h = await fixture();
    const reason = new Error(`sync ${stage}`);
    if (stage === "close")
      h.callback.close = () => {
        h.record("close");
        throw reason;
      };
    else
      h.ports.deletePendingAuthorizationIfOwned = () => {
        h.record("deletePendingAuthorizationIfOwned");
        throw reason;
      };
    assert.equal(await rejection(h.run()), reason);
    assert.equal(h.count("close"), 1);
    assert.equal(h.count("deletePendingAuthorizationIfOwned"), 1);
    assert.equal(h.count("release"), stage === "close" ? 1 : 0);
  }
});

test("catch reread and warning failures reject rather than becoming nested failed outcomes", async () => {
  for (const stage of ["reread", "warning"] as const) {
    const h = await fixture();
    const reason = new Error(stage);
    h.ports.auth = async () => {
      throw new Error("original SDK failure");
    };
    h.ports.loadCanonicalCredentials = async (...args) => {
      h.record("loadCanonicalCredentials", ...args);
      if (stage === "reread" && h.count("loadCanonicalCredentials") === 3) throw reason;
      return h.baseline;
    };
    if (stage === "warning")
      h.logger.warn = () => {
        throw reason;
      };
    assert.equal(await rejection(h.run()), reason);
    assert.deepEqual(h.names().slice(-3), [
      "close",
      "deletePendingAuthorizationIfOwned",
      "release",
    ]);
  }
});

test("malformed callback URL retains native URL error and exact auth-phase cleanup", async () => {
  const h = await fixture();
  h.callbackValue = { code: "unused", url: "not an absolute URL" };
  h.ports.auth = async (...args) => {
    h.record("auth", ...args);
    return "REDIRECT";
  };
  const result = await h.run();
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.error instanceof TypeError, true);
  assert.equal(h.count("auth"), 1);
  assert.equal(h.count("loadCanonicalCredentials"), 3);
  assert.deepEqual(h.names().slice(-3), ["close", "deletePendingAuthorizationIfOwned", "release"]);
});
