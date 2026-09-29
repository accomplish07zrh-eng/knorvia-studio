// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { bounded, deferred, fixture, rejection } from "./mcp-refresh.fixture.js";

test("real InvalidGrant warns then awaits exact raw token CAS, including false CAS result", async () => {
  const h = await fixture();
  const error = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, "owned grant");
  h.ports.refreshAuthorization = async () => {
    throw error;
  };
  const entered = deferred<void>();
  const release = deferred<void>();
  h.ports.invalidateCanonicalCredentials = async (...args) => {
    h.record("invalidateCanonicalCredentials", ...args);
    entered.resolve();
    await release.promise;
    return false;
  };
  const running = h.run();
  const caughtPromise = rejection(running);
  try {
    await bounded(entered.promise, "CAS entry");
    assert.equal(h.count("warn"), 1);
    assert.equal(h.count("createInteractiveAuthorizationRequiredError"), 0);
    release.resolve();
    const caught = await caughtPromise;
    assert.ok(caught instanceof Error);
    assert.equal(caught.cause, error);
    assert.deepEqual(h.only("invalidateCanonicalCredentials"), [
      h.store,
      "owned-prefix",
      "owned-cas-before",
      "tokens",
    ]);
    assert.deepEqual(h.only("createInteractiveAuthorizationRequiredError"), [
      { cause: error, reason: "invalid_grant", serverName: "owned-server" },
    ]);
    const warning = h.calls.find((call) => call.name === "warn")!;
    assert.deepEqual(Object.keys(warning.args[1] as object), [
      "event",
      "credentialKeyPrefix",
      "credentialSource",
      "mcpServerName",
      "oauthErrorCode",
      "processId",
      "reactive",
      "status",
    ]);
    assert.deepEqual(warning.args, [
      "MCP OAuth access token refresh failed",
      {
        event: "mcp.oauth.refresh.failed",
        credentialKeyPrefix: "owned-prefix",
        credentialSource: "canonical",
        mcpServerName: "owned-server",
        oauthErrorCode: h.sdk.OAuthErrorCode.InvalidGrant,
        processId: process.pid,
        reactive: true,
        status: "failed",
      },
    ]);
    assert.ok(h.names().indexOf("warn") < h.names().indexOf("invalidateCanonicalCredentials"));
  } finally {
    release.resolve();
    await caughtPromise;
  }
});

test("both client rejection codes use all-scope CAS or native static-client diagnostics", async () => {
  for (const staticClientId of [undefined, "static-client"]) {
    const h = await fixture();
    for (const code of [
      h.sdk.OAuthErrorCode.InvalidClient,
      h.sdk.OAuthErrorCode.UnauthorizedClient,
    ]) {
      const sample = await fixture();
      sample.input.staticClientId = staticClientId;
      const error = new sample.sdk.OAuthError(code, "owned client");
      sample.ports.refreshAuthorization = async () => {
        throw error;
      };
      const caught = await rejection(sample.run());
      assert.ok(caught instanceof Error);
      assert.equal(caught.cause, error);
      if (staticClientId) {
        assert.equal(Object.getPrototypeOf(caught), Error.prototype);
        assert.equal(
          caught.message,
          "MCP server owned-server OAuth client was rejected by the authorization server (invalid_client). The configured clientId is not usable; fix the MCP oauth configuration.",
        );
        assert.equal(sample.count("invalidateCanonicalCredentials"), 0);
        assert.equal(sample.count("createInteractiveAuthorizationRequiredError"), 0);
      } else {
        assert.deepEqual(sample.only("invalidateCanonicalCredentials"), [
          sample.store,
          "owned-prefix",
          "owned-cas-before",
          "all",
        ]);
        assert.equal(
          sample.only("createInteractiveAuthorizationRequiredError")[0].reason,
          "invalid_client",
        );
      }
      assert.equal(sample.count("warn"), 1);
    }
  }
});

test("absent raw credentials never cause unconditional invalidation", async () => {
  for (const raw of [undefined, ""]) {
    const h = await fixture();
    h.before.raw = raw;
    h.ports.refreshAuthorization = async () => {
      throw new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, "no raw");
    };
    await rejection(h.run());
    assert.equal(h.count("invalidateCanonicalCredentials"), 0);
    assert.equal(h.only("createInteractiveAuthorizationRequiredError")[0].reason, "invalid_grant");
  }
});

test("a plain code lookalike is not treated as an SDK grant error", async () => {
  for (const reactive of [false, true]) {
    const h = await fixture();
    h.input.reactive = reactive;
    const error = { code: h.sdk.OAuthErrorCode.InvalidGrant, message: "plain owned value" };
    assert.equal(error instanceof h.sdk.OAuthError, false);
    h.ports.refreshAuthorization = async () => {
      throw error;
    };
    if (reactive) {
      const caught = await rejection(h.run());
      assert.ok(caught instanceof Error);
      assert.equal(caught.cause, error);
    } else assert.equal(await h.run(), "owned-before");
    const warning = h.calls.find((call) => call.name === "warn")!.args[1] as Record<
      string,
      unknown
    >;
    assert.equal(Object.hasOwn(warning, "oauthErrorCode"), true);
    assert.equal(warning.oauthErrorCode, undefined);
    assert.equal(h.count("invalidateCanonicalCredentials"), 0);
  }
});

