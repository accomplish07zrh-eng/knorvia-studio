// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/client";
import { bounded, deferred, fixture, rejection } from "./mcp-refresh.fixture.js";

test("cached discovery forwards references, ordered options and a redacted completion context", async () => {
  const h = await fixture();
  const metadata = {
    issuer: "https://issuer.invalid",
    response_types_supported: ["code"],
    authorization_endpoint: "https://issuer.invalid/authorize",
    token_endpoint: "https://issuer.invalid/token",
    jwks_uri: "https://issuer.invalid/jwks",
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
  const resourceMetadata = { resource: "https://resource.invalid/mcp" };
  const resource = new URL("https://resource.invalid/selected");
  const fetchFn = async (): Promise<Response> => {
    throw new Error("network forbidden");
  };
  h.input.fetchFn = fetchFn;
  h.before.issuer = "https://issuer.invalid";
  h.discovered.authorizationServerMetadata = metadata;
  h.discovered.resourceMetadata = resourceMetadata;
  h.ports.selectResourceURL = async (...args) => {
    h.record("selectResourceURL", ...args);
    return resource;
  };
  assert.equal(await h.run(), h.next.access_token);
  assert.deepEqual(h.only("loadDiscoveryRecord"), [
    h.store,
    "owned-prefix",
    { expectedIssuer: h.before.issuer },
  ]);
  const [server, provider, observedResource] = h.only("selectResourceURL");
  assert.equal(server, h.input.serverUrl);
  assert.deepEqual(provider, {});
  assert.equal(Object.getPrototypeOf(provider), Object.prototype);
  assert.equal(observedResource, resourceMetadata);
  const [issuer, options] = h.only("refreshAuthorization");
  assert.equal(issuer, h.discovered.authorizationServerUrl);
  assert.deepEqual(Object.keys(options), [
    "clientInformation",
    "refreshToken",
    "metadata",
    "resource",
    "fetchFn",
  ]);
  assert.equal(options.clientInformation, h.before.clientInformation);
  assert.equal(options.refreshToken, "owned-refresh");
  assert.equal(options.metadata, metadata);
  assert.equal(options.resource, resource);
  assert.equal(options.fetchFn, fetchFn);
  const [store, prefix, publication] = h.only("publishCanonicalCredentials");
  assert.equal(store, h.store);
  assert.equal(prefix, "owned-prefix");
  assert.deepEqual(Object.keys(publication), [
    "clientInformation",
    "issuer",
    "publishedBy",
    "tokens",
  ]);
  assert.equal(publication.tokens, h.next);
  assert.equal(publication.clientInformation, h.before.clientInformation);
  assert.equal(publication.publishedBy, "refresh:owned-prefix");
  const info = h.calls.find((call) => call.name === "info")!;
  assert.deepEqual(Object.keys(info.args[1] as object), [
    "event",
    "credentialKeyPrefix",
    "mcpServerName",
    "processId",
    "publishedGeneration",
    "reactive",
    "refreshTokenRotated",
    "status",
  ]);
  assert.deepEqual(info.args, [
    "MCP OAuth access token refreshed",
    {
      event: "mcp.oauth.refresh.completed",
      credentialKeyPrefix: "owned-prefix",
      mcpServerName: "owned-server",
      processId: process.pid,
      publishedGeneration: "0123456789ab",
      reactive: true,
      refreshTokenRotated: true,
      status: "completed",
    },
  ]);
  assert.equal(h.count("discoverOAuthServerInfo"), 0);
  assert.equal(h.count("saveDiscoveryRecord"), 0);
  assert.ok(h.names().indexOf("publishCanonicalCredentials") < h.names().indexOf("info"));
});

test("falsy optional values stay absent and an unrotated token is reported without extra validation", async () => {
  const h = await fixture();
  h.before.issuer = "";
  h.next.refresh_token = "owned-refresh";
  assert.equal(await h.run(), "owned-after");
  assert.deepEqual(h.only("loadDiscoveryRecord")[2], {});
  assert.deepEqual(Object.keys(h.only("refreshAuthorization")[1]), [
    "clientInformation",
    "refreshToken",
  ]);
  assert.deepEqual(Object.keys(h.only("publishCanonicalCredentials")[2]), [
    "clientInformation",
    "publishedBy",
    "tokens",
  ]);
  const info = h.calls.find((call) => call.name === "info")!;
  assert.equal((info.args[1] as { refreshTokenRotated: boolean }).refreshTokenRotated, false);
});

test("nullish cache discovers then saves; weak false cache is saved without rediscovery", async () => {
  for (const cached of [undefined, null, false] as const) {
    const h = await fixture();
    h.ports.loadDiscoveryRecord = async () => cached as unknown as OAuthDiscoveryState | undefined;
    assert.equal(await h.run(), "owned-after");
    assert.equal(h.count("discoverOAuthServerInfo"), cached === false ? 0 : 1);
    assert.equal(h.count("saveDiscoveryRecord"), 1);
    assert.equal(h.only("saveDiscoveryRecord")[2], cached === false ? false : h.discovered);
    assert.equal(
      h.only("refreshAuthorization")[0],
      cached === false ? undefined : h.discovered.authorizationServerUrl,
    );
    if (cached !== false)
      assert.deepEqual(h.only("discoverOAuthServerInfo"), [h.input.serverUrl, {}]);
  }
});

test("live input after discovery is used for saving, resource selection, publication and logging", async () => {
  const h = await fixture();
  h.cached = undefined;
  const firstFetch = async (): Promise<Response> => {
    throw new Error("unexpected fetch one");
  };
  const secondFetch = async (): Promise<Response> => {
    throw new Error("unexpected fetch two");
  };
  h.input.fetchFn = firstFetch;
  const entered = deferred<void>();
  const release = deferred<void>();
  h.ports.discoverOAuthServerInfo = async (...args) => {
    h.record("discoverOAuthServerInfo", ...args);
    entered.resolve();
    await release.promise;
    return h.discovered;
  };
  const running = h.run();
  try {
    await bounded(entered.promise, "discovery");
    h.input.keyPrefix = "later-prefix";
    h.input.serverName = "later-name";
    h.input.serverUrl = "https://later.invalid/mcp";
    h.input.fetchFn = secondFetch;
    h.input.reactive = false;
    release.resolve();
    assert.equal(await running, "owned-after");
    assert.deepEqual(h.only("discoverOAuthServerInfo"), [
      "https://resource.invalid/mcp",
      { fetchFn: firstFetch },
    ]);
    assert.equal(h.only("saveDiscoveryRecord")[1], "later-prefix");
    assert.equal(h.only("selectResourceURL")[0], "https://later.invalid/mcp");
    assert.equal(h.only("refreshAuthorization")[1].fetchFn, secondFetch);
    assert.equal(h.only("publishCanonicalCredentials")[2].publishedBy, "refresh:later-prefix");
    const context = h.calls.find((call) => call.name === "info")!.args[1] as Record<
      string,
      unknown
    >;
    assert.equal(context.credentialKeyPrefix, "later-prefix");
    assert.equal(context.mcpServerName, "later-name");
    assert.equal(context.reactive, false);
  } finally {
    release.resolve();
    await Promise.allSettled([running]);
  }
});

test("the original renewal token is captured before discovery and retained for rotation comparison", async () => {
  const h = await fixture();
  h.next.refresh_token = "owned-refresh";
  h.ports.selectResourceURL = async () => {
    h.before.tokens!.refresh_token = "mutated-later";
    return undefined;
  };
  assert.equal(await h.run(), "owned-after");
  assert.equal(h.only("refreshAuthorization")[1].refreshToken, "owned-refresh");
  const context = h.calls.find((call) => call.name === "info")!.args[1] as Record<string, unknown>;
  assert.equal(context.refreshTokenRotated, false);
});

test("each discovery port failure follows reactive fallback without refresh warning or CAS", async () => {
  for (const phase of ["load", "discover", "save", "resource"] as const) {
    for (const reactive of [false, true]) {
      const h = await fixture();
      h.input.reactive = reactive;
      h.cached = undefined;
      const error = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, `owned ${phase}`);
      const fail = async (): Promise<never> => {
        throw error;
      };
      if (phase === "load") h.ports.loadDiscoveryRecord = fail;
      if (phase === "discover") h.ports.discoverOAuthServerInfo = fail;
      if (phase === "save") h.ports.saveDiscoveryRecord = fail;
      if (phase === "resource") h.ports.selectResourceURL = fail;
      if (reactive) {
        const caught = await rejection(h.run());
        assert.ok(caught instanceof Error);
        assert.equal(caught.cause, error);
        assert.deepEqual(h.only("createTemporaryRefreshFailureError"), [
          { cause: error, serverName: "owned-server" },
        ]);
      } else assert.equal(await h.run(), "owned-before");
      assert.equal(h.count("warn"), 0);
      assert.equal(h.count("invalidateCanonicalCredentials"), 0);
      assert.equal(h.count("refreshAuthorization"), 0);
      assert.equal(h.count("publishCanonicalCredentials"), 0);
    }
  }
});

test("resolved discovery projection failures stay inside discovery even for real InvalidGrant", async () => {
  for (const reactive of [false, true]) {
    const h = await fixture();
    h.input.reactive = reactive;
    const error = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, "metadata projection");
    Object.defineProperty(h.discovered, "authorizationServerMetadata", {
      get() {
        throw error;
      },
    });
    if (reactive) {
      const caught = await rejection(h.run());
      assert.ok(caught instanceof Error);
      assert.equal(caught.cause, error);
    } else assert.equal(await h.run(), "owned-before");
    assert.equal(h.count("warn"), 0);
    assert.equal(h.count("invalidateCanonicalCredentials"), 0);
    assert.equal(h.count("refreshAuthorization"), 0);
  }
});

test("proactive discovery fallback cannot return a token removed during that phase", async () => {
  const h = await fixture();
  h.input.reactive = false;
  const error = new Error("discovery removed tokens");
  h.ports.loadDiscoveryRecord = async () => {
    h.before.tokens = undefined;
    throw error;
  };
  const caught = await rejection(h.run());
  assert.ok(caught instanceof Error);
  assert.equal(caught.cause, error);
  assert.equal(h.count("createTemporaryRefreshFailureError"), 1);
  assert.equal(h.count("warn"), 0);
});
