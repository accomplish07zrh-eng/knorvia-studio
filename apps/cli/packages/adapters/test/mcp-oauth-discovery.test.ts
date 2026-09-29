// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/client";
import type { SharedKnorviaCredentialStore } from "../src/auth/shared-credentials.js";
import { shared } from "./mcp-oauth-boundaries.fixture.js";

const prefix = "owned-discovery";
const stateKey = "owned-discovery:discovery_state";
const fetchedKey = "owned-discovery:discovery_state_fetched_at";
const state = { authorizationServerUrl: "https://owned.example/issuer", extra: { value: 3 } };
const { saveDiscoveryRecord: save, loadDiscoveryRecord: load } = shared;

function memoryStore(snapshot: Record<string, unknown> = {}) {
  const loads: string[][] = [];
  const saves: Record<string, unknown>[] = [];
  const unexpected = async () => {
    throw new Error("unexpected credential operation");
  };
  const store: SharedKnorviaCredentialStore = {
    filePath: "owned-memory-only",
    delete: unexpected,
    deleteIfValue: unexpected,
    deleteIfValues: unexpected,
    deleteManyIfValue: unexpected,
    load: unexpected,
    save: unexpected,
    saveReplacing: unexpected,
    async loadMany(keys) {
      loads.push([...keys]);
      return snapshot as Record<string, string | null>;
    },
    async saveMany(entries) {
      saves.push({ ...entries });
      Object.assign(snapshot, entries);
    },
  };
  return { store, snapshot, loads, saves };
}

function cached(value: unknown, timestamp: unknown = "100") {
  return memoryStore({ [stateKey]: JSON.stringify(value), [fetchedKey]: timestamp });
}

test("MCP discovery exposes only async save and load with compatible arities", () => {
  assert.deepEqual(Object.keys(shared), ["loadDiscoveryRecord", "saveDiscoveryRecord"]);
  assert.equal(save.length, 3);
  assert.equal(load.length, 2);
});

test("MCP discovery saves raw JSON and timestamp in one ordered batch", async () => {
  const m = memoryStore();
  const input = Object.freeze({ ...state });
  assert.equal(await save(m.store, prefix, input, 123.5), undefined);
  assert.equal(m.saves.length, 1);
  assert.deepEqual(Object.keys(m.saves[0]!), [stateKey, fetchedKey]);
  assert.deepEqual(m.saves[0], { [stateKey]: JSON.stringify(input), [fetchedKey]: "123.5" });
  assert.equal(m.loads.length, 0);
});

test("MCP discovery awaits the one store write and discards its return value", async () => {
  const m = memoryStore();
  const gate = Promise.withResolvers<void>();
  let entered = 0;
  m.store.saveMany = async () => {
    entered++;
    await gate.promise;
    return 42 as unknown as void;
  };
  let settled = false;
  const pending = save(m.store, prefix, state, 1).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(entered, 1);
  assert.equal(settled, false);
  gate.resolve();
  assert.equal(await pending, undefined);
});

test("MCP discovery save samples the default clock once", async (t) => {
  let reads = 0;
  t.mock.method(Date, "now", () => {
    reads++;
    return 87;
  });
  const m = memoryStore();
  await save(m.store, prefix, state);
  assert.equal(reads, 1);
  assert.equal(m.saves[0]?.[fetchedKey], "87");
});

test("MCP discovery save preserves serialization and store rejection identity", async () => {
  const m = memoryStore();
  const serialization = new Error("owned serialization");
  await assert.rejects(
    save(
      m.store,
      prefix,
      {
        authorizationServerUrl: "s",
        toJSON() {
          throw serialization;
        },
      } as OAuthDiscoveryState,
      1,
    ),
    (error) => error === serialization,
  );
  assert.equal(m.saves.length, 0);
  const rejection = { owned: "store failure" };
  m.store.saveMany = async () => {
    throw rejection;
  };
  await assert.rejects(save(m.store, prefix, state, 1), (error) => error === rejection);
});

