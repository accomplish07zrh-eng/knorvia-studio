// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  assertAtomicNotAborted,
  atomicBusyError,
  pathsForAtomicTarget,
  type AtomicMarker,
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

export { recoverAtomicTargetSync } from "./atomic-recovery.js";
export { writeFileAtomically } from "./atomic-file.js";

export interface AtomicDirectoryActivation {
  transactionId: string;
  finalize: () => Promise<void>;
  rollback: () => Promise<void>;
}

export async function activateDirectoryAtomically(input: {
  authorityPath?: string;
  prepare?: (stagedPath: string) => Promise<void>;
  signal?: AbortSignal;
  sourcePath?: string;
  targetPath: string;
}): Promise<AtomicDirectoryActivation> {
  const paths = pathsForAtomicTarget(input.targetPath);
  assertAtomicNotAborted(input.signal);
  assertAtomicTargetUnreserved(paths);
  recoverAtomicTargetSync(paths.target);
  if (existsSync(paths.marker)) throw atomicBusyError(paths.target);
  await mkdir(paths.parent, { recursive: true });
  const stage = await mkdtemp(join(paths.parent, paths.stagePrefix));
  const content = join(stage, "content");
  const cleanupStage = () => rm(stage, { recursive: true, force: true });
  let release: (() => void) | undefined;
  let marker: AtomicMarker | undefined;
  let markerOwned = false;
  let oldMoved = false;
  let newMoved = false;

  const restoreBeforePublication = async () => {
    if (oldMoved) {
      await rm(paths.target, { recursive: true, force: true });
      await rename(paths.backup, paths.target);
      oldMoved = false;
    } else if (newMoved && marker && !marker.hadTarget) {
      await rm(paths.target, { recursive: true, force: true });
    }
    newMoved = false;
  };

  const removeOwnedResidue = async () => {
    if (!markerOwned || !marker) return;
    await cleanupPluginSourceBestEffort(() => rm(paths.backup, { recursive: true, force: true }));
    await cleanupPluginSourceBestEffort(() => rm(paths.marker, { force: true }));
    await cleanupPluginSourceBestEffort(cleanupStage);
    if (!existsSync(paths.marker)) forgetAtomicOutcome(paths, marker.transactionId);
  };

  try {
    if (input.sourcePath) await cp(input.sourcePath, content, { recursive: true, force: true });
    else await mkdir(content, { recursive: true });
    await input.prepare?.(content);
    assertAtomicNotAborted(input.signal);
    release = reserveAtomicTarget(paths);
    recoverAtomicTargetSync(paths.target);
    if (existsSync(paths.marker)) throw atomicBusyError(paths.target);
    marker = {
      version: 2,
      stageName: basename(stage),
      transactionId: randomUUID(),
      ownerId: atomicOwnerId,
      ownerPid: process.pid,
      hadTarget: existsSync(paths.target),
      mode: input.authorityPath ? "coordinated" : "standalone",
      ...(input.authorityPath ? { authorityPath: input.authorityPath } : {}),
    };
    try {
      await writeFile(paths.marker, JSON.stringify(marker) + "\n", { flag: "wx" });
      markerOwned = true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw atomicBusyError(paths.target);
      }
      throw error;
    }
    // From marker publication through the two renames, cancellation cannot
    // interrupt the on-disk generation transition.
    if (marker.hadTarget) {
      await rename(paths.target, paths.backup);
      oldMoved = true;
    }
    await rename(content, paths.target);
    newMoved = true;
  } catch (primary) {
    let cleanupFailure: unknown;
    if (markerOwned && marker) {
      try {
        await restoreBeforePublication();
        rememberAtomicOutcome(paths, marker.transactionId, "rolled-back");
        await removeOwnedResidue();
      } catch (error) {
        cleanupFailure = error;
      }
    }
    const stageFailure = await cleanupPluginSourceBestEffort(cleanupStage);
    release?.();
    throw appendPluginSourceCleanupError(primary, cleanupFailure ?? stageFailure);
  }

  const transaction = marker;
  const releaseReservation = release;
  let settlement: Promise<void> | undefined;
  let completed = false;
  const settle = (outcome: "finalized" | "rolled-back"): Promise<void> => {
    if (settlement) return settlement;
    if (completed) return Promise.resolve();
    settlement = (async () => {
      if (outcome === "rolled-back") await restoreBeforePublication();
      completed = true;
      rememberAtomicOutcome(paths, transaction.transactionId, outcome);
      try {
        await removeOwnedResidue();
      } finally {
        releaseReservation();
      }
    })().catch((error: unknown) => {
      settlement = undefined;
      throw error;
    });
    return settlement;
  };
  return {
    transactionId: transaction.transactionId,
    finalize: () => settle("finalized"),
    rollback: () => settle("rolled-back"),
  };
}
