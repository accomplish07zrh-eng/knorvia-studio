import type { ChildProcess } from "node:child_process";
import {
  captureProcessTreeSnapshot,
  filterCurrentProcessIdentities,
} from "#src/process/processTreeSnapshot.js";
import {
  captureProcessTreeSnapshotAsync,
  filterCurrentProcessIdentitiesAsync,
} from "#src/process/processTreeSnapshotAsync.js";
import type {
  ProcessIdentity,
  ProcessTreeOwnershipResolution,
  ProcessTreeTerminatorOptions,
} from "#src/process/processTreeTypes.js";

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function sameIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    left.startTime === right.startTime &&
    left.processGroupId === right.processGroupId
  );
}

function mergeIdentities(
  known: readonly ProcessIdentity[],
  fresh: readonly ProcessIdentity[],
): ProcessIdentity[] {
  const identities = new Map<number, ProcessIdentity>();
  for (const identity of known) identities.set(identity.pid, identity);
  for (const identity of fresh) identities.set(identity.pid, identity);
  return [...identities.values()];
}

function resolveUnownedIdentities(
  knownIdentities: readonly ProcessIdentity[],
  options: ProcessTreeTerminatorOptions,
): ProcessTreeOwnershipResolution {
  return {
    childStillOwned: false,
    currentIdentities: filterCurrentProcessIdentities(knownIdentities, options),
    knownIdentities: [...knownIdentities],
  };
}

export function resolveCurrentOwnedIdentities(
  child: ChildProcess,
  knownIdentities: readonly ProcessIdentity[],
  options: ProcessTreeTerminatorOptions,
  allowRootDiscovery = true,
): ProcessTreeOwnershipResolution {
  const rootPid = child.pid!;
  const knownRoot = knownIdentities.find((identity) => identity.pid === rootPid);

  if (hasExited(child)) return resolveUnownedIdentities(knownIdentities, options);

  if (knownRoot) {
    const verifiedRoot = filterCurrentProcessIdentities([knownRoot], options);
    if (verifiedRoot.length !== 1) {
      return resolveUnownedIdentities(knownIdentities, options);
    }
  } else if (!allowRootDiscovery) {
    return { childStillOwned: false, currentIdentities: [], knownIdentities: [] };
  }

  const snapshot = hasExited(child) ? null : captureProcessTreeSnapshot(child, options);
  const freshIdentities = snapshot ? [...snapshot.identities] : [];
  const freshRoot = freshIdentities.find((identity) => identity.pid === rootPid);

  if (!knownRoot && !freshRoot) {
    return { childStillOwned: false, currentIdentities: [], knownIdentities: [] };
  }
  if (knownRoot && freshRoot && !sameIdentity(knownRoot, freshRoot)) {
    return resolveUnownedIdentities(knownIdentities, options);
  }

  const mergedIdentities = mergeIdentities(knownIdentities, freshRoot ? freshIdentities : []);
  const currentIdentities = filterCurrentProcessIdentities(mergedIdentities, options);
  return {
    childStillOwned: currentIdentities.some((identity) => identity.pid === rootPid),
    currentIdentities,
    knownIdentities: mergedIdentities,
  };
}

export async function resolveCurrentOwnedIdentitiesAsync(
  child: ChildProcess,
  knownIdentities: readonly ProcessIdentity[],
  options: ProcessTreeTerminatorOptions,
  allowRootDiscovery = true,
): Promise<ProcessTreeOwnershipResolution> {
  if (process.platform !== "win32") {
    return resolveCurrentOwnedIdentities(child, knownIdentities, options, allowRootDiscovery);
  }

  const rootPid = child.pid!;
  const knownRoot = knownIdentities.find((identity) => identity.pid === rootPid);

  if (hasExited(child)) {
    const anyKnownProcessAlive = knownIdentities.some((identity) => {
      try {
        process.kill(identity.pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    const currentIdentities = anyKnownProcessAlive
      ? await filterCurrentProcessIdentitiesAsync(knownIdentities, options)
      : [];
    return {
      childStillOwned: false,
      currentIdentities,
      knownIdentities: [...knownIdentities],
    };
  }

  if (knownRoot) {
    const currentIdentities = await filterCurrentProcessIdentitiesAsync(knownIdentities, options);
    return {
      childStillOwned: currentIdentities.some((identity) => identity.pid === rootPid),
      currentIdentities,
      knownIdentities: [...knownIdentities],
    };
  }

  if (!allowRootDiscovery) {
    return { childStillOwned: false, currentIdentities: [], knownIdentities: [] };
  }

  const snapshot = await captureProcessTreeSnapshotAsync(child, options);
  const freshIdentities = snapshot ? [...snapshot.identities] : [];
  if (freshIdentities.some((identity) => identity.pid === rootPid)) {
    return {
      childStillOwned: true,
      currentIdentities: freshIdentities,
      knownIdentities: freshIdentities,
    };
  }
  return { childStillOwned: false, currentIdentities: [], knownIdentities: [] };
}
