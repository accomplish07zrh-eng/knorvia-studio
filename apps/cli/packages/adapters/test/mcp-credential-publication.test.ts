// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  client,
  credentials as api,
  store,
  tokens,
  type Publication,
} from "./mcp-credential-pair.fixture.js";

const prefix = "owned-prefix";
const canonicalKey = prefix + ":authorization_credentials";
const keys = [canonicalKey, prefix + ":client_information", prefix + ":tokens"];
const input = (extra: Partial<Publication> = {}): Publication => ({
  clientInformation: client,
  tokens,
  publishedBy: "owned-publisher",
  obtainedAt: 100,
  ...extra,
});

test("publication serializes one ordered batch, awaits it and borrows client/token references", async () => {
  const clientValue = Object.freeze({ ...client, extension: "kept" });
  const tokenValue = Object.freeze({ ...tokens, expires_in: 2, refresh_token: "owned-refresh" });
  const supplied = Object.freeze(
    input({ clientInformation: clientValue, tokens: tokenValue, issuer: "" }),
  );
  const gate = Promise.withResolvers<void>();
  const batches: Readonly<Record<string, string>>[] = [];
  let finished = false;
  const pending = api
    .publishCanonicalCredentials(
      store({
        saveMany: async (entries) => {
          batches.push(entries);
          await gate.promise;
        },
      }),
      prefix,
      supplied,
    )
    .then((value) => {
      finished = true;
      return value;
    });
  assert.equal(batches.length, 1);
  assert.deepEqual(Object.keys(batches[0]!), keys);
  await Promise.resolve();
  assert.equal(finished, false);
  gate.resolve();
  const result = await pending;
  assert.deepEqual(Object.keys(result), [
    "canonical",
    "generation",
    "legacyClientRaw",
    "legacyTokensRaw",
    "raw",
  ]);
  assert.deepEqual(Object.keys(result.canonical), [
    "client_information",
    "expires_at",
    "generation",
    "issuer",
    "obtained_at",
    "published_by",
    "tokens",
    "version",
  ]);
  assert.equal(result.canonical.client_information, clientValue);
  assert.equal(result.canonical.tokens, tokenValue);
  assert.equal(result.canonical.expires_at, 2100);
  assert.equal(result.canonical.issuer, "");
  assert.equal(result.canonical.version, 2);
  assert.match(result.generation, /^[0-9a-f]{32}$/u);
  assert.equal(result.canonical.generation, result.generation);
  assert.deepEqual(batches[0], {
    [canonicalKey]: result.raw,
    [keys[1]!]: result.legacyClientRaw,
    [keys[2]!]: result.legacyTokensRaw,
  });
  assert.deepEqual(JSON.parse(result.raw), result.canonical);
  assert.deepEqual(JSON.parse(result.legacyClientRaw), clientValue);
  assert.deepEqual(JSON.parse(result.legacyTokensRaw), tokenValue);
});

test("each publication creates its own generation and canonical record", async () => {
  const memory = store({ saveMany: async () => {} });
  const supplied = input();
  const a = await api.publishCanonicalCredentials(memory, prefix, supplied);
  const b = await api.publishCanonicalCredentials(memory, prefix, supplied);
  assert.notEqual(a.canonical, b.canonical);
  assert.notEqual(a.generation, b.generation);
  assert.match(b.generation, /^[0-9a-f]{32}$/u);
  assert.deepEqual(Object.keys(a.canonical), [
    "client_information",
    "generation",
    "obtained_at",
    "published_by",
    "tokens",
    "version",
  ]);
});

for (const [label, expiry, expected] of [
  ["zero", 0, 100],
  ["negative", -1, -900],
  ["fraction", 0.5, 600],
  ["infinite", Infinity, undefined],
  ["NaN", NaN, undefined],
  ["string", "2", undefined],
] as const) {
  test(`publication preserves ${label} expires_in behavior`, async () => {
    const supplied = input({ tokens: { ...tokens, expires_in: expiry } as Publication["tokens"] });
    const result = await api.publishCanonicalCredentials(
      store({ saveMany: async () => {} }),
      prefix,
      supplied,
    );
    assert.equal(result.canonical.expires_at, expected);
    assert.equal(Object.hasOwn(result.canonical, "expires_at"), expected !== undefined);
  });
}

test("obtainedAt keeps zero and native nonfinite arithmetic; nullish time uses Date.now", async () => {
  const memory = store({ saveMany: async () => {} });
  const a = await api.publishCanonicalCredentials(
    memory,
    prefix,
    input({ obtainedAt: 0, tokens: { ...tokens, expires_in: 1 } }),
  );
  assert.equal(a.canonical.obtained_at, 0);
  assert.equal(a.canonical.expires_at, 1000);
  const b = await api.publishCanonicalCredentials(
    memory,
    prefix,
    input({ obtainedAt: Infinity, tokens: { ...tokens, expires_in: 1 } }),
  );
  assert.equal(b.canonical.expires_at, Infinity);
  assert.equal(JSON.parse(b.raw).expires_at, null);
  const before = Date.now();
  const c = await api.publishCanonicalCredentials(
    memory,
    prefix,
    input({ obtainedAt: null as unknown as number }),
  );
  assert.ok(c.canonical.obtained_at! >= before && c.canonical.obtained_at! <= Date.now());
});