test("MCP discovery save forwards undefined serialization as an own value", async () => {
  const m = memoryStore();
  const input = { authorizationServerUrl: "s", toJSON: () => undefined };
  await save(m.store, prefix, input, 5);
  assert.equal(m.saves.length, 1);
  assert.equal(Object.hasOwn(m.saves[0]!, stateKey), true);
  assert.equal(m.saves[0]?.[stateKey], undefined);
  assert.equal(m.saves[0]?.[fetchedKey], "5");
});

test("MCP discovery load uses one ordered snapshot and preserves opaque fields", async () => {
  const m = cached(state);
  assert.deepEqual(await load(m.store, prefix, { now: 150, ttlMs: 100 }), state);
  assert.deepEqual(m.loads, [[stateKey, fetchedKey]]);
  assert.equal(m.saves.length, 0);
  assert.deepEqual(m.snapshot, { [stateKey]: JSON.stringify(state), [fetchedKey]: "100" });
});

test("MCP discovery samples now before waiting for the store snapshot", async (t) => {
  const m = cached(state);
  const gate = Promise.withResolvers<Record<string, string | null>>();
  const events: string[] = [];
  let now = 150;
  t.mock.method(Date, "now", () => {
    events.push("clock");
    return now;
  });
  m.store.loadMany = () => {
    events.push("load");
    return gate.promise;
  };
  const pending = load(m.store, prefix, { ttlMs: 100 });
  assert.deepEqual(events, ["clock", "load"]);
  now = 9000;
  gate.resolve(m.snapshot as Record<string, string | null>);
  assert.deepEqual(await pending, state);
});

test("MCP discovery explicit now avoids the default clock and keeps TTL equality", async (t) => {
  t.mock.method(Date, "now", () => assert.fail("explicit clock must win"));
  const m = cached(state);
  assert.deepEqual(await load(m.store, prefix, { now: 199, ttlMs: 100 }), state);
  assert.equal(await load(m.store, prefix, { now: 200, ttlMs: 100 }), undefined);
  assert.equal(m.saves.length, 0);
});

test("MCP discovery keeps one-day default TTL without evicting a miss", async () => {
  const m = cached(state, "0");
  assert.deepEqual(await load(m.store, prefix, { now: 86_399_999 }), state);
  assert.equal(await load(m.store, prefix, { now: 86_400_000 }), undefined);
  assert.equal(m.saves.length, 0);
  assert.equal(m.snapshot[stateKey], JSON.stringify(state));
});

for (const [label, timestamp, now, ttlMs, accepted] of [
  ["future", "200", 100, 50, true],
  ["missing", undefined, 1, 10, false],
  ["null near epoch", null, 1, 10, true],
  ["empty near epoch", "", 1, 10, true],
  ["non-number", "later", 1, 10, false],
  ["infinite timestamp", "Infinity", 1, 10, false],
  ["zero TTL", "100", 100, 0, false],
  ["negative TTL", "100", 100, -1, false],
  ["NaN now", "100", NaN, 100, true],
  ["NaN TTL", "100", 150, NaN, true],
] as const) {
  test(`MCP discovery preserves native timestamp behavior: ${label}`, async () => {
    const m = cached(state, timestamp);
    // Undefined must be represented as a missing property, not the helper's default argument.
    if (timestamp === undefined) delete m.snapshot[fetchedKey];
    const result = await load(m.store, prefix, { now, ttlMs });
    assert.deepEqual(result, accepted ? state : undefined);
  });
}

test("MCP discovery nullish time options use defaults, zero remains explicit", async (t) => {
  t.mock.method(Date, "now", () => 1);
  const m = cached(state, "0");
  assert.deepEqual(
    await load(m.store, prefix, { now: null, ttlMs: null } as unknown as Parameters<
      typeof load
    >[2]),
    state,
  );
  assert.equal(await load(m.store, prefix, { now: 0, ttlMs: 0 }), undefined);
});

