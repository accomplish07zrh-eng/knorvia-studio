// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  canonical,
  client,
  credentials as api,
  store,
  tokens,
  type PairInput,
} from "./mcp-credential-pair.fixture.js";

const derive = (value: unknown, legacyClient?: unknown, legacyTokens?: unknown) =>
  api.deriveCredentialPair({
    canonicalRaw: JSON.stringify(value),
    legacyClientRaw: JSON.stringify(legacyClient),
    legacyTokensRaw: JSON.stringify(legacyTokens),
  });
const nextTokens = { ...tokens, access_token: "owned-next" };
const otherClient = { client_id: "owned-other" };

test("v1 with no mirrors retains canonical optional fields and exact raw generation", () => {
  const raw =
    " " + JSON.stringify(canonical(1, { issuer: "", expires_at: 0, obtained_at: null })) + "\n";
  const value = api.deriveCredentialPair({ canonicalRaw: raw });
  assert.ok(value);
  assert.deepEqual(Object.keys(value), [
    "clientInformation",
    "expiresAt",
    "generation",
    "issuer",
    "obtainedAt",
    "raw",
    "source",
    "tokens",
  ]);
  assert.equal(value.source, "canonical");
  assert.equal(value.raw, raw);
  assert.equal(
    value.generation,
    "legacy-" + createHash("sha256").update(raw).digest("hex").slice(0, 32),
  );
  assert.deepEqual(value.clientInformation, client);
  assert.deepEqual(value.tokens, tokens);
  assert.equal(value.expiresAt, 0);
  assert.equal(value.issuer, "");
  assert.equal(value.obtainedAt, null);
});

test("v1 accepts same-client refresh with native deep equality independent of JSON key order", () => {
  const canonicalClient = { ...client, metadata: { one: 1, two: [2, 3] } };
  const reordered = {
    metadata: { two: [2, 3], one: 1 },
    client_name: client.client_name,
    client_id: client.client_id,
  };
  assert.deepEqual(
    derive(canonical(1, { client_information: canonicalClient }), reordered, nextTokens),
    {
      clientInformation: reordered,
      source: "legacy",
      tokens: nextTokens,
    },
  );
});

test("v1 differing truthy client cannot claim a new mirror token", () => {
  const value = derive(canonical(1), otherClient, nextTokens);
  assert.equal(value?.source, "canonical");
  assert.deepEqual(value?.tokens, tokens);
});

for (const tokenValue of [null, false, 0, ""] as const)
  test(`v1 retains parsed ${JSON.stringify(tokenValue)} legacy tokens`, () => {
    assert.deepEqual(derive(canonical(1), undefined, tokenValue), {
      clientInformation: client,
      source: "legacy",
      tokens: tokenValue,
    });
  });

test("v1 client truthiness and final nullish fallback are distinct", () => {
  for (const value of [null, false, 0, ""] as const) {
    assert.deepEqual(derive(canonical(1), value, nextTokens), {
      clientInformation: value ?? client,
      source: "legacy",
      tokens: nextTokens,
    });
  }
});

test("v1 malformed or absent mirror token retains canonical while parsed null can be adopted", () => {
  const raw = JSON.stringify(canonical(1));
  assert.equal(
    api.deriveCredentialPair({ canonicalRaw: raw, legacyTokensRaw: "{" })?.source,
    "canonical",
  );
  assert.equal(
    api.deriveCredentialPair({ canonicalRaw: raw, legacyTokensRaw: "" })?.source,
    "canonical",
  );
  assert.equal(
    api.deriveCredentialPair({ canonicalRaw: raw, legacyTokensRaw: "null" })?.source,
    "legacy",
  );
});

for (const tokenValue of [undefined, null, false, 0, ""] as const)
  test(`v2 never resurrects tokens after ${String(tokenValue)} mirror invalidation`, () => {
    assert.deepEqual(derive(canonical(), client, tokenValue), {
      clientInformation: client,
      source: "legacy",
    });
  });

test("v2 missing mirrors still return own undefined client instead of no snapshot", () => {
  const value = derive(canonical());
  assert.ok(value);
  assert.deepEqual(Object.keys(value), ["clientInformation", "source"]);
  assert.equal(value.clientInformation, undefined);
  assert.equal(value.source, "legacy");
});

test("v2 equal tokens and a truthy differing client retain the canonical pair", () => {
  const original = canonical(2, { generation: "owned-generation" });
  const value = derive(original, otherClient, {
    token_type: "Bearer",
    access_token: "owned-access",
  });
  assert.equal(value?.source, "canonical");
  assert.deepEqual(value?.clientInformation, client);
  assert.equal(value?.generation, "owned-generation");
  assert.deepEqual(value?.tokens, tokens);
});

test("v2 equal tokens without a truthy client omit the client own key", () => {
  for (const value of [undefined, null, false, 0, ""] as const) {
    const result = derive(canonical(), value, tokens);
    assert.deepEqual(result, { source: "legacy", tokens });
    assert.equal(Object.hasOwn(result!, "clientInformation"), false);
  }
});

test("v2 changed token adopts same-client refresh without canonical metadata", () => {
  const value = derive(
    canonical(2, { issuer: "owned-issuer", expires_at: 500, generation: "owned-gen" }),
    client,
    nextTokens,
  );
  assert.deepEqual(value, { clientInformation: client, source: "legacy", tokens: nextTokens });
  assert.deepEqual(Object.keys(value!), ["clientInformation", "source", "tokens"]);
});

