import type { ChildProcess } from "node:child_process";
import type {
  ProcessIdentity,
  ProcessTreeOwnershipResolution,
  ProcessTreeSnapshot,
  ProcessTreeTerminationResult,
  ProcessTreeTerminatorOptions,
  ProcessTreeTerminatorWaitOptions,
  WindowsTaskkillResult,
} from "#src/process/processTreeTypes.js";
import {
  captureExitedRootDescendantsSnapshot,
  captureProcessGroupSnapshot,
} from "#src/process/processTreeSnapshot.js";
import {
  captureExitedRootDescendantsSnapshotAsync,
  verifyWindowsProcessIdentityAsync,
} from "#src/process/processTreeSnapshotAsync.js";
import {
  resolveCurrentOwnedIdentities,
  resolveCurrentOwnedIdentitiesAsync,
} from "#src/process/processTreeOwnership.js";
import { waitForProcessTreeTermination } from "#src/process/processTreeWaiter.js";
import { defaultWindowsTaskkillRunner } from "#src/process/windowsTaskkillRunner.js";

export {
  captureProcessGroupSnapshot,
  captureExitedRootDescendantsSnapshot,
  captureProcessTreeSnapshot,
} from "#src/process/processTreeSnapshot.js";
export {
  captureExitedRootDescendantsSnapshotAsync,
  captureProcessTreeSnapshotAsync,
  filterCurrentProcessIdentitiesAsync,
} from "#src/process/processTreeSnapshotAsync.js";
export type {
  ProcessIdentity,
  ProcessTreeSnapshot,
  ProcessTreeTerminationResult,
  ProcessTreeTerminatorLogger,
  ProcessTreeTerminatorOptions,
  ProcessTreeTerminatorWaitOptions,
  WindowsTaskkillRequest,
  WindowsTaskkillResult,
  WindowsTaskkillRunner,
} from "#src/process/processTreeTypes.js";

type CleanupObservation = {
  identities: ProcessIdentity[];
  unverifiedRootPid?: number;
};
type TerminationBridge = ProcessTreeTerminatorOptions & {
  knownIdentities?: readonly ProcessIdentity[];
  resolvedOwnership?: ProcessTreeOwnershipResolution;
  unverifiedRootOnly?: boolean;
  onForceTimerScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
  onGracefulCleanupScheduled?: (flight: Promise<void>) => void;
  onForceCleanup?: (result: CleanupObservation) => void;
};

