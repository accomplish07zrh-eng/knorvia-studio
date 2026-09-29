// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { harness, store, deferred, type Pending } from "./mcp-lease-provider.fixture.js";
const pending: Pending = {
  attemptId: "owned-attempt",
  authorizationUrl: "https://example.invalid/auth",
  expiresAt: 200,
  state: "owned-state",
};
const raw = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    attempt_id: "owned-attempt",
    authorization_url: "https://example.invalid/auth",
    expires_at: 200,
    state: "owned-state",
    ...extra,
  });

for (const baseline of [undefined, "", "owned-generation", null] as const) {
  test("pending publication keeps undefined-only omission: " + String(baseline), async (t) => {
    const { lease } = await harness(t);
    const calls: unknown[][] = [];
    const port = store({
      async save(...args) {
        calls.push(args);
      },
    });
    const input = { ...pending, baselineGeneration: baseline } as Pending;
    assert.equal(await lease.publishPendingAuthorization(port, "owned", input), undefined);
    const expected = {
      attempt_id: pending.attemptId,
      authorization_url: pending.authorizationUrl,
      ...(baseline === undefined ? {} : { baseline_generation: baseline }),
      expires_at: 200,
      state: pending.state,
    };
    assert.deepEqual(calls, [["owned:pending_authorization", JSON.stringify(expected)]]);
    assert.equal(input.baselineGeneration, baseline);
  });
}
test("publication preserves projection then method then key then serialization order", async (t) => {
  const { lease, ports } = await harness(t);
  const trace: string[] = [];
  const input = {} as Pending;
  const values = {
    ...pending,
    baselineGeneration: "g",
    attemptId: {
      toJSON() {
        trace.push("serialize");
        return pending.attemptId;
      },
    },
  };
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(input, key, {
      get() {
        trace.push(key);
        return value;
      },
    });
  const port = store();
  Object.defineProperty(port, "save", {
    get() {
      trace.push("method");
      return async function (this: unknown, key: string, value: string) {
        assert.equal(this, port);
        trace.push("save");
        assert.equal(key, "owned:pending_authorization");
        assert.equal(JSON.parse(value).attempt_id, pending.attemptId);
      };
    },
  });
  const keyFn = ports.mcpOAuthCredentialKey;
  ports.mcpOAuthCredentialKey = (...args) => {
    trace.push("key");
    return keyFn(...args);
  };
  await lease.publishPendingAuthorization(port, "owned", input);
  assert.deepEqual(trace, [
    "attemptId",
    "authorizationUrl",
    "baselineGeneration",
    "baselineGeneration",
    "expiresAt",
    "state",
    "method",
    "key",
    "serialize",
    "save",
  ]);
});
test("publication uses native serialization and does not write when it fails", async (t) => {
  const { lease } = await harness(t);
  const marker = new Error("owned serialization failure");
  const input = {
    ...pending,
    attemptId: {
      toJSON() {
        throw marker;
      },
    },
  } as unknown as Pending;
  await assert.rejects(
    lease.publishPendingAuthorization(store(), "owned", input),
    (e) => e === marker,
  );
  const values: string[] = [];
  await lease.publishPendingAuthorization(
    store({
      async save(_key, value) {
        values.push(value);
      },
    }),
    "owned",
    { ...pending, expiresAt: Infinity },
  );
  assert.equal(JSON.parse(values[0]!).expires_at, null);
});
test("publication awaits the single save and preserves rejection", async (t) => {
  const { lease } = await harness(t);
  const gate = deferred<void>();
  let count = 0,
    settled = false;
  const result = lease
    .publishPendingAuthorization(
      store({
        save() {
          count++;
          return gate.promise;
        },
      }),
      "owned",
      pending,
    )
    .finally(() => {
      settled = true;
    });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(count, 1);
  const marker = new Error("owned save failure");
  gate.reject(marker);
  await assert.rejects(result, (e) => e === marker);
});
for (const [label, value] of [
  ["null", null],
  ["empty", ""],
  ["bad JSON", "{"],
  ["array", "[]"],
  ["primitive", "1"],
  ["wrong attempt", raw({ attempt_id: 1 })],
  ["wrong URL", raw({ authorization_url: null })],
  ["wrong state", raw({ state: false })],
  ["wrong expiry", raw({ expires_at: "200" })],
  ["expired", raw({ expires_at: 99 })],
  ["equal", raw({ expires_at: 100 })],
] as const) {
  test("pending read miss: " + label, async (t) => {
    const { lease } = await harness(t);
    const calls: string[] = [];
    const valueRead = await lease.loadPendingAuthorization(
      store({
        async load(key) {
          calls.push(key);
          return value;
        },
      }),
      "owned",
      100,
    );
    assert.equal(valueRead, undefined);
    assert.deepEqual(calls, ["owned:pending_authorization"]);
  });
}
test("pending read accepts empty required strings and only string baseline", async (t) => {
  const { lease } = await harness(t);
  for (const baseline of ["", "g", 0, null]) {
    const result = await lease.loadPendingAuthorization(
      store({
        async load() {
          return raw({
            attempt_id: "",
            authorization_url: "",
            state: "",
            baseline_generation: baseline,
            extra: true,
          });
        },
      }),
      "owned",
      100,
    );
    assert.deepEqual(result, {
      attemptId: "",
      authorizationUrl: "",
      ...(typeof baseline === "string" ? { baselineGeneration: baseline } : {}),
      expiresAt: 200,
      state: "",
    });
    assert.deepEqual(Object.keys(result!), [
      "attemptId",
      "authorizationUrl",
      ...(typeof baseline === "string" ? ["baselineGeneration"] : []),
      "expiresAt",
      "state",
    ]);
  }
});
test("pending read keeps ordinary numeric comparison and default clock at entry", async (t) => {
  const { lease } = await harness(t);
  const overflow = raw().replace('"expires_at":200', '"expires_at":1e400');
  assert.equal(
    (
      await lease.loadPendingAuthorization(
        store({
          async load() {
            return overflow;
          },
        }),
        "owned",
        1,
      )
    )?.expiresAt,
    Infinity,
  );
  assert.ok(
    await lease.loadPendingAuthorization(
      store({
        async load() {
          return raw({ expires_at: -2 });
        },
      }),
      "owned",
      NaN,
    ),
  );
  const before = Date.now();
  const future = await lease.loadPendingAuthorization(
    store({
      async load() {
        return raw({ expires_at: before + 60_000 });
      },
    }),
    "owned",
  );
  assert.ok(future);
  assert.equal(
    await lease.loadPendingAuthorization(
      store({
        async load() {
          return raw({ expires_at: before - 60_000 });
        },
      }),
      "owned",
    ),
    undefined,
  );
  const gate = deferred<string | null>();
  let expiresAt = 0;
  const delayed = lease.loadPendingAuthorization(
    store({
      load() {
        expiresAt = Date.now() + 1;
        return gate.promise;
      },
    }),
    "owned",
  );
  await sleep(10);
  assert.ok(Date.now() > expiresAt);
  gate.resolve(raw({ expires_at: expiresAt }));
  assert.ok(await delayed, "default clock was sampled before pending IO");
});
for (const [label, value, attempt, expectedCAS] of [
  ["missing", null, "a", false],
  ["malformed", "{", "a", true],
  ["minimal matching", ' { "attempt_id" : "a" } ', "a", true],
  ["foreign", '{"attempt_id":"b"}', "a", false],
  ["null", "null", "a", false],
  ["array", "[]", undefined, false],
] as const) {
  test("pending exact-raw cleanup: " + label, async (t) => {
    const { lease } = await harness(t);
    const calls: unknown[][] = [];
    const port = store({
      async load(key) {
        calls.push(["load", key]);
        return value;
      },
      async deleteIfValue(key, expected) {
        calls.push(["cas", key, expected]);
        return true;
      },
    });
    const result = await lease.deletePendingAuthorizationIfOwned(port, "owned", attempt as string);
    assert.equal(result, expectedCAS);
    assert.deepEqual(calls, [
      ["load", "owned:pending_authorization"],
      ...(expectedCAS ? [["cas", "owned:pending_authorization", value]] : []),
    ]);
  });
}
test("old cleaner cannot delete the new publication after its read", async (t) => {
  const { lease } = await harness(t);
  let persisted = raw();
  let compares = 0;
  const port = store({
    async load() {
      const read = persisted;
      persisted = raw({ attempt_id: "new-owner" });
      return read;
    },
    async deleteIfValue(_key, value) {
      compares++;
      if (value !== persisted) return false;
      persisted = "";
      return true;
    },
  });
  assert.equal(
    await lease.deletePendingAuthorizationIfOwned(port, "owned", pending.attemptId),
    false,
  );
  assert.equal(compares, 1);
  assert.equal(JSON.parse(persisted).attempt_id, "new-owner");
});
for (const operation of ["load", "cleanup load", "cleanup CAS"] as const) {
  test("pending failure identity: " + operation, async (t) => {
    const { lease } = await harness(t);
    const marker = new Error("owned store error");
    const port = store({
      async load() {
        if (operation !== "cleanup CAS") throw marker;
        return "{";
      },
      async deleteIfValue() {
        throw marker;
      },
    });
    await assert.rejects(
      operation === "load"
        ? lease.loadPendingAuthorization(port, "owned", 100)
        : lease.deletePendingAuthorizationIfOwned(port, "owned", "a"),
      (e) => e === marker,
    );
  });
}
