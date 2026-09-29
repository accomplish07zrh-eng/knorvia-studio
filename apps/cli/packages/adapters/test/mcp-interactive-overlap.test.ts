// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { get } from "node:http";
import test from "node:test";
import type * as Callback from "../src/auth/localhost-callback.js";
import type * as Lease from "../src/mcp/oauth-lease.js";
import {
  bounded,
  deferred,
  drain,
  fixture,
  snapshot,
  targetUrls,
} from "./mcp-interactive.fixture.js";

test("a concurrent follower observes the leader's publication without a second SDK exchange", async (t) => {
  const leader = await fixture();
  const follower = await fixture();
  leader.input.config.clientId = "owned-client";
  follower.input.transactionTtlMs = 2000;
  let canonical = leader.baseline;
  let pending: Awaited<ReturnType<typeof Lease.loadPendingAuthorization>>;
  const callback = deferred<Callback.LocalhostOAuthCallback>();
  leader.callback.waitForCallback = () => {
    leader.record("waitForCallback");
    return callback.promise;
  };
  leader.ports.loadCanonicalCredentials = async () => canonical;
  follower.ports.loadCanonicalCredentials = async () => canonical;
  leader.ports.publishPendingAuthorization = async (_store, _prefix, value) => {
    pending = value;
    leader.record("publishPendingAuthorization", _store, _prefix, value);
  };
  follower.ports.tryAcquireAuthorizationLease = async () => undefined;
  follower.ports.loadPendingAuthorization = async () => {
    follower.record("loadPendingAuthorization");
    return pending;
  };
  follower.input.onAuthorizationRequired = (context) => {
    follower.record("required", context);
  };
  leader.ports.publishCanonicalCredentials = async () => {
    canonical = snapshot({ generation: "leader-published" });
    return leader.published;
  };
  leader.ports.auth = async (provider, options) => {
    leader.record("auth", provider, options);
    if (leader.count("auth") === 1) {
      await provider.redirectToAuthorization(new URL("https://issuer.invalid/owned"));
      return "REDIRECT";
    }
    await provider.saveTokens(leader.tokens);
    return "AUTHORIZED";
  };
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const ownerResult = leader.run();
  t.after(() => callback.resolve(leader.callbackValue));
  await leader.called("withTimeout");
  const waiterResult = follower.run();
  await follower.called("required");
  await drain();
  assert.equal(follower.count("auth"), 0);
  assert.equal(leader.count("release"), 0);
  callback.resolve(leader.callbackValue);
  assert.deepEqual(await bounded(ownerResult, "leader publication"), { status: "authorized" });
  t.mock.timers.tick(500);
  await drain();
  assert.deepEqual(await bounded(waiterResult, "follower winner"), {
    status: "already-authorized",
  });
  assert.equal(leader.count("auth"), 2);
  assert.equal(follower.count("auth"), 0);
  assert.equal(leader.count("release"), 1);
  assert.equal(follower.count("release"), 0);
  assert.equal(follower.count("required"), 1);
});

test("a real owned loopback callback reaches the same second SDK leg without external OAuth", async (t) => {
  const h = await fixture();
  const callbackApi = (await import(targetUrls.callback.href)) as typeof Callback;
  let owned: Callback.LocalhostOAuthCallbackServer | undefined;
  h.ports.createLocalhostOAuthCallbackServer = async (options) => {
    h.record("createLocalhostOAuthCallbackServer", options);
    owned = await callbackApi.createLocalhostOAuthCallbackServer(options);
    const callbackUrl = new URL(owned.callbackUrl);
    assert.equal(callbackUrl.protocol, "http:");
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(callbackUrl.hostname));
    const server = owned;
    return {
      callbackPath: server.callbackPath,
      callbackUrl: server.callbackUrl,
      waitForCallback: () => server.waitForCallback(),
      async close() {
        await server.close();
        owned = undefined;
        h.record("close");
      },
    };
  };
  t.after(async () => {
    if (owned) await owned.close();
  });
  const response = deferred<void>();
  let request: ReturnType<typeof get> | undefined;
  t.after(() => request?.destroy());
  h.input.openAuthorizationUrl = (context) => {
    const url = new URL(context.redirectUrl);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
    assert.equal(url.protocol, "http:");
    url.searchParams.set("state", h.state());
    url.searchParams.set("code", "owned loopback code");
    url.searchParams.set("iss", "https://issuer.invalid");
    request = get(url, (incoming) => {
      incoming.resume();
      incoming.once("end", () => response.resolve());
      incoming.once("error", (error) => response.reject(error));
    });
    request.once("error", (error) => response.reject(error));
  };
  h.ports.auth = async (provider, options) => {
    h.record("auth", provider, options);
    if (h.count("auth") === 1) {
      await provider.redirectToAuthorization(new URL("https://issuer.invalid/not-requested"));
      return "REDIRECT";
    }
    assert.equal(options.authorizationCode, "owned loopback code");
    assert.equal(options.iss, "https://issuer.invalid");
    return "AUTHORIZED";
  };
  const [outcome] = await bounded(
    Promise.all([h.run(), response.promise]),
    "owned loopback callback",
  );
  assert.deepEqual(outcome, { status: "authorized" });
  assert.equal(h.count("auth"), 2);
  assert.equal(h.count("close"), 1);
  assert.equal(h.count("publishPendingAuthorization"), 1);
  assert.equal(h.count("release"), 1);
});