for (const [label, raw] of [
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
  ["bad JSON", "{"],
  ["JSON null", "null"],
  ["array", "[]"],
  ["string", '"value"'],
  ["absent URL", "{}"],
  ["numeric URL", '{"authorizationServerUrl":17}'],
] as const) {
  test(`MCP discovery misses ${label} state without writes`, async () => {
    const m = memoryStore({ [stateKey]: raw, [fetchedKey]: "100" });
    assert.equal(await load(m.store, prefix, { now: 150 }), undefined);
    assert.equal(m.loads.length, 1);
    assert.equal(m.saves.length, 0);
  });
}

test("MCP discovery keeps empty authorization URL when no issuer is expected", async () => {
  const value = { authorizationServerUrl: "", extra: 7 };
  const m = cached(value);
  assert.deepEqual(await load(m.store, prefix, { now: 101 }), value);
  assert.deepEqual(await load(m.store, prefix, { now: 101, expectedIssuer: "" }), value);
});

for (const [label, issuer, expected, accepted] of [
  ["same", "https://owned.example", "https://owned.example", true],
  ["one slash", "https://owned.example/", "https://owned.example", true],
  ["expected slash", "https://owned.example", "https://owned.example/", true],
  ["two slashes", "https://owned.example//", "https://owned.example", false],
  ["case is literal", "https://OWNED.example", "https://owned.example", false],
  ["space is literal", " https://owned.example", "https://owned.example", false],
  ["raw slash", "/", "/", true],
  ["raw empty", "", "/", false],
  ["raw double slash", "//", "/", false],
] as const) {
  test(`MCP discovery issuer comparison preserves ${label}`, async () => {
    const value = { authorizationServerUrl: "fallback", authorizationServerMetadata: { issuer } };
    const m = cached(value);
    assert.deepEqual(
      await load(m.store, prefix, { now: 101, expectedIssuer: expected }),
      accepted ? value : undefined,
    );
    assert.equal(m.saves.length, 0);
  });
}

test("MCP discovery nullish metadata issuer falls back, empty issuer does not", async () => {
  for (const metadata of [undefined, null, {}, { issuer: null }]) {
    const value = { ...state, authorizationServerMetadata: metadata };
    const m = cached(value);
    assert.deepEqual(
      await load(m.store, prefix, { now: 101, expectedIssuer: state.authorizationServerUrl }),
      JSON.parse(JSON.stringify(value)),
    );
  }
  assert.equal(
    await load(cached({ ...state, authorizationServerMetadata: { issuer: "" } }).store, prefix, {
      now: 101,
      expectedIssuer: state.authorizationServerUrl,
    }),
    undefined,
  );
});

test("MCP discovery rejects selected non-string issuer only when comparison is requested", async () => {
  for (const issuer of [17, true, [], { value: "issuer" }]) {
    const value = { ...state, authorizationServerMetadata: { issuer } };
    const m = cached(value);
    assert.deepEqual(await load(m.store, prefix, { now: 101 }), value);
    assert.equal(
      await load(m.store, prefix, { now: 101, expectedIssuer: state.authorizationServerUrl }),
      undefined,
    );
  }
});

test("MCP discovery load propagates store rejection and timestamp conversion failure", async () => {
  const m = cached(state);
  const rejection = new Error("owned store failure");
  m.store.loadMany = async () => {
    throw rejection;
  };
  await assert.rejects(load(m.store, prefix, { now: 101 }), (error) => error === rejection);
  const timestamp = {
    [Symbol.toPrimitive]() {
      throw rejection;
    },
  };
  await assert.rejects(
    load(cached(state, timestamp).store, prefix, { now: 101 }),
    (error) => error === rejection,
  );
});

test("MCP discovery does not retain cross-call or cross-prefix cache state", async () => {
  const m = cached(state);
  assert.deepEqual(await load(m.store, prefix, { now: 101 }), state);
  m.snapshot[stateKey] = JSON.stringify({ authorizationServerUrl: "changed" });
  assert.deepEqual(await load(m.store, prefix, { now: 101 }), {
    authorizationServerUrl: "changed",
  });
  await save(m.store, "other", state, 9);
  assert.deepEqual(Object.keys(m.saves[0]!), [
    "other:discovery_state",
    "other:discovery_state_fetched_at",
  ]);
  assert.equal(m.loads.length, 2);
});
