import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

class FakeStream extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
  }
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  pid = 42;
  kills: unknown[] = [];
  unreferenced = false;
  kill(signal?: unknown) {
    this.kills.push(signal);
    return true;
  }
  unref() {
    this.unreferenced = true;
  }
}

test("fake git command preserves argv/env, refusal, output and timeout cleanup", async (t) => {
  const spawned: {
    binary: string;
    args: string[];
    options: Record<string, unknown>;
    child: FakeChild;
  }[] = [];
  let binary: string | null = "/synthetic/git";
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  t.mock.module("node:child_process", {
    namedExports: {
      spawn: (binary: string, args: string[], options: Record<string, unknown>) => {
        const child = new FakeChild();
        spawned.push({ binary, args, options, child });
        return child;
      },
    },
  });
  t.mock.module("../src/git/config.js", {
    namedExports: { DEFAULT_GIT_COMMAND_TIMEOUT_MS: 15000, DEFAULT_GIT_OUTPUT_BYTES: 512 * 1024 },
  });
  t.mock.module("../src/git/providers/gitEnvironmentProvider.js", {
    namedExports: {
      createGitEnvironmentProvider: () => assert.fail("unexpected real environment provider"),
    },
  });
  const { createGitCommandProvider } = await import("../src/git/providers/gitCommandProvider.js");
  const owner = createGitCommandProvider({
    environmentProvider: {
      resolveGitBinary: async () => binary,
      createCommandEnv: () => ({ SAFE: "base", OVERRIDE: "base" }),
    },
    platform: "linux",
    timeoutKillGraceMs: 5,
    timeoutForceKillGraceMs: 7,
  });
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const args = ["add", "--", "file 'quoted'; $(never-execute)"];
  const pending = owner.run({ cwd: "/synthetic/repo", args, env: { OVERRIDE: "selected" } });
  await flush();
  assert.equal(spawned[0].args, args);
  assert.deepEqual(spawned[0].options, {
    cwd: "/synthetic/repo",
    env: { SAFE: "base", OVERRIDE: "selected" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  spawned[0].child.stdout.emit("data", Buffer.from("ok"));
  spawned[0].child.emit("close", 0, null);
  const result = await pending;
  assert.equal(result.stdout, "ok");
  assert.equal(result.args, args);
  assert.equal(spawned[0].child.stdout.listenerCount("data"), 0);
  assert.equal(spawned[0].child.listenerCount("error"), 0);
  binary = null;
  await assert.rejects(owner.run({ cwd: "/synthetic/repo", args }), /Git binary is not available/);
  assert.equal(spawned.length, 1);
  binary = "/synthetic/git";
  const overflowing = owner.run({ cwd: "/synthetic/repo", args, maxOutputBytes: 2 });
  await flush();
  const overflowChild = spawned[1].child;
  overflowChild.stdout.emit("data", Buffer.from("ok"));
  overflowChild.stderr.emit("data", Buffer.from("yes"));
  overflowChild.emit("close", 1, null);
  const overflow = await overflowing;
  assert.equal(overflow.stdout, "ok");
  assert.equal(overflow.stderr, "");
  assert.equal(overflow.outputTruncated, true);
  assert.deepEqual(overflowChild.kills, [undefined]);
  const failing = owner.run({ cwd: "/synthetic/repo", args });
  await flush();
  spawned[2].child.emit("error", new Error("synthetic spawn permission refusal"));
  assert.equal((await failing).exitCode, -2);
  const timing = owner.run({ cwd: "/synthetic/repo", args, timeoutMs: 10 });
  await flush();
  t.mock.timers.tick(10);
  await flush();
  t.mock.timers.tick(5);
  await flush();
  t.mock.timers.tick(7);
  await flush();
  const timed = await timing;
  assert.equal(timed.timedOut, true);
  assert.equal(timed.orphaned, true);
  assert.equal(timed.timeoutElapsedMs, 10);
  assert.equal(timed.timeoutCloseDelayMs, 12);
  assert.deepEqual(spawned[3].child.kills, [undefined, "SIGKILL"]);
  assert.equal(spawned[3].child.stdout.destroyed, true);
  assert.equal(spawned[3].child.unreferenced, true);
});
