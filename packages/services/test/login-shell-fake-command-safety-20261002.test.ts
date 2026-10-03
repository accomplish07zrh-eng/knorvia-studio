import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { mock, test } from "node:test";

class FakeStream extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
  }
}
class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  kills: string[] = [];
  kill(signal: string) {
    this.kills.push(signal);
    return true;
  }
}
const children: FakeChild[] = [];
const calls: { shell: string; args: string[]; options: Record<string, unknown> }[] = [];
mock.module("node:child_process", {
  namedExports: {
    spawn: (shell: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ shell, args, options });
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    execFileSync: () => {
      throw new Error("forbidden real sync shell");
    },
  },
});
mock.module("node:fs", {
  namedExports: {
    accessSync: () => {
      throw new Error("forbidden real executable probe");
    },
    constants: { X_OK: 1 },
  },
});
mock.module(new URL("../src/runtime-tools/runtimeToolResolver.ts", import.meta.url).href, {
  namedExports: { prependPathEntries: () => "/synthetic/bootstrap" },
});
const { captureLoginShellEnvSnapshot } =
  await import("../src/runtime-tools/runtimeLoginShellEnvCapture.js");
test("fake shell keeps command quoting and timeout cancellation cleanup without launching anything", async () => {
  const timers: (() => void)[] = [];
  const cleared: unknown[] = [];
  mock.method(globalThis, "setTimeout", (callback: () => void) => {
    timers.push(callback);
    return { synthetic: timers.length };
  });
  mock.method(globalThis, "clearTimeout", (timer: unknown) => {
    cleared.push(timer);
  });
  mock.method(process, "kill", () => {
    throw new Error("no process group is authorized");
  });
  const add = AbortSignal.prototype.addEventListener;
  const signals: AbortSignal[] = [];
  mock.method(
    AbortSignal.prototype,
    "addEventListener",
    function (this: AbortSignal, ...args: Parameters<typeof add>) {
      signals.push(this);
      return add.apply(this, args);
    },
  );
  try {
    const result = captureLoginShellEnvSnapshot({
      baseEnv: { PATH: "/synthetic/bin", MARK: "synthetic" },
      platform: "linux",
      shellPath: "/synthetic/bash",
      timeoutMs: 17,
    });
    assert.deepEqual(calls[0].args, [
      "-ilc",
      "printf '%s\\0' '__KNORVIA_LOGIN_ENV_START__'; env -0; printf '%s\\0' '__KNORVIA_LOGIN_ENV_END__'",
    ]);
    assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "pipe"]);
    const env = calls[0].options.env as Record<string, string>;
    assert.equal(env.MARK, "synthetic");
    assert.equal(env.TERM, "dumb");
    assert.equal(env.CI, "1");
    children[0].stdout.emit(
      "data",
      "noise\0__KNORVIA_LOGIN_ENV_START__\0KEY=first\0BAD-NAME=x\0KEY=last=value\0__KNORVIA_LOGIN_ENV_END__\0",
    );
    children[0].emit("close", 0, null);
    assert.deepEqual(await result, { KEY: "last=value" });
    assert.equal(getEventListeners(signals[0], "abort").length, 0);
    assert.equal(cleared.length, 1);
    const timedOut = captureLoginShellEnvSnapshot({
      baseEnv: {},
      platform: "linux",
      shellPath: "/synthetic/sh",
      timeoutMs: 17,
    });
    assert.equal(calls[1].args[0], "-lc");
    timers[1]();
    assert.equal(await timedOut, null);
    assert.deepEqual(children[1].kills, ["SIGKILL"]);
    assert.equal(children[1].stdout.destroyed && children[1].stderr.destroyed, true);
    assert.equal(getEventListeners(signals[1], "abort").length, 0);
    assert.equal(cleared.length, 2);
  } finally {
    mock.restoreAll();
  }
});
