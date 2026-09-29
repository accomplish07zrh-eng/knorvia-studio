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
} from "./mcp-credential-pair.fixture.js";
const prefix = "owned-prefix";
const canonicalKey = prefix + ":authorization_credentials";
const legacyGeneration = (raw: string) =>
  "legacy-" + createHash("sha256").update(raw).digest("hex").slice(0, 32);

test("canonical-only load awaits one key and retains exact raw and optional values", async () => {
  const raw =
    " \n" +
    JSON.stringify(canonical(2, { expires_at: 0, obtained_at: null, issuer: "", generation: "" })) +
    "\n";
  const gate = Promise.withResolvers<string | null>();
  const seen: string[] = [];
  let finished = false;
  const pending = api
    .loadCanonicalCredentials(
      store({
        load: async (key) => {
          seen.push(key);
          return gate.promise;
        },
      }),
      prefix,
    )
    .then((result) => {
      finished = true;
      return result;
    });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.deepEqual(seen, [canonicalKey]);
  gate.resolve(raw);
  const result = await pending;
  assert.ok(result);
  assert.deepEqual(Object.keys(result), [
    "clientInformation",
    "expiresAt",
    "generation",
    "issuer",
    "obtainedAt",
    "raw",
    "tokens",
  ]);
  assert.deepEqual(result.clientInformation, client);
  assert.deepEqual(result.tokens, tokens);
  assert.equal(result.expiresAt, 0);
  assert.equal(result.obtainedAt, null);
  assert.equal(result.issuer, "");
  assert.equal(result.raw, raw);
  assert.equal(result.generation, legacyGeneration(raw));
});

for (const [label, raw] of [
  ["null", null],
  ["empty", ""],
  ["bad JSON", "{"],
  ["array", "[]"],
  ["scalar", "1"],
  ["invalid canonical", JSON.stringify(canonical(99))],
] as const) {
  test(`canonical load misses ${label} without another store operation`, async () => {
    let calls = 0;
    assert.equal(
      await api.loadCanonicalCredentials(
        store({
          load: async () => {
            calls++;
            return raw;
          },
        }),
        prefix,
      ),
      undefined,
    );
    assert.equal(calls, 1);
  });
}

test("canonical load preserves supplied generations or hashes exact unnormalized JSON", async () => {
  for (const generation of [undefined, null, "", " ", "owned-generation", 17]) {
    const raw = JSON.stringify(canonical(2, { generation }));
    const value = await api.loadCanonicalCredentials(store({ load: async () => raw }), prefix);
    assert.ok(value);
    assert.equal(
      value.generation,
      typeof generation === "string" && generation.length > 0 ? generation : legacyGeneration(raw),
    );
    assert.deepEqual(Object.keys(value), ["clientInformation", "generation", "raw", "tokens"]);
  }
  const raw = JSON.stringify(canonical());
  const a = await api.loadCanonicalCredentials(store({ load: async () => raw }), prefix);
  const b = await api.loadCanonicalCredentials(store({ load: async () => " " + raw }), prefix);
  assert.notEqual(a?.generation, b?.generation);
});

test("canonical read failure identity is not converted to a cache miss", async () => {
  const failure = { owned: "read rejected" };
  await assert.rejects(
    api.loadCanonicalCredentials(
      store({
        load: async () => {
          throw failure;
        },
      }),
      prefix,
    ),
    (error) => error === failure,
  );
});
