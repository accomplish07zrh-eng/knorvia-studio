// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  atomicBusyError,
  pathsForAtomicTarget,
  type AtomicMarker,
  type AtomicPaths,
} from "./atomic-protocol.js";
import {
  assertAtomicTargetUnreserved,
  atomicOwnerId,
  forgetAtomicOutcome,
  rememberAtomicOutcome,
  reserveAtomicTarget,
} from "./atomic-owner.js";
import { recoverAtomicTargetSync } from "./atomic-recovery.js";
import { appendPluginSourceCleanupError, cleanupPluginSourceBestEffort } from "./helpers.js";

function checkTarget(paths: AtomicPaths): void {
  assertAtomicTargetUnreserved(paths);
  recoverAtomicTargetSync(paths.target);
  if (existsSync(paths.marker)) throw atomicBusyError(paths.target);
}

function overwriteUnavailable(error: unknown, paths: AtomicPaths): boolean {
  if (
    !existsSync(paths.target) ||
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  )
    return false;
  return (
    error.code === "EPERM" ||
    error.code === "EACCES" ||
    error.code === "EEXIST" ||
    error.code === "ENOTEMPTY"
  );
}

function newFileMarker(paths: AtomicPaths, stage: string): AtomicMarker {
  return {
    version: 2,
    stageName: basename(stage),
    transactionId: randomUUID(),
    ownerId: atomicOwnerId,
    ownerPid: process.pid,
    hadTarget: existsSync(paths.target),
    mode: "standalone",
  };
}

function lockFailure(error: unknown, paths: AtomicPaths): unknown {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
    ? atomicBusyError(paths.target)
    : error;
}

export async function writeFileAtomically(path: string, data: string | Uint8Array): Promise<void> {
  const paths = pathsForAtomicTarget(path);
  checkTarget(paths);
  await mkdir(paths.parent, { recursive: true });
  const release = reserveAtomicTarget(paths);
  const stage = join(paths.parent, paths.stagePrefix + randomUUID());
  let journal: AtomicMarker | undefined;
  let movedOld = false;
  let completed = false;
  let primary: unknown;
  let failed = false;
  try {
    await writeFile(stage, data, { flag: "wx" });
    const marker = newFileMarker(paths, stage);
    try {
      await writeFile(paths.marker, JSON.stringify(marker) + "\n", { flag: "wx" });
    } catch (markerError) {
      throw lockFailure(markerError, paths);
    }
    journal = marker;
    try {
      await rename(stage, paths.target);
      completed = true;
    } catch (error) {
      if (!overwriteUnavailable(error, paths)) throw error;
      if (marker.hadTarget) {
        await rename(paths.target, paths.backup);
        movedOld = true;
      }
      await rename(stage, paths.target);
      completed = true;
    }
    rememberAtomicOutcome(paths, marker.transactionId, "finalized");
  } catch (error) {
    failed = true;
    primary = error;
    let restored = true;
    if (movedOld) {
      try {
        await rm(paths.target, { recursive: true, force: true });
        await rename(paths.backup, paths.target);
      } catch (restoreError) {
        restored = false;
        primary = appendPluginSourceCleanupError(primary, restoreError);
      }
    }
    if (journal && restored) {
      rememberAtomicOutcome(paths, journal.transactionId, "rolled-back");
      completed = true;
    }
  } finally {
    if (journal && completed) {
      await cleanupPluginSourceBestEffort(() => rm(paths.backup, { recursive: true, force: true }));
      await cleanupPluginSourceBestEffort(() => rm(paths.marker, { force: true }));
      if (!existsSync(paths.marker)) forgetAtomicOutcome(paths, journal.transactionId);
    }
    const stageFailure = await cleanupPluginSourceBestEffort(() => rm(stage, { force: true }));
    if (failed) primary = appendPluginSourceCleanupError(primary, stageFailure);
    release();
  }
  if (failed) throw primary;
}

function bestEffortSync(remove: () => void): void {
  try {
    remove();
  } catch {
    // A settled generation remains valid. The same recovery journal owns any
    // residue, including a marker that could not be deleted on this attempt.
  }
}

export function writeFileAtomicallySync(path: string, data: string | Uint8Array): void {
  const paths = pathsForAtomicTarget(path);
  checkTarget(paths);
  mkdirSync(paths.parent, { recursive: true });
  const release = reserveAtomicTarget(paths);
  const stage = join(paths.parent, paths.stagePrefix + randomUUID());
  let journal: AtomicMarker | undefined;
  let movedOld = false;
  let completed = false;
  let primary: unknown;
  let failed = false;
  try {
    writeFileSync(stage, data, { flag: "wx" });
    const marker = newFileMarker(paths, stage);
    try {
      writeFileSync(paths.marker, JSON.stringify(marker) + "\n", { flag: "wx" });
    } catch (markerError) {
      throw lockFailure(markerError, paths);
    }
    journal = marker;
    try {
      renameSync(stage, paths.target);
      completed = true;
    } catch (error) {
      if (!overwriteUnavailable(error, paths)) throw error;
      if (marker.hadTarget) {
        renameSync(paths.target, paths.backup);
        movedOld = true;
      }
      renameSync(stage, paths.target);
      completed = true;
    }
    rememberAtomicOutcome(paths, marker.transactionId, "finalized");
  } catch (error) {
    failed = true;
    primary = error;
    let restored = true;
    if (movedOld) {
      try {
        rmSync(paths.target, { recursive: true, force: true });
        renameSync(paths.backup, paths.target);
      } catch (restoreError) {
        restored = false;
        primary = appendPluginSourceCleanupError(primary, restoreError);
      }
    }
    if (journal && restored) {
      rememberAtomicOutcome(paths, journal.transactionId, "rolled-back");
      completed = true;
    }
  } finally {
    if (journal && completed) {
      bestEffortSync(() => rmSync(paths.backup, { recursive: true, force: true }));
      bestEffortSync(() => rmSync(paths.marker, { force: true }));
      if (!existsSync(paths.marker)) forgetAtomicOutcome(paths, journal.transactionId);
    }
    bestEffortSync(() => rmSync(stage, { force: true }));
    release();
  }
  if (failed) throw primary;
}
