// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/client";
import { bounded, deferred, digest, fixture, rejection } from "./mcp-interactive.fixture.js";

test("metadata uses fresh ordered objects and nullish requested scope selection", async () => {
  for (const requestedScope of [undefined, "", "requested"]) {
    const h = await fixture();
    Object.assign(h.input.config, { clientName: "", clientSecret: "secret", scope: "configured" });
    h.input.requestedScope = requestedScope;
    h.ports.auth = async (provider) => {
      const first = provider.clientMetadata;
      const second = provider.clientMetadata;
      assert.notEqual(first, second);
      assert.equal(Object.getPrototypeOf(first), Object.prototype);
      const scope = requestedScope ?? "configured";
      assert.deepEqual(first, {
        client_name: "",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [h.callback.callbackUrl],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
        ...(scope ? { scope } : {}),
      });
      assert.deepEqual(Object.keys(first), [
        "client_name",
        "grant_types",
        "redirect_uris",
        "response_types",
        "token_endpoint_auth_method",
        ...(scope ? ["scope"] : []),
      ]);
      h.callback.callbackUrl = "http://127.0.0.1:45124/changed";
      assert.equal(provider.redirectUrl, h.callback.callbackUrl);
      assert.deepEqual(provider.clientMetadata.redirect_uris, [h.callback.callbackUrl]);
      return "AUTHORIZED";
    };
    assert.deepEqual(await h.run(), { status: "authorized" });
  }
});

