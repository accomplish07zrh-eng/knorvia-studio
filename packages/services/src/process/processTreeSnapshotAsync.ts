import type { ChildProcess } from "node:child_process";

import {
  captureExitedRootDescendantsSnapshot,
  captureProcessTreeSnapshot,
  filterCurrentProcessIdentities,
} from "#src/process/processTreeSnapshot.js";

import type {
  ProcessIdentity,
  ProcessTreeSnapshot,
  ProcessTreeTerminatorOptions,
} from "#src/process/processTreeTypes.js";

import { readWindowsProcessListAsync } from "#src/process/windowsProcessListAsync.js";

export { verifyWindowsProcessIdentityAsync } from "#src/process/windowsProcessListAsync.js";

function collectDescendants(
  rootPid: number,
  processes: readonly ProcessIdentity[],
): ProcessIdentity[] {
  const children = new Map<number, ProcessIdentity[]>();
  for (const identity of processes) {
    const siblings = children.get(identity.parentPid);
    if (siblings) {
      siblings.push(identity);
    } else {
      children.set(identity.parentPid, [identity]);
    }
  }

  const seen = new Set<number>([rootPid]);
  const descendants: ProcessIdentity[] = [];
  const pending = [...(children.get(rootPid) ?? [])].reverse();
  while (pending.length > 0) {
    const identity = pending.pop();
    if (!identity || seen.has(identity.pid)) {
      continue;
    }
    seen.add(identity.pid);
    descendants.push(identity);
    const next = children.get(identity.pid);
    if (next) {
      for (const descendant of [...next].reverse()) {
        pending.push(descendant);
      }
    }
  }
  return descendants;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function creationTimeMs(identity: ProcessIdentity): number | undefined {
  const startTime = identity.startTime;
  const prefix = "windows-utc-us:";
  if (!startTime.startsWith(prefix)) {
    return undefined;
  }
  let microseconds: bigint;
  try {
    microseconds = BigInt(startTime.slice(prefix.length));
  } catch {
    return undefined;
  }
  const milliseconds = Number(microseconds / 1000n);
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

function lifecycleCandidates(
  processes: readonly ProcessIdentity[],
  startedAtMs: number,
  exitedAtMs: number,
): ProcessIdentity[] {
  return processes.filter((identity) => {
    const createdAtMs = creationTimeMs(identity);
    return createdAtMs !== undefined && startedAtMs <= createdAtMs && createdAtMs < exitedAtMs;
  });
}

export async function filterCurrentProcessIdentitiesAsync(
  identities: readonly ProcessIdentity[],
  options: ProcessTreeTerminatorOptions,
): Promise<ProcessIdentity[]> {
  if (process.platform !== "win32") {
    return filterCurrentProcessIdentities(identities, options);
  }
  if (identities.length === 0) {
    return [];
  }
  const trackedPids = new Set(identities.map((identity) => identity.pid));
  const current = await readWindowsProcessListAsync(options);
  const currentByPid = new Map<number, ProcessIdentity>();
  for (const identity of current) {
    if (trackedPids.has(identity.pid)) {
      currentByPid.set(identity.pid, identity);
    }
  }
  return identities.filter(
    (identity) => currentByPid.get(identity.pid)?.startTime === identity.startTime,
  );
}

export async function captureProcessTreeSnapshotAsync(
  child: ChildProcess,
  options: ProcessTreeTerminatorOptions = {},
): Promise<ProcessTreeSnapshot | undefined> {
  if (process.platform !== "win32") {
    return captureProcessTreeSnapshot(child, options);
  }
  if (child.pid == null) {
    return undefined;
  }
  const queryOptions = options;
  const processes = await readWindowsProcessListAsync(queryOptions);
  const childObservedExited = child.exitCode !== null || child.signalCode !== null;
  const exitedAtMs =
    queryOptions.ownedProcessExitedAtMs ?? queryOptions.resolveOwnedProcessExitedAtMs?.();
  const root = processes.find((identity) => identity.pid === child.pid);

  if (root && !childObservedExited) {
    const descendants = collectDescendants(child.pid, processes);
    const identities = [root, ...descendants];
    return {
      rootPid: child.pid,
      descendantPids: identities
        .filter((identity) => identity.pid !== child.pid)
        .map((identity) => identity.pid),
      identities,
    };
  }

  const startedAtMs = queryOptions.ownedProcessStartedAtMs;
  if (!isFiniteNumber(startedAtMs) || !isFiniteNumber(exitedAtMs)) {
    return undefined;
  }
  const candidates = lifecycleCandidates(processes, startedAtMs, exitedAtMs);
  const descendants = collectDescendants(child.pid, candidates);
  if (descendants.length === 0) {
    return undefined;
  }
  return {
    rootPid: child.pid,
    descendantPids: descendants
      .filter((identity) => identity.pid !== child.pid)
      .map((identity) => identity.pid),
    identities: descendants,
  };
}

export async function captureExitedRootDescendantsSnapshotAsync(
  rootPid: number,
  options: ProcessTreeTerminatorOptions = {},
): Promise<ProcessTreeSnapshot | undefined> {
  if (process.platform !== "win32") {
    return captureExitedRootDescendantsSnapshot(rootPid, options);
  }
  const queryOptions = options;
  const startedAtMs = queryOptions.ownedProcessStartedAtMs;
  const exitedAtMs = queryOptions.ownedProcessExitedAtMs;
  if (
    !Number.isInteger(rootPid) ||
    rootPid <= 0 ||
    !isFiniteNumber(startedAtMs) ||
    !isFiniteNumber(exitedAtMs)
  ) {
    return undefined;
  }
  const processes = await readWindowsProcessListAsync(queryOptions);
  const candidates = lifecycleCandidates(processes, startedAtMs, exitedAtMs);
  const descendants = collectDescendants(rootPid, candidates);
  if (descendants.length === 0) {
    return undefined;
  }
  return {
    rootPid,
    descendantPids: descendants.map((identity) => identity.pid),
    identities: descendants,
  };
}
