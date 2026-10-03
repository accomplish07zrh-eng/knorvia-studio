import type { ChildProcess } from "node:child_process";

import type {
  ProcessIdentity,
  ProcessTreeOwnershipResolution,
  ProcessTreeTerminationResult,
  ProcessTreeTerminatorOptions,
  ProcessTreeTerminatorWaitOptions,
} from "#src/process/processTreeTypes.js";

interface WaitInternalOptions extends ProcessTreeTerminatorWaitOptions {
  knownIdentities?: readonly ProcessIdentity[];
  onForceCleanup?: (result: ForceCleanupResult) => void;
  onForceTimerScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
  onGracefulCleanupScheduled?: (flight: Promise<void>) => void;
  resolvedOwnership?: ProcessTreeOwnershipResolution;
}

interface ForceCleanupResult {
  identities: ProcessIdentity[];
  unverifiedRootPid?: number;
}

type TerminateProcessTree = (child: ChildProcess, options: ProcessTreeTerminatorOptions) => void;

export async function waitForProcessTreeTermination(
  child: ChildProcess,
  options: ProcessTreeTerminatorWaitOptions,
  initialOwnership: ProcessTreeOwnershipResolution,
  hasWindowsTaskkillTargets: boolean,
  terminateProcessTree: TerminateProcessTree,
): Promise<ProcessTreeTerminationResult> {
  if (child.pid == null) {
    return { remainingPids: [] };
  }

  const waiterStarted = Date.now();
  const forceAfterMs = Math.max(options.forceAfterMs ?? 2000, 0);
  const waitAfterForceMs = Math.max(options.waitAfterForceMs ?? 250, 0);
  const isWindows = process.platform === "win32";
  const windowsTaskkillBudgetMs = hasWindowsTaskkillTargets
    ? Math.max(options.windowsTaskkillTimeoutMs ?? 2000, 1)
    : 0;
  const windowsRelativeDeadlineMs = forceAfterMs + windowsTaskkillBudgetMs + waitAfterForceMs;
  const transportRemainingMs =
    options.windowsCleanupDeadlineAtMs === undefined
      ? windowsRelativeDeadlineMs
      : Math.max(options.windowsCleanupDeadlineAtMs - waiterStarted, 0);
  const observationDeadlineMs = Math.max(windowsRelativeDeadlineMs, 750);
  const windowsCleanupDeadlineMs =
    !hasWindowsTaskkillTargets && options.windowsCleanupDeadlineAtMs !== undefined
      ? Math.min(observationDeadlineMs, transportRemainingMs)
      : Math.min(windowsRelativeDeadlineMs, transportRemainingMs);
  const knownIdentities = initialOwnership.knownIdentities;

  return await new Promise<ProcessTreeTerminationResult>((resolve) => {
    let settled = false;
    let tracked = initialOwnership.currentIdentities;
    let unverifiedRootPid =
      initialOwnership.childStillOwned && !tracked.some((identity) => identity.pid === child.pid)
        ? child.pid
        : undefined;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let forceWaitTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanupDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let treePollTimer: ReturnType<typeof setInterval> | undefined;

    function childExited(): boolean {
      return child.exitCode !== null || child.signalCode !== null;
    }

    function alive(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    function debug(message: string, context?: unknown): void {
      options.log?.debug?.(options.traceId, message, context);
    }

    function warn(message: string): void {
      options.log?.warn(options.traceId, message);
    }

    function cleanup(): void {
      child.off?.("exit", onExit);
      if (forceTimer) clearTimeout(forceTimer);
      if (forceWaitTimer) clearTimeout(forceWaitTimer);
      if (cleanupDeadlineTimer) clearTimeout(cleanupDeadlineTimer);
      if (treePollTimer) clearInterval(treePollTimer);
      forceTimer = undefined;
      forceWaitTimer = undefined;
      cleanupDeadlineTimer = undefined;
      treePollTimer = undefined;
    }

    function settle(remainingPids: number[] = []): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ remainingPids });
    }

    function settleIfTreeExited(): void {
      const trackedAlive = tracked.some((identity) => alive(identity.pid));
      const unverifiedRootAlive =
        unverifiedRootPid !== undefined && !childExited() && alive(unverifiedRootPid);
      if (trackedAlive || unverifiedRootAlive) return;
      if (isWindows && !childExited()) return;
      settle();
    }

    function startPolling(): void {
      if (treePollTimer || settled) return;
      treePollTimer = setInterval(settleIfTreeExited, 25);
    }

    function collectRemaining(): number[] {
      const remainingPids = tracked
        .filter((identity) => alive(identity.pid))
        .map((identity) => identity.pid);
      if (unverifiedRootPid !== undefined && !childExited() && alive(unverifiedRootPid)) {
        remainingPids.push(unverifiedRootPid);
      }
      return remainingPids;
    }

    function onExit(): void {
      unverifiedRootPid = undefined;
      settleIfTreeExited();
      if (!settled) startPolling();
    }

    function scheduleForceWait(): void {
      if (forceWaitTimer || settled) return;
      if (waitAfterForceMs === 0) {
        settle(collectRemaining());
        return;
      }
      forceWaitTimer = setTimeout(() => {
        const remainingPids = collectRemaining();
        if (remainingPids.length > 0) {
          warn(`runtime 进程树强制回收后仍有残留 pid=${remainingPids.join(",")}`);
        }
        settle(remainingPids);
      }, waitAfterForceMs);
    }

    function scheduleWindowsDeadline(): void {
      if (!isWindows || cleanupDeadlineTimer || settled) return;
      debug("Windows runtime 进程树 cleanup deadline scheduled", {
        forceAfterMs,
        hasWindowsTaskkillTargets,
        waitAfterForceMs,
        windowsRelativeDeadlineMs,
        windowsTaskkillBudgetMs,
        windowsCleanupDeadlineMs,
        windowsCleanupDeadlineAtMs: options.windowsCleanupDeadlineAtMs,
      });
      cleanupDeadlineTimer = setTimeout(() => {
        const remainingPids = collectRemaining();
        if (remainingPids.length > 0) {
          warn(`runtime 进程树绝对 deadline 后仍有残留 pid=${remainingPids.join(",")}`);
        }
        settle(remainingPids);
      }, windowsCleanupDeadlineMs);
    }

    function onForceCleanup(result: ForceCleanupResult): void {
      debug("Windows runtime 进程树 force cleanup completed", {
        trackedPids: result.identities.map((identity) => identity.pid),
        unverifiedRootPid: result.unverifiedRootPid,
      });
      tracked = result.identities;
      unverifiedRootPid = result.unverifiedRootPid;
      settleIfTreeExited();
      if (!settled) {
        startPolling();
        if (!isWindows) scheduleForceWait();
      }
    }

    child.once("exit", onExit);
    const waitOptions: WaitInternalOptions = {
      ...options,
      forceAfterMs,
      keepForceTimerRef: true,
      knownIdentities,
      resolvedOwnership: initialOwnership,
      onForceCleanup,
      onForceTimerScheduled(timer) {
        forceTimer = timer;
      },
      onGracefulCleanupScheduled(flight) {
        void flight.then(() => {
          debug("Windows runtime 进程树 graceful cleanup flight settled");
          settleIfTreeExited();
          if (!settled) startPolling();
        });
      },
    };
    scheduleWindowsDeadline();
    terminateProcessTree(child, waitOptions);
    settleIfTreeExited();
    if (!settled && childExited()) startPolling();
  });
}
