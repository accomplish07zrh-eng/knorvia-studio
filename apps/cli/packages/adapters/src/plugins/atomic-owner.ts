// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { atomicBusyError, type AtomicMarker, type AtomicPaths } from "./atomic-protocol.js";

export const atomicOwnerId = randomUUID();
const activeTargets = new Set<string>();
const completedTargets = new Map<
  string,
  { transactionId: string; outcome: "finalized" | "rolled-back" }
>();

export function reserveAtomicTarget(paths: AtomicPaths): () => void {
  if (activeTargets.has(paths.target)) throw atomicBusyError(paths.target);
  activeTargets.add(paths.target);
  return () => activeTargets.delete(paths.target);
}

export function assertAtomicTargetUnreserved(paths: AtomicPaths): void {
  if (activeTargets.has(paths.target)) throw atomicBusyError(paths.target);
}

export function rememberAtomicOutcome(
  paths: AtomicPaths,
  transactionId: string,
  outcome: "finalized" | "rolled-back",
): void {
  completedTargets.set(paths.target, { transactionId, outcome });
}

export function localAtomicOutcome(
  paths: AtomicPaths,
  marker: AtomicMarker,
): "finalized" | "rolled-back" | undefined {
  if (marker.ownerPid !== process.pid || marker.ownerId !== atomicOwnerId) return undefined;
  const completed = completedTargets.get(paths.target);
  return completed?.transactionId === marker.transactionId ? completed.outcome : undefined;
}

export function forgetAtomicOutcome(paths: AtomicPaths, transactionId: string): void {
  if (completedTargets.get(paths.target)?.transactionId === transactionId) {
    completedTargets.delete(paths.target);
  }
}

export function atomicOwnerIsAlive(marker: AtomicMarker): boolean {
  if (marker.ownerPid === process.pid) return marker.ownerId === atomicOwnerId;
  try {
    process.kill(marker.ownerPid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}