test("captured config reference stays live while SDK scope reads the outer input on each leg", async () => {
  const h = await fixture();
  const config = h.input.config;
  config.scope = "before";
  h.ports.auth = async (provider, options) => {
    h.record("auth", provider, options);
    if (h.count("auth") === 1) {
      assert.equal(provider.clientMetadata.scope, "before");
      h.input.config = { type: "authorization_code", scope: "replacement" };
      config.scope = "changed-captured";
      h.input.requestedScope = "second-sdk-scope";
      assert.equal(provider.clientMetadata.scope, "changed-captured");
      assert.equal(provider.clientMetadata.client_name, "Knorvia Studio owned server");
      return "REDIRECT";
    }
    assert.equal(options.scope, "second-sdk-scope");
    assert.equal(provider.clientMetadata.scope, "changed-captured");
    return "AUTHORIZED";
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
});

test("DCR starts fresh and static client information takes precedence without standalone writes", async () => {
  for (const isStatic of [false, true]) {
    const h = await fixture();
    if (isStatic)
      Object.assign(h.input.config, { clientId: "static-client", clientSecret: "static-secret" });
    const fresh = { client_id: "fresh-client", client_secret: "fresh-secret" };
    h.ports.auth = async (provider) => {
      assert.equal(await provider.tokens(), undefined);
      if (!isStatic) assert.equal(await provider.clientInformation(), undefined);
      assert.ok(provider.saveClientInformation);
      await provider.saveClientInformation(fresh);
      const a = await provider.clientInformation();
      const b = await provider.clientInformation();
      if (isStatic) {
        assert.deepEqual(a, { client_id: "static-client", client_secret: "static-secret" });
        assert.notEqual(a, b);
      } else {
        assert.equal(a, fresh);
        assert.equal(b, fresh);
      }
      assert.equal(await provider.tokens(), undefined);
      return "AUTHORIZED";
    };
    assert.deepEqual(await h.run(), { status: "authorized" });
    assert.equal(h.count("publishCanonicalCredentials"), 0);
  }
});

test("PKCE and issuer stay local; discovery memory survives persistence rejection", async () => {
  const h = await fixture();
  const reason = new Error("discovery write failed");
  const disk: OAuthDiscoveryState = { authorizationServerUrl: "https://old-issuer.invalid" };
  const memory: OAuthDiscoveryState = { authorizationServerUrl: "https://new-issuer.invalid" };
  h.ports.loadDiscoveryRecord = async (...args) => {
    h.record("loadDiscoveryRecord", ...args);
    return disk;
  };
  h.ports.saveDiscoveryRecord = async (...args) => {
    h.record("saveDiscoveryRecord", ...args);
    throw reason;
  };
  h.ports.auth = async (provider) => {
    assert.throws(() => provider.codeVerifier(), {
      message: "Missing MCP OAuth PKCE verifier for owned server",
    });
    await provider.saveCodeVerifier("verifier");
    assert.equal(await provider.codeVerifier(), "verifier");
    await provider.saveCodeVerifier("");
    assert.throws(() => provider.codeVerifier(), {
      message: "Missing MCP OAuth PKCE verifier for owned server",
    });
    assert.ok(provider.discoveryState);
    assert.ok(provider.saveDiscoveryState);
    assert.ok(provider.authorizationServerUrl);
    assert.ok(provider.saveAuthorizationServerUrl);
    assert.equal(await provider.discoveryState(), disk);
    assert.deepEqual(h.only("loadDiscoveryRecord"), [h.store, h.input.keyPrefix]);
    await provider.saveAuthorizationServerUrl("https://explicit-issuer.invalid");
    assert.equal(
      await rejection(Promise.resolve().then(() => provider.saveDiscoveryState!(memory))),
      reason,
    );
    assert.equal(await provider.discoveryState(), memory);
    assert.equal(await provider.authorizationServerUrl(), "https://explicit-issuer.invalid");
    assert.deepEqual(h.only("saveDiscoveryRecord"), [h.store, h.input.keyPrefix, memory]);
    return "AUTHORIZED";
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
});

test("token publication uses exact references, full state hash and redacted ordered diagnostic", async () => {
  const h = await fixture();
  const client = { client_id: "client-sensitive" };
  h.ports.auth = async (provider) => {
    assert.equal(
      (await rejection(Promise.resolve().then(() => provider.saveTokens(h.tokens)))) instanceof
        Error,
      true,
    );
    const missing = await rejection(Promise.resolve().then(() => provider.saveTokens(h.tokens)));
    assert.ok(missing instanceof Error);
    assert.equal(missing.message, "Missing MCP OAuth client information for owned server");
    assert.equal(h.count("publishCanonicalCredentials"), 0);
    assert.ok(provider.saveClientInformation);
    await provider.saveClientInformation(client);
    assert.ok(provider.saveAuthorizationServerUrl);
    await provider.saveAuthorizationServerUrl("https://issuer.invalid");
    await provider.saveTokens(h.tokens);
    return "AUTHORIZED";
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
  const [store, prefix, value] = h.only("publishCanonicalCredentials");
  assert.equal(store, h.store);
  assert.equal(prefix, h.input.keyPrefix);
  assert.deepEqual(Object.keys(value), ["clientInformation", "issuer", "publishedBy", "tokens"]);
  assert.equal(value.clientInformation, client);
  assert.equal(value.tokens, h.tokens);
  assert.equal(value.publishedBy, digest(h.state()));
  assert.equal(value.issuer, "https://issuer.invalid");
  const log = h.calls.find((call) => call.name === "info");
  assert.ok(log);
  const expected = {
    event: "mcp.oauth.credentials.published",
    credentialKeyPrefix: h.input.keyPrefix,
    mcpServerName: h.input.serverName,
    oauthAttemptId: h.lease.attemptId.slice(0, 12),
    oauthStateId: digest(h.state()).slice(0, 16),
    processId: process.pid,
    clientIdHash: digest(client.client_id).slice(0, 12),
    grantKind: "authorization_code",
    hasRefreshToken: true,
    publishedGeneration: h.published.generation.slice(0, 12),
    status: "completed",
    tokenExpiresInSeconds: 3600,
  };
  assert.deepEqual(log.args, ["MCP OAuth credentials published", expected]);
  assert.deepEqual(Object.keys(log.args[1] as object), Object.keys(expected));
  const diagnostic = JSON.stringify(log.args);
  for (const secret of [
    client.client_id,
    h.tokens.access_token,
    h.tokens.refresh_token!,
    h.state(),
  ])
    assert.equal(diagnostic.includes(secret), false);
});

test("optional issuer is absent but missing diagnostic values remain own fields", async () => {
  const h = await fixture();
  h.ports.auth = async (provider) => {
    assert.ok(provider.saveClientInformation);
    await provider.saveClientInformation({ client_id: "" });
    await provider.saveTokens({ access_token: "owned", token_type: "Bearer" });
    return "AUTHORIZED";
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
  const value = h.only("publishCanonicalCredentials")[2];
  assert.deepEqual(Object.keys(value), ["clientInformation", "publishedBy", "tokens"]);
  const context = h.calls.find((call) => call.name === "info")?.args[1] as Record<string, unknown>;
  assert.equal(Object.hasOwn(context, "clientIdHash"), true);
  assert.equal(context.clientIdHash, undefined);
  assert.equal(Object.hasOwn(context, "tokenExpiresInSeconds"), true);
  assert.equal(context.tokenExpiresInSeconds, undefined);
  assert.equal(context.hasRefreshToken, false);
});

test("pending publication precedes required log and sequential hooks sharing one context", async (t) => {
  t.mock.method(Date, "now", () => 12345);
  const h = await fixture();
  h.input.transactionTtlMs = 765;
  const publishing = deferred<void>();
  const notified = deferred<void>();
  const url = new URL("https://issuer.invalid/authorize?owned=1");
  let firstContext: unknown;
  h.ports.publishPendingAuthorization = async (...args) => {
    h.record("publishPendingAuthorization", ...args);
    await publishing.promise;
  };
  h.input.onAuthorizationRequired = async (context) => {
    h.record("required", context);
    firstContext = context;
    context.serverName = "mutated-by-first-hook";
    await notified.promise;
  };
  h.input.openAuthorizationUrl = (context) => {
    h.record("open", context);
    assert.equal(context, firstContext);
    assert.equal(context.serverName, "mutated-by-first-hook");
  };
  h.ports.auth = async (provider) => {
    await provider.redirectToAuthorization(url);
    return "AUTHORIZED";
  };
  const result = h.run();
  t.after(() => {
    publishing.resolve();
    notified.resolve();
  });
  await h.called("publishPendingAuthorization");
  assert.equal(h.count("info"), 0);
  assert.equal(h.count("required"), 0);
  assert.equal(h.count("release"), 0);
  const record = h.only("publishPendingAuthorization")[2];
  assert.deepEqual(Object.keys(record), [
    "attemptId",
    "authorizationUrl",
    "baselineGeneration",
    "expiresAt",
    "state",
  ]);
  assert.deepEqual(record, {
    attemptId: h.lease.attemptId,
    authorizationUrl: url.toString(),
    baselineGeneration: h.baseline.generation,
    expiresAt: 13110,
    state: h.state(),
  });
  publishing.resolve();
  await h.called("required");
  assert.equal(h.count("open"), 0);
  notified.resolve();
  assert.deepEqual(await bounded(result, "hooks"), { status: "authorized" });
  const relevant = h
    .names()
    .filter((name) =>
      ["publishPendingAuthorization", "info", "required", "open", "close", "release"].includes(
        name,
      ),
    );
  assert.deepEqual(relevant, [
    "publishPendingAuthorization",
    "info",
    "required",
    "open",
    "close",
    "release",
  ]);
  const log = h.calls.find((call) => call.name === "info");
  assert.ok(log);
  assert.deepEqual(log.args, [
    "MCP OAuth authorization required",
    {
      event: "mcp.oauth.authorization.required",
      credentialKeyPrefix: h.input.keyPrefix,
      mcpServerName: h.input.serverName,
      oauthAttemptId: h.lease.attemptId.slice(0, 12),
      oauthStateId: digest(h.state()).slice(0, 16),
      processId: process.pid,
      callbackPort: 45123,
      status: "waiting",
    },
  ]);
});

test("leader presentation hooks retain the SDK provider as their normal receiver", async () => {
  const h = await fixture();
  const receivers: unknown[] = [];
  h.input.onAuthorizationRequired = function (this: unknown, context) {
    receivers.push(this);
    assert.equal(context.redirectUrl, h.callback.callbackUrl);
  };
  h.input.openAuthorizationUrl = function (this: unknown, context) {
    receivers.push(this);
    assert.equal(context.redirectUrl, h.callback.callbackUrl);
  };
  h.ports.auth = async (provider, options) => {
    h.record("auth", provider, options);
    await provider.redirectToAuthorization(new URL("https://issuer.invalid/owned-receiver"));
    return "AUTHORIZED";
  };
  assert.deepEqual(await h.run(), { status: "authorized" });
  assert.equal(receivers.length, 2);
  assert.equal(receivers[0], h.provider());
  assert.equal(receivers[1], h.provider());
});