export function shouldSpawnInDetachedProcessGroup(): boolean {
  return process.platform !== "win32";
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

function signalProcess(
  pid: number,
  signal: "SIGTERM" | "SIGKILL",
  group: boolean,
  options: ProcessTreeTerminatorOptions,
): boolean {
  try {
    process.kill(group ? -pid : pid, signal);
    return true;
  } catch (error) {
    if (errorCode(error) !== "ESRCH") {
      options.log?.warn(
        options.traceId,
        group
          ? `发送 runtime 进程组终止信号失败 pgid=${pid} signal=${signal}:`
          : `发送 runtime 进程终止信号失败 pid=${pid} signal=${signal}:`,
        error,
      );
    }
    return false;
  }
}

function probeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasLiveHandle(child: ChildProcess, pid: number): boolean {
  return (
    typeof child.kill === "function" &&
    child.exitCode === null &&
    child.signalCode === null &&
    probeProcess(pid)
  );
}

function observeCleanup(
  ownership: ProcessTreeOwnershipResolution,
  pid: number | undefined,
): CleanupObservation {
  const hasVerifiedRoot = ownership.currentIdentities.some((identity) => identity.pid === pid);
  return {
    identities: ownership.currentIdentities,
    ...(ownership.childStillOwned && !hasVerifiedRoot ? { unverifiedRootPid: pid! } : {}),
  };
}

function scheduleForce(delay: number, options: TerminationBridge, action: () => void): void {
  const keepRef = Boolean(options.keepForceTimerRef);
  const timer = setTimeout(action, Math.max(delay, 0));
  if (!keepRef) timer.unref();
  options.onForceTimerScheduled?.(timer);
}

function canSignalGroup(ownership: ProcessTreeOwnershipResolution, pid: number): boolean {
  return (
    ownership.childStillOwned ||
    ownership.currentIdentities.some((identity) => identity.processGroupId === pid)
  );
}

function terminatePosix(child: ChildProcess, options: TerminationBridge): void {
  const pid = child.pid!;
  const ownership =
    options.resolvedOwnership ??
    resolveCurrentOwnedIdentities(child, options.knownIdentities ?? [], options);
  const groupSignaled =
    canSignalGroup(ownership, pid) && signalProcess(pid, "SIGTERM", true, options);
  for (const identity of ownership.currentIdentities) {
    if (identity.pid !== pid) signalProcess(identity.pid, "SIGTERM", false, options);
  }
  if (!groupSignaled && ownership.childStillOwned) {
    signalProcess(pid, "SIGTERM", false, options);
  }
  scheduleForce(options.forceAfterMs ?? 2000, options, () => {
    const currentPid = child.pid!;
    const current = resolveCurrentOwnedIdentities(child, ownership.knownIdentities, options, false);
    const groupEligible = canSignalGroup(current, currentPid);
    if (groupEligible) signalProcess(currentPid, "SIGKILL", true, options);
    for (const identity of current.currentIdentities.toReversed()) {
      if (identity.pid !== currentPid) {
        signalProcess(identity.pid, "SIGKILL", false, options);
      }
    }
    if (!groupEligible) {
      const root = current.currentIdentities.find((identity) => identity.pid === currentPid);
      if (root) signalProcess(root.pid, "SIGKILL", false, options);
    }
    const observation = observeCleanup(current, currentPid);
    options.onForceCleanup?.(observation);
  });
}

async function runTaskkill(
  pid: number,
  force: boolean,
  options: ProcessTreeTerminatorOptions,
): Promise<void> {
  const timeoutMs = Math.max(options.windowsTaskkillTimeoutMs ?? 2000, 1);
  const runner = options.windowsTaskkillRunner ?? defaultWindowsTaskkillRunner;
  const startedAt = Date.now();
  options.log?.debug?.(options.traceId, "Windows runtime 进程树 taskkill started", {
    force,
    pid,
    timeoutMs,
  });
  let result: WindowsTaskkillResult;
  try {
    result = await runner({
      force,
      pid,
      timeoutMs,
      ...(options.helperEnvironment ? { helperEnvironment: options.helperEnvironment } : {}),
    });
  } catch (error) {
    result = { error };
  }
  options.log?.debug?.(options.traceId, "Windows runtime 进程树 taskkill completed", {
    durationMs: Date.now() - startedAt,
    force,
    pid,
    success: !result.error,
  });
  if (result.error && probeProcess(pid)) {
    const code =
      result.error !== null && typeof result.error === "object" && "code" in result.error
        ? String(result.error.code ?? "unknown")
        : "unknown";
    options.log?.warn(
      options.traceId,
      `${force ? "强制清理" : "请求"} runtime 进程树退出失败 pid=${pid} status=${code}:`,
      result.error,
      result.stderr,
    );
  }
}

async function forceWindows(
  child: ChildProcess,
  ownership: ProcessTreeOwnershipResolution,
  identities: ProcessIdentity[],
  recheck: boolean,
  options: TerminationBridge,
): Promise<CleanupObservation> {
  const verified = recheck
    ? await Promise.all(
        identities.map((identity) => verifyWindowsProcessIdentityAsync(identity, 750, options)),
      )
    : [];
  const targets = new Set<number>();
  for (let index = 0; index < identities.length; index++) {
    if (verified[index]) targets.add(identities[index]!.pid);
  }
  if (!options.unverifiedRootOnly && child.pid != null && hasLiveHandle(child, child.pid)) {
    targets.add(child.pid);
  }
  await Promise.all(Array.from(targets, (pid) => runTaskkill(pid, true, options)));
  return observeCleanup(ownership, child.pid);
}

function scheduleWindows(
  child: ChildProcess,
  ownership: ProcessTreeOwnershipResolution,
  startedAt: number,
  options: TerminationBridge,
): void {
  const pid = child.pid!;
  const targets =
    ownership.childStillOwned && !options.unverifiedRootOnly
      ? [pid]
      : ownership.currentIdentities.map((identity) => identity.pid);
  const liveHandle = !options.unverifiedRootOnly && hasLiveHandle(child, pid);
  if (targets.length === 0 && liveHandle) targets.push(pid);
  const graceful = Promise.all(
    Array.from(new Set(targets), (target) => runTaskkill(target, false, options)),
  ).then(() => undefined);
  options.onGracefulCleanupScheduled?.(graceful);
  const forceDelay = Math.max((options.forceAfterMs ?? 2000) - (Date.now() - startedAt), 0);
  const identities = ownership.currentIdentities.filter(
    (identity) => !options.unverifiedRootOnly || identity.pid !== pid,
  );
  const recheck = identities.length > 0 && forceDelay >= 750;
  scheduleForce(recheck ? forceDelay - 750 : forceDelay, options, () => {
    void forceWindows(child, ownership, identities, recheck, options).then((observation) => {
      options.onForceCleanup?.(observation);
    });
  });
}

export function terminateProcessTree(
  child: ChildProcess,
  options: ProcessTreeTerminatorOptions = {},
): void {
  if (child.pid == null) {
    try {
      child.kill("SIGTERM");
    } catch (error) {
      options.log?.warn(options.traceId, "发送 runtime 进程终止信号失败 pid=unknown:", error);
    }
    return;
  }
  const bridge = options as TerminationBridge;
  if (process.platform !== "win32") {
    terminatePosix(child, bridge);
    return;
  }
  const startedAt = Date.now();
  if (bridge.resolvedOwnership) {
    scheduleWindows(child, bridge.resolvedOwnership, startedAt, bridge);
  } else {
    void resolveCurrentOwnedIdentitiesAsync(child, bridge.knownIdentities ?? [], options).then(
      (ownership) => scheduleWindows(child, ownership, startedAt, bridge),
    );
  }
}

export async function terminateProcessTreeAndWait(
  child: ChildProcess,
  options: ProcessTreeTerminatorWaitOptions = {},
): Promise<ProcessTreeTerminationResult> {
  if (child.pid == null) return { remainingPids: [] };
  let snapshot: ProcessTreeSnapshot | undefined;
  if (options.snapshot?.rootPid === child.pid) {
    snapshot = options.snapshot;
  } else if (options.ownedProcessGroupId === child.pid) {
    snapshot = captureProcessGroupSnapshot(options.ownedProcessGroupId, options);
  } else if (process.platform === "win32") {
    snapshot = await captureExitedRootDescendantsSnapshotAsync(child.pid, options);
  } else {
    snapshot = captureExitedRootDescendantsSnapshot(child.pid, options);
  }
  const identities = snapshot?.identities ?? [];
  const unavailable = snapshot?.identityVerification === "unavailable";
  let initial: ProcessTreeOwnershipResolution;
  if (
    process.platform === "win32" &&
    snapshot != null &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    initial = {
      childStillOwned: unavailable || identities.some((identity) => identity.pid === child.pid),
      currentIdentities: [...identities],
      knownIdentities: [...identities],
    };
  } else {
    initial = await resolveCurrentOwnedIdentitiesAsync(child, identities, options);
  }
  const waitOptions = unavailable ? { ...options, unverifiedRootOnly: true } : options;
  const hasTargets =
    initial.currentIdentities.length > 0 || (!unavailable && initial.childStillOwned);
  return await waitForProcessTreeTermination(
    child,
    waitOptions,
    initial,
    hasTargets,
    terminateProcessTree,
  );
}
