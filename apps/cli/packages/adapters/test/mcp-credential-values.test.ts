// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonical, credentials as api, namespace } from "./mcp-credential-pair.fixture.js";

test("credential helpers retain their complete runtime surface and arities", () => {
  const arities = {
    deriveCredentialPair: 1,
    invalidateCanonicalCredentials: 4,
    isCanonicalCredentials: 1,
    isCanonicalTokenNearExpiry: 1,
    isRecord: 1,
    loadCanonicalCredentials: 2,
    loadCredentialPair: 2,
    mcpOAuthCredentialKey: 2,
    publishCanonicalCredentials: 3,
  };
  assert.deepEqual(
    Object.keys(api).sort(),
    [
      ...Object.keys(arities),
      "MCP_OAUTH_CANONICAL_CREDENTIALS_KEY",
      "MCP_OAUTH_CREDENTIALS_VERSION",
      "MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS",
    ].sort(),
  );
  for (const [key, arity] of Object.entries(arities))
    assert.equal(api[key as keyof typeof arities].length, arity);
  assert.deepEqual(Object.keys(namespace), ["createCredentialKeyPrefix"]);
  assert.equal(namespace.createCredentialKeyPrefix.length, 3);
  assert.equal(api.MCP_OAUTH_CANONICAL_CREDENTIALS_KEY, "authorization_credentials");
  assert.equal(api.MCP_OAUTH_CREDENTIALS_VERSION, 2);
  assert.deepEqual([...api.MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS], [1, 2]);
});

test("namespace uses raw newline-framed values and native SHA-256 prefix", () => {
  const config = {
    type: "authorization_code" as const,
    clientId: " c ",
    scope: "read  write",
    redirectPath: "/finish/",
  };
  const framed = ["Server\nName", "https://OWNED.example/", " c ", "read  write", "/finish/"].join(
    "\n",
  );
  assert.equal(
    namespace.createCredentialKeyPrefix("Server\nName", "https://OWNED.example/", config),
    "mcp:oauth:" + createHash("sha256").update(framed).digest("hex").slice(0, 24),
  );
  assert.equal(api.mcpOAuthCredentialKey("p:a", "b:c"), "p:a:b:c");
  assert.equal(api.mcpOAuthCredentialKey("", ""), ":");
});

test("namespace ignores unrelated configuration and only defaults nullish fields", () => {
  const base = { type: "authorization_code" as const };
  const config = {
    ...base,
    clientId: null,
    scope: undefined,
    redirectPath: "",
    get clientSecret() {
      throw new Error("must not read secret");
    },
    get type() {
      throw new Error("must not inspect grant");
    },
  } as unknown as Parameters<typeof namespace.createCredentialKeyPrefix>[2];
  assert.equal(
    namespace.createCredentialKeyPrefix("s", "u", config),
    namespace.createCredentialKeyPrefix("s", "u", base),
  );
  assert.notEqual(
    namespace.createCredentialKeyPrefix("s", "u/", base),
    namespace.createCredentialKeyPrefix("s", "u", base),
  );
  assert.notEqual(
    namespace.createCredentialKeyPrefix("s", "u", { ...base, scope: " " }),
    namespace.createCredentialKeyPrefix("s", "u", base),
  );
});

