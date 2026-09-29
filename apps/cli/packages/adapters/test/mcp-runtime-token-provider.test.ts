// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  harness,
  providerInput,
  store,
  deferred,
  type Pair,
  type ProviderInput,
} from "./mcp-lease-provider.fixture.js";
const unauthorizedContext = {
  response: new Response(null, { status: 401 }),
  serverUrl: new URL("https://unrelated-transport.example.invalid"),
  fetchFn: async (): Promise<Response> => {
    throw new Error("Provider must not use the transport fetch");
  },
};
const pair = (refreshToken?: string): Pair => ({
  source: "canonical",
  tokens: {
    access_token: "owned-access",
    token_type: "Bearer",
    ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
  },
});
const interactive = (reason: string) =>
  Object.assign(new Error("Owned interactive " + reason), {
    code: "MCP_OAUTH_INTERACTIVE_REQUIRED" as const,
    reason: reason as "no_credentials" | "no_refresh_token",
  });

test("runtime provider is a plain two-method async surface and does no work at construction", async (t) => {
  const { provider } = await harness(t);
  assert.deepEqual(Object.keys(provider), ["createMcpOAuthTokenProvider"]);
  assert.equal(provider.createMcpOAuthTokenProvider.length, 1);
  const value = provider.createMcpOAuthTokenProvider(providerInput());
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), ["token", "onUnauthorized"]);
  for (const method of [value.token, value.onUnauthorized]) {
    assert.equal(typeof method, "function");
    assert.equal(method!.length, 0);
    assert.equal(method!.constructor.name, "AsyncFunction");
  }
});
for (const [label, value] of [
  ["missing", undefined],
  ["empty pair", { source: "legacy" }],
  ["null tokens", { source: "legacy", tokens: null }],
  ["false tokens", { source: "legacy", tokens: false }],
] as const) {
  test("token missing branch: " + label, async (t) => {
    const { provider, ports } = await harness(t);
    const input = providerInput();
    let reads = 0;
    ports.loadCredentialPair = async (s, key) => {
      assert.equal(s, input.credentialStore);
      assert.equal(key, input.keyPrefix);
      reads++;
      return value as Pair;
    };
    assert.equal(await provider.createMcpOAuthTokenProvider(input).token(), undefined);
    assert.equal(reads, 1);
  });
}
for (const [label, near, refresh] of [
  ["fresh refreshable", false, "owned-refresh"],
  ["near missing refresh", true, undefined],
  ["near empty refresh", true, ""],
] as const) {
  test("token current branch: " + label, async (t) => {
    const { provider, ports } = await harness(t);
    const value = pair(refresh);
    let expiryChecks = 0;
    ports.loadCredentialPair = async () => value;
    ports.isCanonicalTokenNearExpiry = (actual) => {
      assert.equal(actual, value);
      expiryChecks++;
      return near;
    };
    assert.equal(
      await provider.createMcpOAuthTokenProvider(providerInput()).token(),
      "owned-access",
    );
    assert.equal(expiryChecks, 1);
  });
}
test("proactive refresh waits and returns new value with the captured references", async (t) => {
  const { provider, ports } = await harness(t);
  const input = providerInput({ config: { type: "authorization_code", clientId: "owned-client" } });
  const value = pair("owned-refresh");
  const gate = deferred<string>();
  const calls: unknown[] = [];
  ports.loadCredentialPair = async () => value;
  ports.isCanonicalTokenNearExpiry = () => true;
  ports.refreshMcpOAuthTokensUnderLock = (args) => {
    calls.push(args);
    return gate.promise;
  };
  let settled = false;
  const result = Promise.resolve(provider.createMcpOAuthTokenProvider(input).token()).finally(
    () => {
      settled = true;
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(calls, [
    {
      credentialStore: input.credentialStore,
      keyPrefix: input.keyPrefix,
      serverName: input.serverName,
      serverUrl: input.serverUrl,
      staticClientId: "owned-client",
      reactive: false,
    },
  ]);
  gate.resolve("owned-new-access");
  assert.equal(await result, "owned-new-access");
});
for (const [label, value, reason] of [
  ["absent", undefined, "no_credentials"],
  ["tokens absent", { source: "legacy" }, "no_credentials"],
  ["tokens false", { source: "legacy", tokens: false }, "no_credentials"],
  ["refresh absent", pair(), "no_refresh_token"],
  ["refresh empty", pair(""), "no_refresh_token"],
  ["empty tokens object", { source: "legacy", tokens: {} }, "no_refresh_token"],
] as const) {
  test("401 requires interaction: " + label, async (t) => {
    const { provider, ports } = await harness(t);
    const input = providerInput();
    const marker = interactive(reason);
    const calls: unknown[] = [];
    ports.loadCredentialPair = async () => value as Pair;
    ports.createInteractiveAuthorizationRequiredError = (args) => {
      calls.push(args);
      return marker;
    };
    const p = provider.createMcpOAuthTokenProvider(input);
    await assert.rejects(
      async () => p.onUnauthorized!(unauthorizedContext),
      (e) => e === marker,
    );
    assert.deepEqual(calls, [{ reason, serverName: input.serverName }]);
  });
}
test("401 always refreshes with reactive true, ignores result and next token rereads", async (t) => {
  const { provider, ports } = await harness(t);
  let current = pair("owned-refresh");
  let reads = 0;
  ports.loadCredentialPair = async () => {
    reads++;
    return current;
  };
  ports.refreshMcpOAuthTokensUnderLock = async (args) => {
    assert.equal(args.reactive, true);
    current = { ...current!, tokens: { access_token: "new-from-store", token_type: "Bearer" } };
    return "ignored-direct-return";
  };
  const p = provider.createMcpOAuthTokenProvider(providerInput());
  assert.equal(await p.onUnauthorized!(unauthorizedContext), undefined);
  assert.equal(reads, 1);
  ports.isCanonicalTokenNearExpiry = () => false;
  assert.equal(await p.token(), "new-from-store");
  assert.equal(reads, 2);
});
test("factory captures refresh config while each load and interaction name stay live", async (t) => {
  const { provider, ports } = await harness(t);
  const input = providerInput({
    config: { type: "authorization_code", clientId: "original-client" },
  });
  const original = { ...input };
  const p = provider.createMcpOAuthTokenProvider(input);
  const laterStore = store();
  input.credentialStore = laterStore;
  input.keyPrefix = "later";
  input.serverName = "Later";
  input.serverUrl = "https://later.example.invalid";
  input.config.clientId = "later-client";
  const loads: unknown[][] = [],
    refreshes: unknown[] = [];
  ports.loadCredentialPair = async (...args) => {
    loads.push(args);
    return pair("owned-refresh");
  };
  ports.isCanonicalTokenNearExpiry = () => true;
  ports.refreshMcpOAuthTokensUnderLock = async (args) => {
    refreshes.push(args);
    return "new";
  };
  await p.token();
  await p.onUnauthorized!(unauthorizedContext);
  assert.deepEqual(loads, [
    [laterStore, "later"],
    [laterStore, "later"],
  ]);
  for (const [index, reactive] of [false, true].entries())
    assert.deepEqual(refreshes[index], {
      credentialStore: original.credentialStore,
      keyPrefix: original.keyPrefix,
      serverName: original.serverName,
      serverUrl: original.serverUrl,
      staticClientId: "original-client",
      reactive,
    });
  assert.notEqual(refreshes[0], refreshes[1]);
  ports.loadCredentialPair = async () => undefined;
  const marker = interactive("no_credentials");
  ports.createInteractiveAuthorizationRequiredError = (args) => {
    assert.equal(args.serverName, "Later");
    return marker;
  };
  await assert.rejects(
    async () => p.onUnauthorized!(unauthorizedContext),
    (e) => e === marker,
  );
});
test("factory keeps truthy optional fields and their stable lookup order", async (t) => {
  const { provider, ports } = await harness(t);
  const trace: string[] = [];
  const fetchFn: NonNullable<ProviderInput["fetchFn"]> = async () => {
    throw new Error("Must not call fetch");
  };
  const logger: NonNullable<ProviderInput["logger"]> = {
    debug() {
      assert.fail();
    },
    info() {
      assert.fail();
    },
    warn() {
      assert.fail();
    },
    error() {
      assert.fail();
    },
    child() {
      assert.fail();
    },
  };
  const input = providerInput({
    fetchFn,
    logger,
    config: { type: "authorization_code", clientId: "owned-client" },
  });
  const watched = {} as ProviderInput;
  for (const [key, value] of Object.entries(input))
    Object.defineProperty(watched, key, {
      get() {
        trace.push(key);
        return value;
      },
    });
  const p = provider.createMcpOAuthTokenProvider(watched);
  assert.deepEqual(trace, [
    "credentialStore",
    "fetchFn",
    "fetchFn",
    "keyPrefix",
    "logger",
    "logger",
    "serverName",
    "serverUrl",
    "config",
    "config",
  ]);
  ports.loadCredentialPair = async () => pair("r");
  ports.isCanonicalTokenNearExpiry = () => true;
  ports.refreshMcpOAuthTokensUnderLock = async (args) => {
    assert.deepEqual(Object.keys(args), [
      "credentialStore",
      "fetchFn",
      "keyPrefix",
      "logger",
      "serverName",
      "serverUrl",
      "staticClientId",
      "reactive",
    ]);
    assert.equal(args.fetchFn, fetchFn);
    assert.equal(args.logger, logger);
    return "fresh";
  };
  assert.equal(await p.token(), "fresh");
});
test("falsy optional fields are omitted from every refresh call", async (t) => {
  const { provider, ports } = await harness(t);
  const input = providerInput({
    config: { type: "authorization_code", clientId: "" },
    fetchFn: null as unknown as ProviderInput["fetchFn"],
    logger: false as unknown as ProviderInput["logger"],
  });
  ports.loadCredentialPair = async () => pair("r");
  ports.isCanonicalTokenNearExpiry = () => true;
  ports.refreshMcpOAuthTokensUnderLock = async (args) => {
    assert.deepEqual(Object.keys(args), [
      "credentialStore",
      "keyPrefix",
      "serverName",
      "serverUrl",
      "reactive",
    ]);
    return "fresh";
  };
  assert.equal(await provider.createMcpOAuthTokenProvider(input).token(), "fresh");
});
test("concurrent invocations independently load and delegate without adding another lock", async (t) => {
  const { provider, ports } = await harness(t);
  const gate = deferred<string>();
  let reads = 0,
    refreshes = 0;
  ports.loadCredentialPair = async () => {
    reads++;
    return pair("r");
  };
  ports.isCanonicalTokenNearExpiry = () => true;
  ports.refreshMcpOAuthTokensUnderLock = () => {
    refreshes++;
    return gate.promise;
  };
  const p = provider.createMcpOAuthTokenProvider(providerInput());
  const a = p.token(),
    b = p.token();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reads, 2);
  assert.equal(refreshes, 2);
  gate.resolve("fresh");
  assert.deepEqual(await Promise.all([a, b]), ["fresh", "fresh"]);
});
for (const [method, failure] of [
  ["token", "load"],
  ["onUnauthorized", "load"],
  ["token", "near"],
  ["token", "refresh"],
  ["onUnauthorized", "refresh"],
  ["onUnauthorized", "error factory"],
] as const) {
  test("provider preserves failure identity: " + method + " " + failure, async (t) => {
    const { provider, ports } = await harness(t);
    const marker = new Error("Owned dependency failure");
    ports.loadCredentialPair = async () => {
      if (failure === "load") throw marker;
      return failure === "error factory" ? undefined : pair("r");
    };
    ports.isCanonicalTokenNearExpiry = () => {
      if (failure === "near") throw marker;
      return true;
    };
    ports.refreshMcpOAuthTokensUnderLock = async () => {
      throw marker;
    };
    ports.createInteractiveAuthorizationRequiredError = () => {
      throw marker;
    };
    const p = provider.createMcpOAuthTokenProvider(providerInput());
    await assert.rejects(
      async () => (method === "token" ? p.token() : p.onUnauthorized!(unauthorizedContext)),
      (e) => e === marker,
    );
  });
}
