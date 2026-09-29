// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  authorityHasGeneration,
  decodeAtomicMarker,
  ownedStagePath,
  pathsForAtomicTarget,
  type AtomicMarker,
  type AtomicPaths,
  type ReadableAtomicMarker,
} from "./atomic-protocol.js";
import { atomicOwnerIsAlive, forgetAtomicOutcome, localAtomicOutcome } from "./atomic-owner.js";

interface RecoveryWalk {
  paths: Set<string>;
  cycle: boolean;
}

function readMarker(path: string): ReadableAtomicMarker | undefined {
  try {
    return decodeAtomicMarker(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

function remove(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

function finishMarker(paths: AtomicPaths, marker: ReadableAtomicMarker | undefined): void {
  if (marker) {
    const stage = ownedStagePath(paths, marker.stageName);
    if (stage) remove(stage);
  }
  remove(paths.marker);
  if (marker?.version === 2) forgetAtomicOutcome(paths, marker.transactionId);
}

function selectLiveGeneration(
  paths: AtomicPaths,
  marker: AtomicMarker,
  committed: boolean,
): string {
  if (marker.mode === "coordinated" && committed) return paths.target;
  if (existsSync(paths.backup)) return paths.backup;
  return marker.hadTarget && existsSync(paths.target) ? paths.target : paths.backup;
}

function completeStandalone(paths: AtomicPaths): void {
  if (!existsSync(paths.backup)) return;
  if (existsSync(paths.target)) remove(paths.backup);
  else renameSync(paths.backup, paths.target);
}

function restoreUncommitted(paths: AtomicPaths, hadTarget: boolean): void {
  if (existsSync(paths.backup)) {
    remove(paths.target);
    renameSync(paths.backup, paths.target);
  } else if (!hadTarget) {
    remove(paths.target);
  }
}

function isPublished(marker: AtomicMarker, walk: RecoveryWalk): boolean {
  if (marker.mode !== "coordinated" || !marker.authorityPath) return false;
  const authority = resolve(marker.authorityPath);
  if (walk.paths.has(authority)) {
    walk.cycle = true;
    return false;
  }
  const visible = recover(authority, walk, false);
  if (walk.cycle) return false;
  try {
    return authorityHasGeneration(JSON.parse(readFileSync(visible, "utf8")), marker.transactionId);
  } catch {
    return false;
  }
}

function recover(targetPath: string, walk: RecoveryWalk, root: boolean): string {
  const paths = pathsForAtomicTarget(targetPath);
  if (walk.paths.has(paths.target)) {
    walk.cycle = true;
    return paths.target;
  }
  walk.paths.add(paths.target);
  try {
    if (!existsSync(paths.marker) && !existsSync(paths.backup)) return paths.target;
    const marker = readMarker(paths.marker);
    if (marker?.version !== 2) {
      completeStandalone(paths);
      finishMarker(paths, marker);
      return paths.target;
    }

    const outcome = localAtomicOutcome(paths, marker);
    if (outcome) {
      // The operation already completed its directory changes. In particular,
      // rollback of a first installation must not resurrect a leftover backup.
      if (outcome === "finalized" || marker.hadTarget) completeStandalone(paths);
      else remove(paths.backup);
      finishMarker(paths, marker);
      return paths.target;
    }

    const committed = isPublished(marker, walk);
    if (atomicOwnerIsAlive(marker) || (walk.cycle && !root)) {
      return selectLiveGeneration(paths, marker, committed);
    }
    if (marker.mode === "coordinated" && !committed) {
      restoreUncommitted(paths, marker.hadTarget);
    } else {
      completeStandalone(paths);
    }
    finishMarker(paths, marker);
    return paths.target;
  } finally {
    walk.paths.delete(paths.target);
  }
}

export function recoverAtomicTargetSync(targetPath: string): string {
  return recover(targetPath, { paths: new Set(), cycle: false }, true);
}
