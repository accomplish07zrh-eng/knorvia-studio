import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";

test("synthetic Git discovery permission outcomes, ordered probes and cached attempts", async (t) => {
  const children: (EventEmitter & { kill(): boolean })[] = [];
  const spawns: unknown[][] = [];
  const timers: { callback: () => void; delay: number }[] = [];
  const cleared: unknown[] = [];
  const kills: number[] = [];
  let envReads = 0;
  let candidateReads = 0;
  let rejectSpawn: Error | null = null;
  mock.method(globalThis, "setTimeout", (callback: () => void, delay: number) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  });
  mock.method(globalThis, "clearTimeout", (timer: unknown) => cleared.push(timer));
  t.after(() => mock.restoreAll());
  mock.module("node:child_process", {
    namedExports: {
      spawn: (...args: unknown[]) => {
        if (rejectSpawn) throw rejectSpawn;
        spawns.push(args);
        const index = children.length;
        const child = Object.assign(new EventEmitter(), {
          kill: () => {
            kills.push(index);
            return true;
          },
        });
        children.push(child);
        return child;
      },
    },
  });
  mock.module(new URL("../src/git/config.ts", import.meta.url).href, {
    namedExports: {
      DEFAULT_GIT_DISCOVERY_TIMEOUT_MS: 3000,
      getGitBinaryCandidates: () => {
        candidateReads++;
        return ["owned --denied git", "owned quote ' git"];
      },
      getGitCommandEnv: () => ({ OWNED_SYNTHETIC_ENV: String(++envReads) }),
    },
  });
  const { createGitEnvironmentProvider } =
    await import("../src/git/providers/gitEnvironmentProvider.js");
  const owner = createGitEnvironmentProvider();
  const first = owner.resolveGitBinary();
  const second = owner.resolveGitBinary();
  assert.equal(spawns.length, 1);
  assert.equal(timers[0].delay, 3000);
  children[0].emit("error", Object.assign(new Error("synthetic denied"), { code: "EACCES" }));
  for (let i = 0; i < 8 && children.length < 2; i++) await Promise.resolve();
  assert.equal(children.length, 2);
  children[1].emit("close", 0);
  assert.equal(await first, "owned quote ' git");
  assert.equal(await second, "owned quote ' git");
  assert.equal(await owner.resolveGitBinary(), "owned quote ' git");
  assert.equal(candidateReads, 1);
  assert.equal(envReads, 1);
  assert.deepEqual(
    spawns.map((s) => s.slice(0, 2)),
    [
      ["owned --denied git", ["--version"]],
      ["owned quote ' git", ["--version"]],
    ],
  );
  assert.equal((spawns[0][2] as { env: unknown }).env, (spawns[1][2] as { env: unknown }).env);
  assert.deepEqual(spawns[0][2], {
    env: { OWNED_SYNTHETIC_ENV: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  assert.equal(cleared.length, 2);
  assert.deepEqual(kills, []);
  assert.deepEqual(owner.createCommandEnv(), { OWNED_SYNTHETIC_ENV: "2" });
  assert.deepEqual(owner.createCommandEnv(), { OWNED_SYNTHETIC_ENV: "3" });

  const timeoutOwner = createGitEnvironmentProvider();
  const pending = timeoutOwner.resolveGitBinary();
  timers[2].callback();
  assert.deepEqual(kills, [2]);
  for (let i = 0; i < 8 && children.length < 4; i++) await Promise.resolve();
  children[3].emit("close", 1);
  assert.equal(await pending, null);
  assert.equal(await timeoutOwner.resolveGitBinary(), null);
  const count = spawns.length;
  children[2].emit("close", 0);
  assert.equal(await timeoutOwner.resolveGitBinary(), null);
  assert.equal(spawns.length, count);

  rejectSpawn = new Error("owned synchronous spawn denied");
  const deniedOwner = createGitEnvironmentProvider();
  await assert.rejects(deniedOwner.resolveGitBinary(), (e) => e === rejectSpawn);
  rejectSpawn = null;
  await assert.rejects(deniedOwner.resolveGitBinary(), /owned synchronous spawn denied/);
  assert.equal(spawns.length, count);
});
