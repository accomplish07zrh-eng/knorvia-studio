// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  failNextWrite,
  getPersistenceState,
  resetPersistenceState,
} from "../harness/seam-controls.mjs";
import { authModule, caseTemp, ensureCaseTemp, identityCipher } from "../harness/test-context.mjs";

async function assertPending(promise) {
  const pending = Symbol("pending");
  assert.equal(
    await Promise.race([promise.then(() => "settled"), Promise.resolve(pending)]),
    pending,
  );
}

test(
  "A-STO-11 same-path listeners snapshot, run concurrently, await, isolate, and unsubscribe",
  { timeout: 10000 },
  async () => {
    await ensureCaseTemp();
    resetPersistenceState();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("listeners", "credentials.json");
    const otherPath = caseTemp("listeners", "other.json");
    const first = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    const same = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    const other = createSharedKnorviaCredentialStore({
      filePath: otherPath,
      cipher: identityCipher(),
      env: {},
    });
    assert.equal(typeof first.onDidChange, "function");
    const starts = [];
    const observations = [];
    const secondStarted = Promise.withResolvers();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let unsubscribeSecond = () => {};
    const unsubscribeFirst = first.onDidChange(async () => {
      starts.push("first");
      const events = getPersistenceState().events;
      observations.push(events.at(-1)?.type);
      unsubscribeSecond();
      await gate;
      throw new Error("listener rejection must be swallowed");
    });
    unsubscribeSecond = same.onDidChange(async () => {
      starts.push("second");
      secondStarted.resolve();
      await gate;
    });
    let otherCalls = 0;
    const unsubscribeOther = other.onDidChange(() => {
      otherCalls += 1;
    });
    const saving = first.save("key", "value");
    // 等监听器自己的启动信号，沿用 case 超时；不把磁盘调度耗时误判为业务失败。
    await Promise.race([
      secondStarted.promise,
      saving.then(() => assert.fail("mutation settled before both listeners started")),
    ]);
    await assertPending(saving);
    assert.deepEqual(new Set(starts), new Set(["first", "second"]));
    assert.deepEqual(observations, ["lock:released"]);
    assert.equal(otherCalls, 0);
    release();
    await saving;

    starts.length = 0;
    await first.save("next", "value");
    assert.deepEqual(starts, ["first"]);
    unsubscribeFirst();
    await first.save("after-unsubscribe", "value");
    assert.deepEqual(starts, ["first"]);
    await other.save("other", "value");
    assert.equal(otherCalls, 1);
    unsubscribeOther();
    await other.save("after-unsubscribe", "value");
    assert.equal(otherCalls, 1);

    let noOpNotifications = 0;
    first.onDidChange(() => {
      noOpNotifications += 1;
    });
    await first.delete("missing");
    await first.deleteIfValue("key", "wrong");
    await first.deleteManyIfValue("key", "wrong", []);
    assert.equal(noOpNotifications, 3);
    await first.deleteIfValues({});
    assert.equal(noOpNotifications, 3);
    failNextWrite();
    await assert.rejects(first.save("will-fail", "value"), /owned atomic write failure/);
    assert.equal(noOpNotifications, 3);
  },
);
