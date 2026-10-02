import assert from "node:assert/strict";
import test from "node:test";
import {
  createHostCapabilityStore,
  DEFAULT_HOST_CAPABILITY_TTL_MS,
} from "../src/hostCapability.ts";

test("host capability remains single-use and expires at the exact boundary", () => {
  let now = 100;
  let sequence = 0;
  const store = createHostCapabilityStore({
    ttlMs: 20,
    now: () => now,
    createCapability: () => `synthetic-${++sequence}`,
  });
  const first = store.issue();
  assert.deepEqual(first, { capability: "synthetic-1", expiresAt: 120 });
  now = 119;
  assert.equal(store.consume(first.capability), true);
  assert.equal(store.consume(first.capability), false);
  const second = store.issue();
  now = 139;
  assert.equal(store.consume(second.capability), false);
  now = 100;
  assert.equal(store.consume(second.capability), false, "expired token stays deleted");
});

test("stores are isolated and falsy credentials do not consult the clock", () => {
  let reads = 0;
  const left = createHostCapabilityStore({
    now: () => {
      reads++;
      return 0;
    },
    createCapability: () => "synthetic-isolated",
  });
  const right = createHostCapabilityStore();
  assert.equal(left.consume(undefined), false);
  assert.equal(left.consume(""), false);
  assert.equal(reads, 0);
  const token = left.issue();
  assert.equal(right.consume(token.capability), false);
  assert.equal(left.consume(token.capability), true);
});

test("default token policy keeps 32 random bytes and a thirty-second TTL", () => {
  assert.equal(DEFAULT_HOST_CAPABILITY_TTL_MS, 30_000);
  const store = createHostCapabilityStore({ now: () => 17 });
  const issued = store.issue();
  assert.match(issued.capability, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(issued.capability, "base64url").length, 32);
  assert.equal(issued.expiresAt, 30_017);
  assert.equal(store.consume(issued.capability), true);
  assert.equal(store.consume(issued.capability), false);
});
