import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mock, test } from "node:test";
import type {
  ProcessIdentity,
  ProcessTreeOwnershipResolution,
  ProcessTreeTerminatorOptions,
} from "../src/process/processTreeTypes.js";

test("synthetic termination preserves PID permissions, force containment and unavailable cleanup", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const child = { pid: 701, exitCode: null, signalCode: null, kill: () => true } as ChildProcess;
  const identities: ProcessIdentity[] = [
    { pid: 701, parentPid: 1, processGroupId: 701, startTime: "old-root" },
    { pid: 702, parentPid: 701, processGroupId: 701, startTime: "old-child" },
    { pid: 703, parentPid: 701, processGroupId: 703, startTime: "detached-child" },
  ];
  let ownership: ProcessTreeOwnershipResolution = {
    childStillOwned: true,
    currentIdentities: identities,
    knownIdentities: identities,
  };
  const signals: unknown[][] = [];
  const queries: unknown[][] = [];
  const requests: unknown[] = [];
  const verifies: number[] = [];
  const warnings: unknown[][] = [];
  const timers: Array<{ callback: () => void; delay: number; unrefCount: number }> = [];
  const bridgeResults: unknown[] = [];
  const flights: Promise<void>[] = [];
  let denyGroup = true;
  let rootAlive = false;
  let invokeWaitBridge = false;
  let mutateForceMembers = false;
  let changePreferenceDuringSchedule = false;
  let referencePreference = false;
  let waiterArgs: unknown[] = [];
  const denied = Object.assign(new Error("synthetic group denied"), { code: "EPERM" });
  const absent = Object.assign(new Error("synthetic missing root"), { code: "ESRCH" });
  const forbidden = () => {
    throw new Error("real process effect forbidden");
  };
  mock.module(new URL("../src/process/processTreeSnapshot.ts", import.meta.url).href, {
    namedExports: {
      captureProcessGroupSnapshot: forbidden,
      captureExitedRootDescendantsSnapshot: forbidden,
      captureProcessTreeSnapshot: forbidden,
    },
  });
  mock.module(new URL("../src/process/processTreeSnapshotAsync.ts", import.meta.url).href, {
    namedExports: {
      captureExitedRootDescendantsSnapshotAsync: forbidden,
      captureProcessTreeSnapshotAsync: forbidden,
      filterCurrentProcessIdentitiesAsync: forbidden,
      verifyWindowsProcessIdentityAsync: async (identity: ProcessIdentity, budget: number) => {
        assert.equal(budget, 750);
        verifies.push(identity.pid);
        return identity.pid === 703;
      },
    },
  });
  const resolveOwnership = (
    _child: ChildProcess,
    known: readonly ProcessIdentity[],
    _options: unknown,
    discovery?: boolean,
  ) => {
    queries.push([known, discovery]);
    return ownership;
  };
  mock.module(new URL("../src/process/processTreeOwnership.ts", import.meta.url).href, {
    namedExports: {
      resolveCurrentOwnedIdentities: resolveOwnership,
      resolveCurrentOwnedIdentitiesAsync: async (...args: Parameters<typeof resolveOwnership>) =>
        resolveOwnership(...args),
    },
  });
  const result = { remainingPids: [701] };
  mock.module(new URL("../src/process/processTreeWaiter.ts", import.meta.url).href, {
    namedExports: {
      waitForProcessTreeTermination: async (
        managed: ChildProcess,
        options: ProcessTreeTerminatorOptions,
        initial: ProcessTreeOwnershipResolution,
        targets: boolean,
        terminate: (child: ChildProcess, options: ProcessTreeTerminatorOptions) => void,
      ) => {
        waiterArgs = [options, initial, targets];
        if (invokeWaitBridge)
          terminate(managed, {
            ...options,
            resolvedOwnership: initial,
            knownIdentities: initial.knownIdentities,
            onForceCleanup: (value: unknown) => bridgeResults.push(value),
          } as ProcessTreeTerminatorOptions);
        return result;
      },
    },
  });
  mock.module(new URL("../src/process/windowsTaskkillRunner.ts", import.meta.url).href, {
    namedExports: { defaultWindowsTaskkillRunner: forbidden },
  });
  const owner = await import("../src/process/processTreeTerminator.js");
  mock.method(globalThis, "setTimeout", (callback: () => void, delay: number) => {
    const timer = {
      callback,
      delay,
      unrefCount: 0,
      unref() {
        this.unrefCount++;
      },
    };
    timers.push(timer);
    if (changePreferenceDuringSchedule) referencePreference = true;
    return timer as unknown as ReturnType<typeof setTimeout>;
  });
  mock.method(Date, "now", () => 1000);
  mock.method(process, "kill", (pid: number, signal: string | number) => {
    signals.push([pid, signal]);
    if (signal === 0) {
      if (pid === 701 && !rootAlive) throw absent;
      return true;
    }
    if (pid === -701 && denyGroup) throw denied;
    if (signal === "SIGKILL" && pid === 703 && mutateForceMembers) {
      ownership.currentIdentities[0] = { pid: 999, parentPid: 1, startTime: "unowned replacement" };
    }
    return true;
  });
  const bridge = {
    resolvedOwnership: ownership,
    forceAfterMs: 1000,
    onForceCleanup: (value: unknown) => bridgeResults.push(value),
    onGracefulCleanupScheduled: (flight: Promise<void>) => flights.push(flight),
    log: { warn: (...values: unknown[]) => warnings.push(values) },
  } as ProcessTreeTerminatorOptions;
  const drain = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  try {
    Object.defineProperty(process, "platform", { value: "linux" });
    assert.equal(owner.shouldSpawnInDetachedProcessGroup(), true);
    owner.terminateProcessTree(child, bridge);
    assert.deepEqual(signals, [
      [-701, "SIGTERM"],
      [702, "SIGTERM"],
      [703, "SIGTERM"],
      [701, "SIGTERM"],
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.at(-1), denied);
    assert.equal(timers[0]?.delay, 1000);
    assert.equal(timers[0]?.unrefCount, 1);
    ownership = {
      childStillOwned: false,
      currentIdentities: [identities[2]!],
      knownIdentities: identities,
    };
    signals.length = 0;
    timers.shift()!.callback();
    assert.deepEqual(signals, [[703, "SIGKILL"]]);
    assert.equal(queries[0]?.[1], false);
    assert.deepEqual(bridgeResults[0], { identities: [identities[2]] });
    mutateForceMembers = true;
    ownership = {
      childStillOwned: false,
      currentIdentities: [{ ...identities[1]!, processGroupId: 702 }, identities[2]!],
      knownIdentities: identities,
    };
    signals.length = 0;
    const ownedForceOptions = { ...bridge, resolvedOwnership: ownership };
    owner.terminateProcessTree(child, ownedForceOptions);
    signals.length = 0;
    ownership.currentIdentities[Symbol.iterator] = function* (): Generator<
      ProcessIdentity,
      undefined,
      unknown
    > {
      yield { pid: 999, parentPid: 1, startTime: "unowned iterator replacement" };
      return undefined;
    };
    timers.shift()!.callback();
    assert.deepEqual(signals, [
      [703, "SIGKILL"],
      [702, "SIGKILL"],
    ]);
    mutateForceMembers = false;
    ownership = { childStillOwned: false, currentIdentities: [], knownIdentities: [] };
    changePreferenceDuringSchedule = true;
    const referenceOptions = {
      ...bridge,
      resolvedOwnership: ownership,
      get keepForceTimerRef() {
        return referencePreference;
      },
    };
    owner.terminateProcessTree(child, referenceOptions);
    assert.equal(timers[0]?.unrefCount, 1);
    timers.shift()!.callback();
    changePreferenceDuringSchedule = false;
    let childKills = 0;
    const missing = {
      kill: () => {
        childKills++;
        throw absent;
      },
    } as unknown as ChildProcess;
    owner.terminateProcessTree(missing, bridge);
    assert.equal(childKills, 1);
    assert.deepEqual(await owner.terminateProcessTreeAndWait(missing), { remainingPids: [] });
    assert.equal(childKills, 1);

    Object.defineProperty(process, "platform", { value: "win32" });
    assert.equal(owner.shouldSpawnInDetachedProcessGroup(), false);
    denyGroup = false;
    signals.length = 0;
    warnings.length = 0;
    bridgeResults.length = 0;
    ownership = {
      childStillOwned: true,
      currentIdentities: identities,
      knownIdentities: identities,
    };
    const windowsOptions = {
      ...bridge,
      resolvedOwnership: ownership,
      windowsTaskkillRunner: async (request: unknown) => {
        requests.push(request);
        return {};
      },
    } as ProcessTreeTerminatorOptions;
    owner.terminateProcessTree(child, windowsOptions);
    await drain();
    assert.deepEqual(requests, [{ force: false, pid: 701, timeoutMs: 2000 }]);
    assert.equal(flights.length, 1);
    await flights[0];
    assert.equal(timers[0]?.delay, 250);
    timers.shift()!.callback();
    await drain();
    assert.deepEqual(verifies, [701, 702, 703]);
    assert.deepEqual(requests, [
      { force: false, pid: 701, timeoutMs: 2000 },
      { force: true, pid: 703, timeoutMs: 2000 },
    ]);
    assert.deepEqual(bridgeResults[0], { identities });
    assert.ok(signals.every((event) => event[1] === 0));

    requests.length = 0;
    verifies.length = 0;
    bridgeResults.length = 0;
    rootAlive = true;
    invokeWaitBridge = true;
    const waitResult = await owner.terminateProcessTreeAndWait(child, {
      snapshot: {
        rootPid: 701,
        descendantPids: [],
        identities: [],
        identityVerification: "unavailable",
      },
      forceAfterMs: 0,
      windowsTaskkillRunner: async (request) => {
        requests.push(request);
        return {};
      },
    });
    assert.equal(waitResult, result);
    assert.equal((waiterArgs[0] as { unverifiedRootOnly: boolean }).unverifiedRootOnly, true);
    assert.deepEqual(waiterArgs[1], {
      childStillOwned: true,
      currentIdentities: [],
      knownIdentities: [],
    });
    assert.equal(waiterArgs[2], false);
    timers.shift()!.callback();
    await drain();
    assert.deepEqual(requests, []);
    assert.deepEqual(verifies, []);
    assert.deepEqual(bridgeResults[0], { identities: [], unverifiedRootPid: 701 });
    assert.equal(timers.length, 0);
  } finally {
    Object.defineProperty(process, "platform", platform);
    mock.restoreAll();
  }
});
