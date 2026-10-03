import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { ProcessIdentity } from "../src/process/processTreeTypes.js";

test("Linux completion uses current state and identity without concealing active processes", async (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const setPlatform = (value: string) =>
    Object.defineProperty(process, "platform", { ...platform, value });
  setPlatform("linux");
  const reads: string[] = [];
  const signals: number[] = [];
  let state = "S";
  let ticks = "100";
  let group = 901;
  let raw: string | undefined;
  let readFailure: { value: unknown } | undefined;
  let probeFailure: { value: unknown } | undefined;
  const stat = (pid: number) => {
    const fields = Array<string>(20).fill("0");
    fields[0] = state;
    fields[1] = pid === 901 ? "0" : "901";
    fields[2] = String(group);
    fields[19] = ticks;
    return `${pid} (synthetic (worker) name)) ${fields.join(" ")}`;
  };
  t.mock.module("node:fs", {
    namedExports: {
      readFileSync(path: string, encoding: string) {
        assert.equal(encoding, "utf8");
        assert.match(path, /^\/proc\/(901|902)\/stat$/);
        reads.push(path);
        if (readFailure) throw readFailure.value;
        return raw ?? stat(Number(path.split("/")[2]));
      },
    },
  });
  t.mock.module("node:child_process", {
    namedExports: {
      spawnSync(command: string) {
        assert.equal(command, "ps");
        return {
          status: 0,
          stdout: "901 0 901 Mon Jan 1 00:00:00 2024\n902 901 901 Mon Jan 1 00:00:00 2024",
        };
      },
    },
  });
  t.mock.method(process, "kill", (pid: number, signal: unknown) => {
    assert.equal(signal, 0);
    assert.ok(pid === 901 || pid === 902);
    signals.push(pid);
    if (probeFailure) throw probeFailure.value;
    return true;
  });
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: 1000 });
  const { captureProcessTreeSnapshot } = await import("../src/process/processTreeSnapshot.js");
  const { waitForProcessTreeTermination } = await import("../src/process/processTreeWaiter.js");
  type Bridge = {
    onForceTimerScheduled(timer: ReturnType<typeof setTimeout>): void;
    onForceCleanup(result: { identities: ProcessIdentity[]; unverifiedRootPid?: number }): void;
  };
  const tracked = { pid: 902, parentPid: 901, processGroupId: 901, startTime: "linux-ticks:100" };
  async function observe(
    options: { cachedState?: string; beforeForce?: () => void; unverified?: boolean } = {},
  ) {
    const child = Object.assign(new EventEmitter(), {
      pid: 901,
      exitCode: options.unverified ? null : 0,
      signalCode: null,
    }) as ChildProcess;
    const identities: ProcessIdentity[] = options.unverified
      ? []
      : [{ ...tracked, ...({ linuxState: options.cachedState ?? "S" } as object) }];
    const waiting = waitForProcessTreeTermination(
      child,
      { forceAfterMs: 10, waitAfterForceMs: 0, windowsCleanupDeadlineAtMs: Date.now() + 10 },
      {
        childStillOwned: !!options.unverified,
        currentIdentities: identities,
        knownIdentities: identities,
      },
      false,
      (_child, supplied) => {
        const bridge = supplied as typeof supplied & Bridge;
        const timer = setTimeout(() => {
          options.beforeForce?.();
          bridge.onForceCleanup({
            identities,
            ...(options.unverified ? { unverifiedRootPid: 901 } : {}),
          });
        }, 10);
        bridge.onForceTimerScheduled(timer);
      },
    );
    t.mock.timers.tick(10);
    const result = await waiting;
    assert.equal(child.listenerCount("exit"), 0);
    return result.remainingPids;
  }
  const reset = () => {
    state = "S";
    ticks = "100";
    group = 901;
    raw = undefined;
    readFailure = probeFailure = undefined;
    reads.length = signals.length = 0;
    setPlatform("linux");
  };
  try {
    await t.test(
      "snapshot retains Linux state with exact ticks and group even when comm contains parentheses",
      () => {
        reset();
        state = "Z";
        const snapshot = captureProcessTreeSnapshot({ pid: 901 } as ChildProcess);
        assert.ok(snapshot);
        assert.deepEqual(snapshot.descendantPids, [902]);
        for (const identity of snapshot.identities) {
          assert.equal((identity as ProcessIdentity & { linuxState?: string }).linuxState, "Z");
          assert.equal(identity.startTime, "linux-ticks:100");
          assert.equal(identity.processGroupId, 901);
        }
      },
    );
    await t.test("current Z settles a zombie-only tree despite an existing PID", async () => {
      reset();
      state = "Z";
      assert.deepEqual(await observe(), []);
      assert.ok(reads.length > 0);
    });
    await t.test("force-completion observes transition from working to Z", async () => {
      reset();
      assert.deepEqual(
        await observe({
          beforeForce: () => {
            state = "Z";
          },
        }),
        [],
      );
    });
    for (const activeState of ["R", "S", "D", "T", "t", "I", "?"]) {
      await t.test(`current ${activeState} remains active even with cached Z`, async () => {
        reset();
        state = activeState;
        assert.deepEqual(await observe({ cachedState: "Z" }), [902]);
      });
    }
    await t.test("a reused PID is outside the old ticks identity", async () => {
      reset();
      ticks = "200";
      assert.deepEqual(await observe(), []);
    });
    await t.test("a different PGID is outside the tracked group identity", async () => {
      reset();
      group = 999;
      assert.deepEqual(await observe(), []);
    });
    for (const malformed of [
      "invalid stat",
      stat(902).replace(")) S ", ")) ZZ "),
      stat(902).replace(/100$/, "not-ticks"),
    ]) {
      await t.test("malformed stat is inconclusive while signal-zero still succeeds", async () => {
        reset();
        raw = malformed;
        assert.deepEqual(await observe(), [902]);
      });
    }
    await t.test("unreadable stat keeps a PID that still responds to signal-zero", async () => {
      reset();
      readFailure = { value: Object.assign(new Error("synthetic denied"), { code: "EACCES" }) };
      assert.deepEqual(await observe(), [902]);
    });
    for (const failure of [
      Object.assign(new Error("synthetic permission"), { code: "EPERM" }),
      undefined,
      0,
      {
        get code() {
          throw new Error("synthetic probe getter");
        },
      },
    ]) {
      await t.test("an inconclusive Linux probe failure does not prove absence", async () => {
        reset();
        readFailure = { value: new Error("synthetic unavailable") };
        probeFailure = { value: failure };
        assert.deepEqual(await observe(), [902]);
      });
    }
    await t.test("ESRCH establishes absence when stat is unavailable", async () => {
      reset();
      readFailure = { value: new Error("synthetic unavailable") };
      probeFailure = { value: Object.assign(new Error("synthetic absent"), { code: "ESRCH" }) };
      assert.deepEqual(await observe(), []);
    });
    await t.test("a current zombie-only unverified Linux root has stopped work", async () => {
      reset();
      state = "Z";
      assert.deepEqual(await observe({ unverified: true }), []);
    });
    for (const otherPlatform of ["darwin", "win32"]) {
      await t.test(
        `${otherPlatform} observation keeps existing semantics and never reads proc`,
        async () => {
          reset();
          setPlatform(otherPlatform);
          state = "Z";
          assert.deepEqual(await observe({ cachedState: "Z" }), [902]);
          assert.deepEqual(reads, []);
          reset();
          setPlatform(otherPlatform);
          probeFailure = {
            value: Object.assign(new Error("synthetic permission"), { code: "EPERM" }),
          };
          assert.deepEqual(await observe(), []);
          assert.deepEqual(reads, []);
        },
      );
    }
  } finally {
    t.mock.timers.reset();
    Object.defineProperty(process, "platform", platform);
  }
});
