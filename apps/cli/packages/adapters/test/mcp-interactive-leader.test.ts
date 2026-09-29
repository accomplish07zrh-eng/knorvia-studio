// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, rejection, snapshot, digest } from "./mcp-interactive.fixture.js";

test("public entry and immediate authorization keep leader cleanup ordered", async () => {
  const h = await fixture();
  assert.equal(h.exports.MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS, 300000);
  assert.equal(h.exports.runMcpInteractiveAuthorization.length, 1);
  assert.deepEqual(await h.run(), { status: "authorized" });
  assert.deepEqual(h.names(), [
    "loadCanonicalCredentials",
    "tryAcquireAuthorizationLease",
    "loadCanonicalCredentials",
    "createLocalhostOAuthCallbackServer",
    "auth",
    "close",
    "deletePendingAuthorizationIfOwned",
    "release",
  ]);
  assert.deepEqual(h.only("tryAcquireAuthorizationLease"), [
    { credentialsFilePath: h.store.filePath, keyPrefix: h.input.keyPrefix },
  ]);
  assert.deepEqual(h.only("deletePendingAuthorizationIfOwned"), [
    h.store,
    h.input.keyPrefix,
    h.lease.attemptId,
  ]);
  assert.deepEqual(h.only("auth")[1], { serverUrl: h.input.serverUrl });
  assert.equal(h.count("withTimeout"), 0);
  assert.equal(h.count("info"), 0);
});