test("publication keeps accessor and child serialization order without eager captures", async () => {
  const seen: string[] = [];
  const c = {
    ...client,
    toJSON() {
      seen.push("client.toJSON");
      return client;
    },
  };
  const t = {
    ...tokens,
    get expires_in() {
      seen.push("expires");
      return 2;
    },
    toJSON() {
      seen.push("tokens.toJSON");
      return tokens;
    },
  };
  const supplied = {
    get obtainedAt() {
      seen.push("obtained");
      return 100;
    },
    get tokens() {
      seen.push("tokens");
      return t;
    },
    get clientInformation() {
      seen.push("client");
      return c;
    },
    get issuer() {
      seen.push("issuer");
      return "owned";
    },
    get publishedBy() {
      seen.push("publisher");
      return "owner";
    },
  };
  const result = await api.publishCanonicalCredentials(
    store({
      saveMany: async () => {
        seen.push("save");
      },
    }),
    prefix,
    supplied,
  );
  assert.deepEqual(seen, [
    "obtained",
    "tokens",
    "expires",
    "tokens",
    "expires",
    "tokens",
    "expires",
    "client",
    "issuer",
    "issuer",
    "publisher",
    "tokens",
    "client.toJSON",
    "tokens.toJSON",
    "client",
    "client.toJSON",
    "tokens",
    "tokens.toJSON",
    "save",
  ]);
  assert.equal(result.canonical.client_information, c);
  assert.equal(result.canonical.tokens, t);
});

test("publication keeps serialization failure identity and never writes partial mirrors", async () => {
  const failure = { owned: "second client serialization" };
  let serializations = 0,
    saves = 0;
  const c = {
    ...client,
    toJSON() {
      if (++serializations === 2) throw failure;
      return client;
    },
  };
  await assert.rejects(
    api.publishCanonicalCredentials(
      store({
        saveMany: async () => {
          saves++;
        },
      }),
      prefix,
      input({ clientInformation: c }),
    ),
    (error) => error === failure,
  );
  assert.equal(serializations, 2);
  assert.equal(saves, 0);
  await assert.rejects(
    api.publishCanonicalCredentials(store(), prefix, {
      ...input(),
      get obtainedAt(): number | undefined {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
});

test("native toJSON undefined is passed as an own mirror value without substitution", async () => {
  const c = {
      ...client,
      toJSON() {
        return undefined;
      },
    },
    t = {
      ...tokens,
      toJSON() {
        return undefined;
      },
    };
  let batch: Readonly<Record<string, string>> | undefined;
  const result = await api.publishCanonicalCredentials(
    store({
      saveMany: async (value) => {
        batch = value;
      },
    }),
    prefix,
    input({ clientInformation: c, tokens: t }),
  );
  assert.ok(batch);
  assert.deepEqual(Object.keys(batch), keys);
  assert.equal(batch[keys[1]!], undefined);
  assert.equal(batch[keys[2]!], undefined);
  assert.equal(result.legacyClientRaw, undefined);
  assert.equal(result.legacyTokensRaw, undefined);
  assert.equal(Object.hasOwn(JSON.parse(result.raw), "client_information"), false);
  assert.equal(result.canonical.client_information, c);
});

test("publication store rejection propagates once after all raw values exist", async () => {
  const failure = { owned: "write rejected" };
  let calls = 0;
  await assert.rejects(
    api.publishCanonicalCredentials(
      store({
        saveMany: async (batch) => {
          calls++;
          assert.deepEqual(Object.keys(batch), keys);
          for (const value of Object.values(batch)) JSON.parse(value);
          throw failure;
        },
      }),
      prefix,
      input(),
    ),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

for (const scope of ["tokens", "all"] as const)
  test(`invalidation delegates one exact ${scope} CAS operation without rereading`, async () => {
    for (const accepted of [false, true]) {
      const calls: unknown[][] = [];
      const result = await api.invalidateCanonicalCredentials(
        store({
          deleteManyIfValue: async (...args) => {
            calls.push(args);
            return accepted;
          },
        }),
        prefix,
        " exact raw \n",
        scope,
      );
      assert.equal(result, accepted);
      assert.deepEqual(calls, [
        [
          canonicalKey,
          " exact raw \n",
          [canonicalKey, keys[2], ...(scope === "all" ? [keys[1]] : [])],
        ],
      ]);
    }
  });

test("CAS failure preserves the original rejection without fallback deletion", async () => {
  const failure = { owned: "CAS rejected" };
  await assert.rejects(
    api.invalidateCanonicalCredentials(
      store({
        deleteManyIfValue: async () => {
          throw failure;
        },
      }),
      prefix,
      "owned-raw",
      "all",
    ),
    (error) => error === failure,
  );
});
