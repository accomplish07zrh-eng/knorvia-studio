// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { gate } from "../../core/test/tool-invocation-fixture.js";
import { V4InteractionRegistry } from "../src/protocol-v4/interaction-registry.js";
import { prepareClientRequestWithV4Interaction } from "../src/protocol/interaction-response-race.js";
import type { KnorviaProtocolAgentServerContext } from "../src/protocol/server-types.js";

function fixture() {
  const v4Interactions = new V4InteractionRegistry();
  return {
    registry: v4Interactions,
    context: { v4Interactions } as KnorviaProtocolAgentServerContext,
  };
}

test("a cold protocol request routes an immediate V4 answer and never opens legacy UI afterward", async () => {
  const f = fixture();
  let starts = 0;
  const handle = prepareClientRequestWithV4Interaction(
    f.context,
    "fixture",
    undefined,
    () => {
      starts++;
      return new Promise<string>(() => {});
    },
    (answer) => answer.freeText ?? "empty",
  );
  assert.equal(f.registry.has("fixture"), true);
  assert.equal(starts, 0);
  f.registry.resolve("fixture", { freeText: "answer" });
  assert.equal(await handle.result, "answer");
  handle.activate();
  assert.equal(starts, 0);
});

test("V4 and cancellation terminate without waiting for an uncooperative legacy request", async () => {
  for (const abort of [false, true]) {
    const f = fixture(),
      parent = new AbortController();
    let signal: AbortSignal | undefined;
    const handle = prepareClientRequestWithV4Interaction(
      f.context,
      "fixture",
      parent.signal,
      (child) => {
        signal = child;
        return new Promise<string>(() => {});
      },
      (answer) => answer.freeText ?? "empty",
    );
    handle.activate();
    if (abort) {
      parent.abort();
      await assert.rejects(handle.result, { code: -32021 });
    } else {
      f.registry.resolve("fixture", { freeText: "answer" });
      assert.equal(await handle.result, "answer");
    }
    assert.equal(signal?.aborted, true);
    assert.equal(f.registry.has("fixture"), false);
  }
});

test("disposing an old handle cannot unregister a newer request with the same ID", async () => {
  const f = fixture();
  const prepare = () =>
    prepareClientRequestWithV4Interaction(
      f.context,
      "fixture",
      undefined,
      async () => "rpc",
      (answer) => answer.freeText ?? "v4",
    );
  const old = prepare(),
    current = prepare();
  old.dispose();
  await assert.rejects(old.result);
  assert.equal(f.registry.has("fixture"), true);
  f.registry.resolve("fixture", { freeText: "current" });
  assert.equal(await current.result, "current");
});

test("answer projection failure releases the same registration and returns its original error", async () => {
  const f = fixture(),
    failure = { fixture: "map failed" };
  const handle = prepareClientRequestWithV4Interaction(
    f.context,
    "fixture",
    undefined,
    async () => "rpc",
    () => {
      throw failure;
    },
  );
  f.registry.resolve("fixture", { optionId: "allowOnce" });
  await assert.rejects(handle.result, (error) => error === failure);
  assert.equal(f.registry.has("fixture"), false);
});

test("a failed full-access commit retains the same request for a successful retry", async () => {
  const f = fixture();
  let attempts = 0,
    settled = false;
  const handle = prepareClientRequestWithV4Interaction(
    f.context,
    "fixture",
    undefined,
    () => new Promise<string>(() => {}),
    (answer) => answer.optionId ?? "empty",
    {
      sessionId: "session",
      kind: "other",
      fullAccess: async () => {
        if (++attempts === 1) throw new Error("commit failed");
      },
    },
  );
  void handle.result.then(() => {
    settled = true;
  });
  handle.activate();
  await assert.rejects(f.registry.resolveFullAccess("fixture", "session"), /commit failed/);
  assert.equal(f.registry.has("fixture"), true);
  assert.equal(settled, false);
  assert.equal(await f.registry.resolveFullAccess("fixture", "session"), true);
  assert.equal(await handle.result, "allowOnce");
});

test("legacy completion waits while full-access commit owns the user decision", async () => {
  const f = fixture(),
    commit = gate(),
    rpc = gate<string>();
  let settled = false;
  const handle = prepareClientRequestWithV4Interaction(
    f.context,
    "fixture",
    undefined,
    () => rpc.promise,
    (answer) => answer.optionId ?? "empty",
    {
      sessionId: "session",
      kind: "other",
      fullAccess: () => commit.promise,
    },
  );
  void handle.result.then(() => {
    settled = true;
  });
  handle.activate();
  const approved = f.registry.resolveFullAccess("fixture", "session");
  rpc.resolve("late rpc");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  commit.resolve();
  await approved;
  assert.equal(await handle.result, "allowOnce");
});

test("superseded prepared protocol handles cannot notify or retain the old RPC", async () => {
  for (const active of [false, true]) {
    const f = fixture();
    let starts = 0;
    let oldSignal: AbortSignal | undefined;
    const old = prepareClientRequestWithV4Interaction(
      f.context,
      "fixture",
      undefined,
      (signal) => {
        starts++;
        oldSignal = signal;
        return new Promise<string>(() => {});
      },
      (answer) => answer.freeText ?? "old",
    );
    if (active) old.activate();
    const current = prepareClientRequestWithV4Interaction(
      f.context,
      "fixture",
      undefined,
      async () => "current",
      (answer) => answer.freeText ?? "current",
    );
    try {
      assert.equal(old.activate(), false);
      await assert.rejects(old.result, { code: -32021 });
      assert.equal(starts, active ? 1 : 0);
      if (active) assert.equal(oldSignal?.aborted, true);
      assert.equal(f.registry.has("fixture"), true);
      f.registry.resolve("fixture", { freeText: "new answer" });
      assert.equal(await current.result, "new answer");
    } finally {
      old.dispose();
      current.dispose();
    }
  }
});
