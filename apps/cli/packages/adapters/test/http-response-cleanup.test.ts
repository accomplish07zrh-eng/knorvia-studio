// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  observe,
  open,
  portError,
  readResponseBody,
  rejection,
  response,
  scripted,
  signal,
  turn,
  url,
} from "./http-response.fixture.js";

for (const branch of ["negative", "declared", "actual"] as const) {
  for (const cleanup of ["pending", "rejected", "throwing", "resolved"] as const) {
    test(`${branch} oversize settles before ${cleanup} native producer cleanup`, async () => {
      const finish = Promise.withResolvers<void>();
      const fixture = open(() => {
        if (cleanup === "pending") return finish.promise;
        if (cleanup === "rejected") return Promise.reject(new Error("owned cleanup rejection"));
        if (cleanup === "throwing") throw new Error("owned cleanup throw");
      });
      if (branch === "actual") fixture.controller.enqueue(new Uint8Array([1, 2]));
      const value = response(fixture.body, branch === "declared" ? "9" : undefined);
      const observed = observe(
        readResponseBody(value, branch === "negative" ? -1 : 1, signal(), url),
      );
      await turn();
      const beforeCleanup = {
        settled: observed.state.settled,
        locked: fixture.body.locked,
        cancels: [...fixture.calls],
      };
      finish.resolve();
      fixture.controller.error(new Error("owned producer release"));
      await observed.done;
      assert.equal(beforeCleanup.settled, true);
      assert.equal(beforeCleanup.locked, false);
      assert.deepEqual(beforeCleanup.cancels, [undefined]);
      assert.ok(observed.state.outcome && !observed.state.outcome.ok);
      portError(
        observed.state.outcome.error,
        "too_large",
        branch === "negative"
          ? "HTTP response size limit must not be negative"
          : branch === "declared"
            ? "HTTP response is too large: content-length=9, max=1"
            : "HTTP response is too large: bytes>1",
      );
    });
  }
}
test("native size rejection precedes already cancelled signal while cleaning owned body", async () => {
  const fixture = open();
  const abort = new AbortController();
  abort.abort();
  const error = await rejection(
    readResponseBody(response(fixture.body, "9"), 1, abort.signal, url),
  );
  fixture.controller.error(new Error("owned producer release"));
  portError(error, "too_large", "HTTP response is too large: content-length=9, max=1");
  assert.deepEqual(fixture.calls, [undefined]);
  assert.equal(fixture.body.locked, false);
});
for (const primary of [new Error("owned failure"), undefined, null, "owned failure"]) {
  test(`structured reader preserves ${String(primary)} while release throws`, async () => {
    const fixture = scripted({
      read: () => Promise.reject(primary),
      release: () => {
        throw new Error("owned release failure");
      },
    });
    const abort = new AbortController();
    assert.equal(
      await rejection(readResponseBody(fixture.response, 1, abort.signal, url)),
      primary,
    );
    assert.equal(fixture.state.releases, 1);
    assert.equal(fixture.state.cancels, 0);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  });
}
test("successful structured reader surfaces its release failure", async () => {
  const failure = new Error("owned successful-release failure");
  const fixture = scripted({
    release: () => {
      throw failure;
    },
  });
  const abort = new AbortController();
  assert.equal(await rejection(readResponseBody(fixture.response, 1, abort.signal, url)), failure);
  assert.equal(fixture.state.releases, 1);
  assert.equal(fixture.state.cancels, 0);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("synchronous structured read throw also releases its owned lock", async () => {
  const fixture = scripted({
    read: () => {
      throw undefined;
    },
  });
  assert.equal(await rejection(readResponseBody(fixture.response, 1, signal(), url)), undefined);
  assert.equal(fixture.state.releases, 1);
  assert.equal(fixture.state.cancels, 0);
});
test("synchronous structured cancel throw cannot replace an actual-size failure", async () => {
  const fixture = scripted({
    read: async () => ({ done: false, value: new Uint8Array([1, 2]) }),
    cancel: () => {
      throw new Error("owned cancel failure");
    },
    release: () => {
      throw new Error("owned release failure");
    },
  });
  portError(
    await rejection(readResponseBody(fixture.response, 1, signal(), url)),
    "too_large",
    "HTTP response is too large: bytes>1",
  );
  assert.equal(fixture.state.reads, 1);
  assert.equal(fixture.state.releases, 1);
  assert.deepEqual(fixture.state.reasons, [[]]);
});
test("cleanup re-entry cannot replace an already chosen size error", async () => {
  const abort = new AbortController();
  const fixture = scripted({
    read: async () => ({ done: false, value: new Uint8Array([1, 2]) }),
    cancel: () => {
      abort.abort(new Error("cleanup re-entry"));
      return Promise.resolve();
    },
  });
  portError(
    await rejection(readResponseBody(fixture.response, 1, abort.signal, url)),
    "too_large",
    "HTTP response is too large: bytes>1",
  );
  assert.equal(fixture.state.reads, 1);
  assert.equal(fixture.state.cancels, 1);
  assert.equal(fixture.state.releases, 1);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
test("late structured read and cleanup rejections are observed after cancellation settles", async () => {
  const pending = Promise.withResolvers<ReadableStreamReadResult<Uint8Array>>();
  const cleanup = Promise.withResolvers<void>();
  const fixture = scripted({ read: () => pending.promise, cancel: () => cleanup.promise });
  const abort = new AbortController();
  const observed = observe(readResponseBody(fixture.response, 1, abort.signal, url));
  abort.abort();
  await turn();
  const settledAtAbort = observed.state.settled;
  // 先让旧实现的 read 退出，避免对未调用的 cancel Promise 人为制造未处理拒绝。
  pending.reject(new Error("owned late read"));
  if (fixture.state.cancels) cleanup.reject(new Error("owned late cleanup"));
  else cleanup.resolve();
  await observed.done;
  await turn();
  assert.equal(settledAtAbort, true);
  assert.ok(observed.state.outcome && !observed.state.outcome.ok);
  portError(
    observed.state.outcome.error,
    "cancelled",
    "HTTP request was cancelled while reading response body",
  );
  assert.equal(fixture.state.reads, 1);
  assert.equal(fixture.state.cancels, 1);
  assert.equal(fixture.state.releases, 1);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
});