test("v2 ambiguous changed pair keeps only the mirror client for reauthorization", () => {
  assert.deepEqual(derive(canonical(), otherClient, nextTokens), {
    clientInformation: otherClient,
    source: "legacy",
  });
  assert.deepEqual(derive(canonical(), undefined, nextTokens), {
    clientInformation: undefined,
    source: "legacy",
  });
  assert.deepEqual(derive(canonical(), false, nextTokens), {
    clientInformation: false,
    source: "legacy",
  });
});

test("a later version accepted by the live Set uses non-v1 mirror policy", () => {
  const versions = api.MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS;
  try {
    versions.add(3);
    assert.deepEqual(derive(canonical(3), client), { clientInformation: client, source: "legacy" });
  } finally {
    versions.delete(3);
  }
});

test("legacy-only snapshots keep weak truthy values and exact own-field shape", () => {
  assert.equal(derive(undefined), undefined);
  assert.equal(derive(undefined, null, false), undefined);
  assert.deepEqual(derive(undefined, undefined, tokens), {
    clientInformation: undefined,
    source: "legacy",
    tokens,
  });
  assert.deepEqual(derive(undefined, "opaque-client", 0), {
    clientInformation: "opaque-client",
    source: "legacy",
  });
  assert.deepEqual(derive(undefined, [], [1]), {
    clientInformation: [],
    source: "legacy",
    tokens: [1],
  });
});

test("malformed and invalid canonical JSON fall back to legacy without extra validation", () => {
  for (const raw of ["{", "", "null", "[]", JSON.stringify(canonical(99))]) {
    assert.deepEqual(
      api.deriveCredentialPair({ canonicalRaw: raw, legacyTokensRaw: JSON.stringify(tokens) }),
      { clientInformation: undefined, source: "legacy", tokens },
    );
  }
});

test("pure derivation produces new parsed values for each call and leaves input unchanged", () => {
  const raw = JSON.stringify(canonical(1));
  const input = Object.freeze({ canonicalRaw: raw });
  const a = api.deriveCredentialPair(input),
    b = api.deriveCredentialPair(input);
  assert.ok(a);
  assert.ok(b);
  assert.notEqual(a, b);
  assert.notEqual(a.tokens, b.tokens);
  assert.notEqual(a.clientInformation, b.clientInformation);
  assert.deepEqual(a, b);
  assert.equal(input.canonicalRaw, raw);
});

test("raw input accessor order and canonical re-reads precede decision output", () => {
  const seen: string[] = [],
    raw = JSON.stringify(canonical(1));
  const input: PairInput = {
    get canonicalRaw() {
      seen.push("canonical");
      return raw;
    },
    get legacyClientRaw() {
      seen.push("client");
      return undefined;
    },
    get legacyTokensRaw() {
      seen.push("tokens");
      return undefined;
    },
  };
  assert.equal(api.deriveCredentialPair(input)?.source, "canonical");
  assert.deepEqual(seen, ["canonical", "client", "tokens", "canonical", "canonical", "canonical"]);
});

test("parse miss does not catch caller getter failures or eagerly access later fields", () => {
  const failure = { owned: "raw getter" };
  let later = false;
  assert.throws(
    () =>
      api.deriveCredentialPair({
        get canonicalRaw(): string | undefined {
          throw failure;
        },
        get legacyClientRaw() {
          later = true;
          return "{}";
        },
      }),
    (error) => error === failure,
  );
  assert.equal(later, false);
  assert.throws(
    () =>
      api.deriveCredentialPair({
        canonicalRaw: "{",
        get legacyClientRaw(): string | undefined {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
});

test("pair load awaits one ordered snapshot and delegates the same pure projection", async () => {
  const prefix = "owned",
    keys = ["owned:authorization_credentials", "owned:client_information", "owned:tokens"];
  const raw = JSON.stringify(canonical(1));
  const gate = Promise.withResolvers<Record<string, string | null>>();
  const calls: string[][] = [];
  let finished = false;
  const pending = api
    .loadCredentialPair(
      store({
        loadMany: async (requested) => {
          calls.push([...requested]);
          return gate.promise;
        },
      }),
      prefix,
    )
    .then((value) => {
      finished = true;
      return value;
    });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.deepEqual(calls, [keys]);
  const seen: string[] = [],
    values: Record<string, string | null> = {};
  for (const [i, key] of keys.entries())
    Object.defineProperty(values, key, {
      get() {
        seen.push(key);
        return i === 0 ? raw : null;
      },
    });
  Object.defineProperty(values, "unrelated", {
    get() {
      throw new Error("unused entry");
    },
  });
  gate.resolve(values);
  const value = await pending;
  assert.deepEqual(seen, keys);
  assert.deepEqual(value, api.deriveCredentialPair({ canonicalRaw: raw }));
});

test("pair load preserves store and post-await snapshot getter rejection identities", async () => {
  const failure = { owned: "snapshot" };
  await assert.rejects(
    api.loadCredentialPair(
      store({
        loadMany: async () => {
          throw failure;
        },
      }),
      "p",
    ),
    (error) => error === failure,
  );
  let later = false;
  await assert.rejects(
    api.loadCredentialPair(
      store({
        loadMany: async () => ({
          get "p:authorization_credentials"(): string | null {
            throw failure;
          },
          get "p:client_information"(): string | null {
            later = true;
            return null;
          },
        }),
      }),
      "p",
    ),
    (error) => error === failure,
  );
  assert.equal(later, false);
});
