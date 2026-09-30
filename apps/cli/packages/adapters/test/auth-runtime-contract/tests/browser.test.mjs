// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { authModule, publicFacts } from "../harness/test-context.mjs";

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.removals = [];
    this.unrefCalls = 0;
  }
  removeAllListeners(event) {
    this.removals.push(event ?? "*");
    return super.removeAllListeners(event);
  }
  unref() {
    this.unrefCalls += 1;
  }
}

async function withControlledTimers(run) {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = [];
  const cleared = [];
  globalThis.setTimeout = (callback, milliseconds) => {
    const token = { callback, milliseconds };
    timers.push(token);
    return token;
  };
  globalThis.clearTimeout = (token) => cleared.push(token);
  try {
    return await run({ cleared, timers });
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
}

test(
  "A-BRW-01 exact platform commands, arguments, and spawn options",
  { timeout: 5000 },
  async () => {
    const { openUrlInBrowser } = await authModule();
    const facts = await publicFacts();
    const cases = [
      ["darwin", facts.browser.commands.darwin, ["https://owned.invalid/a"]],
      ["win32", facts.browser.commands.win32, ["/c", "start", "", "https://owned.invalid/a"]],
      ["aix", facts.browser.commands.other, ["https://owned.invalid/a"]],
    ];
    for (const [platform, command, expectedArgs] of cases) {
      const child = new FakeChild();
      const calls = [];
      const promise = openUrlInBrowser("https://owned.invalid/a", {
        platform,
        spawnProcess(...args) {
          calls.push(args);
          queueMicrotask(() => child.emit("spawn"));
          return child;
        },
        timeoutMs: 500,
      });
      assert.deepEqual(await promise, { command, opened: true });
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], command);
      assert.deepEqual(calls[0][1], expectedArgs);
      assert.deepEqual(calls[0][2], { detached: true, stdio: "ignore", windowsHide: true });
    }
  },
);

test(
  "A-BRW-02 synchronous spawn failures resolve and stringify exactly",
  { timeout: 5000 },
  async () => {
    const { openUrlInBrowser } = await authModule();
    for (const thrown of [new Error("owned spawn broke"), "non-error failure"]) {
      const result = await openUrlInBrowser("opaque input is not normalized", {
        platform: "linux",
        spawnProcess() {
          throw thrown;
        },
      });
      assert.deepEqual(result, {
        command: "xdg-open",
        opened: false,
        reason: thrown instanceof Error ? thrown.message : String(thrown),
      });
    }
  },
);

test("A-BRW-03 spawn wins once and cleans listeners and deadline", { timeout: 5000 }, async () => {
  const { openUrlInBrowser } = await authModule();
  await withControlledTimers(async ({ cleared, timers }) => {
    const child = new FakeChild();
    const promise = openUrlInBrowser("fixture", {
      platform: "darwin",
      spawnProcess: () => child,
      timeoutMs: 91,
    });
    assert.equal(child.listenerCount("spawn"), 1);
    assert.equal(child.listenerCount("error"), 1);
    child.emit("spawn");
    assert.deepEqual(await promise, { command: "open", opened: true });
    assert.equal(timers.length, 1);
    assert.equal(timers[0].milliseconds, 91);
    assert.deepEqual(cleared, [timers[0]]);
    assert.equal(child.listenerCount("spawn"), 0);
    assert.equal(child.listenerCount("error"), 0);
    assert.equal(child.unrefCalls, 1);
  });
});

test(
  "A-BRW-04 error wins once, cleans resources, and never unreferences",
  { timeout: 5000 },
  async () => {
    const { openUrlInBrowser } = await authModule();
    await withControlledTimers(async ({ cleared, timers }) => {
      const child = new FakeChild();
      const promise = openUrlInBrowser("fixture", {
        platform: "win32",
        spawnProcess: () => child,
        timeoutMs: 92,
      });
      child.emit("error", new Error("owned child error"));
      assert.deepEqual(await promise, {
        command: "cmd.exe",
        opened: false,
        reason: "owned child error",
      });
      child.emit("spawn");
      timers[0].callback();
      assert.deepEqual(cleared, [timers[0]]);
      assert.equal(child.listenerCount("spawn"), 0);
      assert.equal(child.listenerCount("error"), 0);
      assert.equal(child.unrefCalls, 0);
    });
  },
);

test(
  "A-BRW-05 supplied deadline wins, cleans resources, and unreferences",
  { timeout: 5000 },
  async () => {
    const { openUrlInBrowser } = await authModule();
    await withControlledTimers(async ({ cleared, timers }) => {
      const child = new FakeChild();
      const promise = openUrlInBrowser("fixture", {
        platform: "freebsd",
        spawnProcess: () => child,
        timeoutMs: 37,
      });
      assert.equal(timers.length, 1);
      assert.equal(timers[0].milliseconds, 37);
      timers[0].callback();
      assert.deepEqual(await promise, { command: "xdg-open", opened: true });
      assert.deepEqual(cleared, [timers[0]]);
      assert.equal(child.listenerCount("spawn"), 0);
      assert.equal(child.listenerCount("error"), 0);
      assert.equal(child.unrefCalls, 1);
      // 产品监听已清理；测试自己接住迟到的 error，避免 EventEmitter 主动抛错。
      child.once("error", () => {});
      child.emit("error", new Error("late"));
      assert.deepEqual(await promise, { command: "xdg-open", opened: true });
      assert.equal(child.listenerCount("error"), 0);
      assert.equal(child.unrefCalls, 1);
    });
  },
);
