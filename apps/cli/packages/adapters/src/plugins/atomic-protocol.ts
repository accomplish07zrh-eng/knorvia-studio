// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface AtomicPaths {
  target: string;
  parent: string;
  marker: string;
  backup: string;
  stagePrefix: string;
}

export interface LegacyAtomicMarker {
  version: 1;
  stageName: string;
}

export interface AtomicMarker {
  version: 2;
  stageName: string;
  transactionId: string;
  ownerId: string;
  ownerPid: number;
  hadTarget: boolean;
  mode: "coordinated" | "standalone";
  authorityPath?: string;
}

export type ReadableAtomicMarker = LegacyAtomicMarker | AtomicMarker;

export function pathsForAtomicTarget(target: string): AtomicPaths {
  const canonical = resolve(target);
  const parent = dirname(canonical);
  const name = basename(canonical);
  return {
    target: canonical,
    parent,
    marker: join(parent, `.${name}.transaction.json`),
    backup: join(parent, `.${name}.backup`),
    stagePrefix: `.${name}.stage-`,
  };
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decodeAtomicMarker(value: unknown): ReadableAtomicMarker | undefined {
  if (!objectRecord(value) || typeof value.stageName !== "string") return undefined;
  if (value.version === 1) return { version: 1, stageName: value.stageName };
  if (
    value.version !== 2 ||
    typeof value.transactionId !== "string" ||
    typeof value.ownerId !== "string" ||
    typeof value.ownerPid !== "number" ||
    !Number.isSafeInteger(value.ownerPid) ||
    value.ownerPid <= 0 ||
    typeof value.hadTarget !== "boolean" ||
    (value.mode !== "coordinated" && value.mode !== "standalone") ||
    (value.authorityPath !== undefined && typeof value.authorityPath !== "string")
  ) {
    return undefined;
  }
  return {
    version: 2,
    stageName: value.stageName,
    transactionId: value.transactionId,
    ownerId: value.ownerId,
    ownerPid: value.ownerPid,
    hadTarget: value.hadTarget,
    mode: value.mode,
    ...(typeof value.authorityPath === "string" ? { authorityPath: value.authorityPath } : {}),
  };
}

export function ownedStagePath(paths: AtomicPaths, stageName: string): string | undefined {
  if (
    !stageName.startsWith(paths.stagePrefix) ||
    stageName.length === paths.stagePrefix.length ||
    stageName.includes("/") ||
    stageName.includes("\\") ||
    stageName.includes("\0") ||
    isAbsolute(stageName) ||
    basename(stageName) !== stageName
  ) {
    return undefined;
  }
  const stage = resolve(paths.parent, stageName);
  const inside = relative(paths.parent, stage);
  if (
    !inside ||
    inside === ".." ||
    inside.startsWith("../") ||
    inside.startsWith("..\\") ||
    isAbsolute(inside)
  ) {
    return undefined;
  }
  return stage;
}

export function authorityHasGeneration(value: unknown, transactionId: string): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else {
      const record = current as Record<string, unknown>;
      if (record.cacheTransactionId === transactionId) return true;
      for (const nested of Object.values(record)) pending.push(nested);
    }
  }
  return false;
}

export function assertAtomicNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Plugin operation cancelled");
  error.name = "AbortError";
  throw error;
}

export function atomicBusyError(target: string): Error {
  return new Error(`Atomic directory activation is already active: ${target}`);
}