test("native state and custom callback paths retain fallback and literal path rules", async () => {
  for (const [custom, expected] of [
    [undefined, "/oauth/callback/mcp/owned%20server"],
    ["", "/oauth/callback/mcp/owned%20server"],
    ["custom", "/custom"],
    ["/custom", "/custom"],
  ] as const) {
    const h = await fixture();
    h.input.config.redirectPath = custom;
    assert.deepEqual(await h.run(), { status: "authorized" });
    const request = h.only("createLocalhostOAuthCallbackServer")[0];
    assert.deepEqual(Object.keys(request), ["callbackPath", "state"]);
    assert.equal(request.callbackPath, expected);
    assert.match(request.state, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(Buffer.from(request.state, "base64url").length, 24);
    assert.equal(await h.provider().state?.(), request.state);
    assert.equal(await h.provider().state?.(), request.state);
  }
  const h = await fixture();
  h.input.serverName = "\ud800";
  h.input.config.redirectPath = "/valid";
  assert.ok((await rejection(h.run())) instanceof URIError);
  assert.equal(h.count("createLocalhostOAuthCallbackServer"), 0);
  assert.deepEqual(h.names().slice(-2), ["deletePendingAuthorizationIfOwned", "release"]);
});

test("both SDK legs share provider and use ordered live options with force only on the first", async () => {
  const h = await fixture();
  const fetchFn: NonNullable<typeof h.input.fetchFn> = async () => {
    throw new Error("no network");
  };
  const resource = new URL("https://resource.invalid/metadata");
  Object.assign(h.input, {
    requestedScope: "first",
    resourceMetadataUrl: resource,
    fetchFn,
    forceReauthorization: true,
  });
  let first: unknown;
  h.ports.auth = async (provider, options) => {
    h.record("auth", provider, options);
    if (h.count("auth") === 1) {
      first = provider;
      assert.deepEqual(Object.keys(options), [
        "serverUrl",
        "scope",
        "resourceMetadataUrl",
        "fetchFn",
        "forceReauthorization",
      ]);
      assert.deepEqual(options, {
        serverUrl: h.input.serverUrl,
        scope: "first",
        resourceMetadataUrl: resource,
        fetchFn,
        forceReauthorization: true,
      });
      h.input.requestedScope = "second";
      return "REDIRECT";
    }
    assert.equal(provider, first);
    assert.deepEqual(Object.keys(options), [
      "serverUrl",
      "authorizationCode",
      "iss",
      "scope",
      "resourceMetadataUrl",
      "fetchFn",
    ]);
    assert.deepEqual(options, {
      serverUrl: h.input.serverUrl,
      authorizationCode: "a b",
      iss: "https://issuer.invalid/",
      scope: "second",
      resourceMetadataUrl: resource,
      fetchFn,
    });
    return "REDIRECT";
  };
  h.callbackValue = {
    code: "unused",
    url: `${h.callback.callbackUrl}?code=a+b&iss=https%3A%2F%2Fissuer.invalid%2F`,
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
  assert.equal(h.count("auth"), 2);
  const log = h.calls.find((call) => call.name === "info");
  assert.ok(log);
  assert.deepEqual(log.args, [
    "MCP OAuth authorization completed",
    {
      event: "mcp.oauth.authorization.completed",
      adapterInstanceId: undefined,
      credentialKeyPrefix: h.input.keyPrefix,
      mcpServerName: h.input.serverName,
      oauthStateId: digest(h.state()).slice(0, 16),
      processId: process.pid,
      status: "completed",
    },
  ]);
});

test("callback code distinguishes missing from empty, and empty issuer is omitted", async () => {
  for (const [query, expected] of [
    ["", "fallback"],
    ["?code=", ""],
    ["?code=first&code=second&iss=", "first"],
  ] as const) {
    const h = await fixture();
    h.input.requestedScope = "";
    h.callbackValue = { code: "fallback", url: h.callback.callbackUrl + query };
    h.ports.auth = async (provider, options) => {
      h.record("auth", provider, options);
      if (h.count("auth") === 1) return "REDIRECT";
      assert.deepEqual(Object.keys(options), ["serverUrl", "authorizationCode"]);
      assert.equal(options.authorizationCode, expected);
      return "AUTHORIZED";
    };
    assert.deepEqual(await h.run(), { status: "authorized" });
    assert.equal(h.count("auth"), 2);
  }
});

test("locked generation winner bypasses callback even during force reauthorization", async () => {
  const h = await fixture();
  h.input.forceReauthorization = true;
  h.ports.tryAcquireAuthorizationLease = async (...args) => {
    h.record("tryAcquireAuthorizationLease", ...args);
    h.current = snapshot({ generation: "winner" });
    return h.lease;
  };
  assert.deepEqual(await h.run(), { status: "already-authorized" });
  assert.equal(h.count("auth"), 0);
  assert.equal(h.count("createLocalhostOAuthCallbackServer"), 0);
  assert.deepEqual(h.names().slice(-2), ["deletePendingAuthorizationIfOwned", "release"]);
});

test("entry read and acquisition failures reject unchanged without unowned cleanup", async () => {
  for (const stage of ["loadCanonicalCredentials", "tryAcquireAuthorizationLease"] as const) {
    const h = await fixture();
    const reason = { stage };
    h.ports[stage] = async () => {
      throw reason;
    };
    assert.equal(await rejection(h.run()), reason);
    assert.equal(h.count("close"), 0);
    assert.equal(h.count("deletePendingAuthorizationIfOwned"), 0);
    assert.equal(h.count("release"), 0);
  }
});

test("listener rejection returns original failure and exact bounded diagnostic", async () => {
  const h = await fixture();
  const reason = new Error("owned listener rejected");
  h.ports.createLocalhostOAuthCallbackServer = async (...args) => {
    h.record("createLocalhostOAuthCallbackServer", ...args);
    throw reason;
  };
  assert.deepEqual(await h.run(), { status: "failed", error: reason });
  assert.equal(h.count("auth"), 0);
  assert.equal(h.count("close"), 0);
  const warning = h.calls.find((call) => call.name === "warn");
  assert.ok(warning);
  assert.deepEqual(warning.args, [
    "MCP OAuth callback listener failed",
    {
      event: "mcp.oauth.callback_listener.failed",
      adapterInstanceId: undefined,
      credentialKeyPrefix: h.input.keyPrefix,
      mcpServerName: h.input.serverName,
      oauthStateId: digest(h.state()).slice(0, 16),
      processId: process.pid,
      error: reason.message,
      status: "failed",
    },
  ]);
  assert.deepEqual(h.names().slice(-2), ["deletePendingAuthorizationIfOwned", "release"]);
});

test("SDK failure recognizes a concurrently published winner but preserves unchanged-generation error", async () => {
  for (const winner of [false, true]) {
    const h = await fixture();
    const reason = new Error("exchange failed");
    h.ports.auth = async () => {
      if (winner) h.current = snapshot({ generation: "other-publisher" });
      throw reason;
    };
    const result = await h.run();
    assert.deepEqual(
      result,
      winner ? { status: "already-authorized" } : { status: "failed", error: reason },
    );
    assert.equal(h.count("loadCanonicalCredentials"), 3);
    assert.equal(h.count("warn"), winner ? 0 : 1);
    assert.deepEqual(h.names().slice(-3), [
      "close",
      "deletePendingAuthorizationIfOwned",
      "release",
    ]);
  }
});