test("exchange, publication and completion logging share fallback policy and preserve partial publication", async () => {
  for (const phase of ["exchange", "publication", "info"] as const) {
    for (const reactive of [false, true]) {
      const h = await fixture();
      h.input.reactive = reactive;
      const error = new Error(`owned ${phase}`);
      if (phase === "exchange")
        h.ports.refreshAuthorization = async () => {
          throw error;
        };
      if (phase === "publication")
        h.ports.publishCanonicalCredentials = async (...args) => {
          h.record("publishCanonicalCredentials", ...args);
          throw error;
        };
      if (phase === "info")
        h.logger.info = function () {
          assert.equal(this, h.logger);
          throw error;
        };
      if (reactive) {
        const caught = await rejection(h.run());
        assert.ok(caught instanceof Error);
        assert.equal(caught.cause, error);
      } else assert.equal(await h.run(), "owned-before");
      assert.equal(h.count("warn"), 1);
      assert.equal(h.count("invalidateCanonicalCredentials"), 0);
      assert.equal(h.count("publishCanonicalCredentials"), phase === "exchange" ? 0 : 1);
    }
  }
});

test("success logging is not awaited, and no logger is required", async () => {
  const h = await fixture();
  const pendingLog = deferred<void>();
  h.logger.info = function () {
    assert.equal(this, h.logger);
    return pendingLog.promise;
  };
  try {
    assert.equal(await bounded(h.run(), "unawaited logger"), "owned-after");
  } finally {
    pendingLog.resolve();
  }
  const absent = await fixture();
  absent.input.logger = undefined;
  assert.equal(await absent.run(), "owned-after");
  assert.equal(absent.count("info"), 0);
});

test("warn, CAS and factory throws preserve identity and do not continue error handling", async () => {
  for (const phase of ["warn", "CAS", "factory"] as const) {
    const h = await fixture();
    const primary = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, "grant");
    const secondary = new Error(`owned ${phase}`);
    h.ports.refreshAuthorization = async () => {
      throw primary;
    };
    if (phase === "warn")
      h.logger.warn = function () {
        assert.equal(this, h.logger);
        throw secondary;
      };
    if (phase === "CAS")
      h.ports.invalidateCanonicalCredentials = async () => {
        throw secondary;
      };
    if (phase === "factory")
      h.ports.createInteractiveAuthorizationRequiredError = () => {
        throw secondary;
      };
    assert.equal(await rejection(h.run()), secondary);
    assert.deepEqual(h.only("isKnorviaFileLockTimeoutError"), [secondary]);
    assert.equal(h.count("createTemporaryRefreshFailureError"), 0);
    if (phase === "warn") assert.equal(h.count("invalidateCanonicalCredentials"), 0);
    if (phase !== "factory")
      assert.equal(h.count("createInteractiveAuthorizationRequiredError"), 0);
  }
});

test("actual SDK code read failure is outside warning and invalidation", async () => {
  const h = await fixture();
  const primary = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, "grant");
  const secondary = new Error("owned code getter");
  let reads = 0;
  Object.defineProperty(primary, "code", {
    get() {
      reads++;
      throw secondary;
    },
  });
  h.ports.refreshAuthorization = async () => {
    throw primary;
  };
  assert.equal(await rejection(h.run()), secondary);
  assert.equal(reads, 1);
  assert.equal(h.count("warn"), 0);
  assert.equal(h.count("invalidateCanonicalCredentials"), 0);
});

test("exchange options and final access-token property failures retain exchange error handling", async () => {
  for (const phase of ["fetch", "access"] as const) {
    const h = await fixture();
    const error = new h.sdk.OAuthError(h.sdk.OAuthErrorCode.InvalidGrant, phase);
    if (phase === "fetch")
      Object.defineProperty(h.input, "fetchFn", {
        get() {
          throw error;
        },
      });
    else
      Object.defineProperty(h.next, "access_token", {
        get() {
          throw error;
        },
      });
    const caught = await rejection(h.run());
    assert.ok(caught instanceof Error);
    assert.equal(caught.cause, error);
    assert.equal(h.count("warn"), 1);
    assert.deepEqual(h.only("invalidateCanonicalCredentials"), [
      h.store,
      "owned-prefix",
      "owned-cas-before",
      "tokens",
    ]);
    assert.equal(h.count("publishCanonicalCredentials"), phase === "fetch" ? 0 : 1);
    assert.equal(h.count("info"), phase === "fetch" ? 0 : 1);
  }
});