test("namespace reads its three config values once in order and preserves a getter failure", () => {
  const seen: string[] = [];
  const config = {
    type: "authorization_code" as const,
    get clientId() {
      seen.push("client");
      return "c";
    },
    get scope() {
      seen.push("scope");
      return "s";
    },
    get redirectPath() {
      seen.push("redirect");
      return "/r";
    },
  };
  namespace.createCredentialKeyPrefix("s", "u", config);
  assert.deepEqual(seen, ["client", "scope", "redirect"]);
  const failure = { owned: "config" };
  assert.throws(
    () =>
      namespace.createCredentialKeyPrefix("s", "u", {
        ...config,
        get scope(): string | undefined {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
});

test("record predicate preserves non-array object boundaries including inherited records", () => {
  for (const value of [{}, Object.create(null), new Date(), new Map(), Object.create({ a: 1 })])
    assert.equal(api.isRecord(value), true);
  for (const value of [undefined, null, [], "x", 1, false, Symbol("owned"), () => ({})])
    assert.equal(api.isRecord(value), false);
});

test("canonical validation is shallow, inherited and accepts empty credential strings", () => {
  assert.equal(api.isCanonicalCredentials(Object.create(canonical())), true);
  assert.equal(
    api.isCanonicalCredentials(
      canonical(1, {
        published_by: " ",
        client_information: { client_id: "" },
        tokens: { access_token: "", token_type: "" },
        expires_at: "opaque",
        obtained_at: null,
        issuer: false,
        generation: [],
      }),
    ),
    true,
  );
});

for (const [label, patch] of [
  ["text version", { version: "2" }],
  ["unknown version", { version: 9 }],
  ["empty publisher", { published_by: "" }],
  ["non-string publisher", { published_by: 1 }],
  ["array client", { client_information: [] }],
  ["missing client id", { client_information: {} }],
  ["array tokens", { tokens: [] }],
  ["missing token type", { tokens: { access_token: "x" } }],
  ["numeric access token", { tokens: { access_token: 1, token_type: "Bearer" } }],
] as const)
  test(`canonical predicate rejects ${label}`, () =>
    assert.equal(api.isCanonicalCredentials(canonical(2, patch)), false));

test("validation consults the live supported Set and restores it after observation", () => {
  const set = api.MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS;
  const before = [...set];
  try {
    set.add(3);
    set.delete(1);
    assert.equal(api.isCanonicalCredentials(canonical(3)), true);
    assert.equal(api.isCanonicalCredentials(canonical(1)), false);
  } finally {
    set.clear();
    for (const version of before) set.add(version);
  }
  assert.equal(set, api.MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS);
});

test("predicate short-circuits ordered getters and propagates ordinary lookup failure", () => {
  const seen: string[] = [];
  const c: Record<string, unknown> = {},
    t: Record<string, unknown> = {},
    value: Record<string, unknown> = {};
  const property = (target: object, key: string, result: unknown, label = key) =>
    Object.defineProperty(target, key, {
      get() {
        seen.push(label);
        return result;
      },
    });
  property(c, "client_id", "owned", "client.id");
  property(t, "access_token", "owned", "tokens.access");
  property(t, "token_type", "Bearer", "tokens.type");
  for (const [key, result] of Object.entries({
    version: 2,
    published_by: "owner",
    client_information: c,
    tokens: t,
  }))
    property(value, key, result);
  assert.equal(api.isCanonicalCredentials(value), true);
  assert.deepEqual(seen, [
    "version",
    "version",
    "published_by",
    "published_by",
    "client_information",
    "tokens",
    "client_information",
    "client.id",
    "tokens",
    "tokens.access",
    "tokens",
    "tokens.type",
  ]);
  const failure = { owned: "lookup" };
  assert.equal(
    api.isCanonicalCredentials({
      version: "2",
      get published_by() {
        throw failure;
      },
    }),
    false,
  );
  assert.throws(
    () =>
      api.isCanonicalCredentials({
        version: 2,
        get published_by() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
});

test("near-expiry preserves missing, equality and ordinary numeric behavior", () => {
  assert.equal(api.isCanonicalTokenNearExpiry({}, 0), true);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: 40000 }, 9999), false);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: 40000 }, 10000), true);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: 0 }, 0, 0), true);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: 100 }, 100, -1), false);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: NaN }, 100), false);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: Infinity }, 100), false);
  assert.equal(api.isCanonicalTokenNearExpiry({ expiresAt: 0 }), true);
});

test("near-expiry checks missing before a second native comparison lookup", () => {
  let reads = 0;
  assert.equal(
    api.isCanonicalTokenNearExpiry(
      {
        get expiresAt() {
          reads++;
          return 40000;
        },
      },
      10000,
    ),
    true,
  );
  assert.equal(reads, 2);
  reads = 0;
  assert.equal(
    api.isCanonicalTokenNearExpiry(
      {
        get expiresAt() {
          reads++;
          return undefined;
        },
      },
      0,
    ),
    true,
  );
  assert.equal(reads, 1);
});
