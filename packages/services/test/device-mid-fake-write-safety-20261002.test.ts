import assert from "node:assert/strict";
import { join } from "node:path";
import { mock, test } from "node:test";

const files = new Map<string, string>();
const locked = new Set<string>();
const operations: string[] = [];
let writeFailure: Error | undefined;
function nodeError(code: string): Error & { code: string } {
  return Object.assign(new Error(`synthetic ${code}`), { code });
}
mock.module("node:fs/promises", {
  namedExports: {
    mkdir: async (path: string) => {
      operations.push(`mkdir:${path}`);
    },
    readFile: async (path: string) => {
      operations.push(`read:${path}`);
      if (!files.has(path)) throw nodeError("ENOENT");
      return files.get(path);
    },
    writeFile: async (path: string, content: string) => {
      operations.push(`write:${path}`);
      if (writeFailure) throw writeFailure;
      files.set(path, content);
    },
    stat: async () => ({ mtimeMs: 1_000_000 }),
    unlink: async (path: string) => {
      operations.push(`unlink:${path}`);
      locked.delete(path);
      files.delete(path);
    },
    open: async (path: string, flags: string) => {
      assert.equal(flags, "wx");
      operations.push(`open:${path}`);
      if (locked.has(path)) throw nodeError("EEXIST");
      locked.add(path);
      return {
        writeFile: async (content: string) => {
          files.set(path, content);
        },
        close: async () => {
          operations.push(`close:${path}`);
        },
      };
    },
  },
});
mock.module(new URL("../src/paths.ts", import.meta.url).href, {
  namedExports: { getAppConfigDir: () => "/synthetic/config/v2" },
});
mock.module("@knorvia/shared", { namedExports: { createUuid: () => "synthetic-default-mid" } });
const { ensureDeviceMid, ensureDeviceMidInLockedState } =
  await import("../src/device/deviceMid.ts");

test("fake device identity writes preserve cache authority, lock cleanup and rejection identity", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const probes: Array<[number, number | string | undefined]> = [];
  t.mock.method(process, "kill", (pid: number, signal?: number | string) => {
    probes.push([pid, signal]);
    throw nodeError("ESRCH");
  });
  const home = "/synthetic/concurrent";
  const statePath = join(home, ".knorvia-studio", "v2", "telemetry-state.json");
  const lockPath = join(home, ".knorvia-studio", "v2", "telemetry-state.lock");
  files.set(statePath, '{"preserve":{"fixture":true}}');
  let generations = 0;
  const options = {
    homeDir: home,
    randomUUID: () => {
      generations++;
      return "synthetic-mid";
    },
  };
  const first = ensureDeviceMid(options);
  const concurrent = ensureDeviceMid(options);
  assert.equal(first, concurrent);
  assert.equal(await first, "synthetic-mid");
  assert.equal(generations, 1);
  assert.equal(
    files.get(statePath),
    JSON.stringify({ preserve: { fixture: true }, deviceMid: "synthetic-mid" }, null, 2),
  );
  assert.equal(locked.has(lockPath), false);
  assert.equal(files.has(lockPath), false);
  assert.equal(
    await ensureDeviceMid({ homeDir: home, randomUUID: () => "must-not-run" }),
    "synthetic-mid",
  );

  const failedHome = "/synthetic/failure";
  const originalFailure = new Error("synthetic write failure");
  writeFailure = originalFailure;
  await assert.rejects(
    ensureDeviceMid({ homeDir: failedHome }),
    (error) => error === originalFailure,
  );
  writeFailure = undefined;
  assert.equal(await ensureDeviceMid({ homeDir: failedHome }), "synthetic-default-mid");
  const failedLock = join(failedHome, ".knorvia-studio", "v2", "telemetry-state.lock");
  assert.equal(locked.has(failedLock), false);

  const orphanHome = "/synthetic/orphan";
  const orphanLock = join(orphanHome, ".knorvia-studio", "v2", "telemetry-state.lock");
  locked.add(orphanLock);
  files.set(orphanLock, JSON.stringify({ pid: 999_999, createdAt: 1_000_000 }));
  assert.equal(
    await ensureDeviceMid({ homeDir: orphanHome, randomUUID: () => "orphan-mid" }),
    "orphan-mid",
  );
  assert.deepEqual(probes, [[999_999, 0]]);
  assert.equal(locked.has(orphanLock), false);

  const heldHome = "/synthetic/already-locked";
  const heldState = { deviceMid: "authoritative-mid", preserve: "fixture" };
  const before = operations.length;
  assert.equal(
    await ensureDeviceMidInLockedState(heldState, {
      homeDir: heldHome,
      randomUUID: () => "unused",
    }),
    "authoritative-mid",
  );
  assert.equal(await ensureDeviceMid({ homeDir: heldHome }), "authoritative-mid");
  assert.equal(operations.length, before);
});
