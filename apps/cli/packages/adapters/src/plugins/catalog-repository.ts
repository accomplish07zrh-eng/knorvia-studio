// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicBusyError } from "./atomic-protocol.js";
import { recoverAtomicTargetSync, writeFileAtomically } from "./atomic-directory.js";
import { writeFileAtomicallySync } from "./atomic-file.js";
import {
  decodeInstalledPluginRecords,
  decodeKnownMarketplaceRecords,
  encodeInstalledPluginRecords,
  encodeKnownMarketplaceRecords,
} from "./catalog-records.js";
import type { InstalledPluginRecord, KnownMarketplaceRecord } from "./catalog-types.js";
import { sanitizePluginId } from "./helpers.js";

const pendingWrites = new Map<string, Promise<void>>();
const activeWrites = new Set<string>();

export function knownAuthorityPath(storageRoot: string): string {
  return resolve(storageRoot, "known_marketplaces.json");
}

export function installedAuthorityPath(storageRoot: string): string {
  return resolve(storageRoot, "installed_plugins.json");
}

export function marketplaceDirectory(storageRoot: string, id: string): string {
  return resolve(storageRoot, "marketplaces", sanitizePluginId(id));
}

export function pluginCacheDirectory(
  storageRoot: string,
  marketplace: string,
  name: string,
  version: string,
): string {
  return resolve(storageRoot, "cache", ...[marketplace, name, version].map(sanitizePluginId));
}

export function getPluginDataDir(storageRoot: string, pluginId: string): string {
  return join(storageRoot, "data", sanitizePluginId(pluginId));
}

function readAuthority(path: string): unknown {
  // Recovery failures carry state-integrity meaning; only JSON reading has the
  // historical empty-state fallback.
  const visible = recoverAtomicTargetSync(path);
  try {
    return JSON.parse(readFileSync(visible, "utf8"));
  } catch {
    return undefined;
  }
}

export function loadKnownMarketplacesSync(storageRoot: string): KnownMarketplaceRecord[] {
  return decodeKnownMarketplaceRecords(readAuthority(knownAuthorityPath(storageRoot)));
}

export function listInstalledPluginRecords(storageRoot: string): InstalledPluginRecord[] {
  return decodeInstalledPluginRecords(readAuthority(installedAuthorityPath(storageRoot)));
}

export function resolveInstalledPluginRoot(
  _storageRoot: string,
  record: InstalledPluginRecord,
): string {
  return recoverAtomicTargetSync(record.installPath);
}

async function serializeAuthority<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const predecessor = pendingWrites.get(path) ?? Promise.resolve();
  let unlock!: () => void;
  const ticket = new Promise<void>((done) => {
    unlock = done;
  });
  pendingWrites.set(path, ticket);
  await predecessor;
  activeWrites.add(path);
  try {
    return await operation();
  } finally {
    activeWrites.delete(path);
    if (pendingWrites.get(path) === ticket) pendingWrites.delete(path);
    unlock();
  }
}

export async function changeKnownRecords<T>(
  storageRoot: string,
  edit: (records: KnownMarketplaceRecord[]) => {
    records: KnownMarketplaceRecord[];
    result: T;
    write?: boolean;
  },
): Promise<T> {
  const path = knownAuthorityPath(storageRoot);
  return serializeAuthority(path, async () => {
    const change = edit(loadKnownMarketplacesSync(storageRoot));
    if (change.write !== false)
      await writeFileAtomically(path, encodeKnownMarketplaceRecords(change.records));
    return change.result;
  });
}

export async function changeInstalledRecords<T>(
  storageRoot: string,
  edit: (records: InstalledPluginRecord[]) => {
    records: InstalledPluginRecord[];
    result: T;
    write?: boolean;
  },
): Promise<T> {
  const path = installedAuthorityPath(storageRoot);
  return serializeAuthority(path, async () => {
    const change = edit(listInstalledPluginRecords(storageRoot));
    if (change.write !== false)
      await writeFileAtomically(path, encodeInstalledPluginRecords(change.records));
    return change.result;
  });
}

export function changeKnownRecordsSync(
  storageRoot: string,
  edit: (records: KnownMarketplaceRecord[]) => KnownMarketplaceRecord[],
): KnownMarketplaceRecord[] {
  const path = knownAuthorityPath(storageRoot);
  if (activeWrites.has(path) || pendingWrites.has(path)) throw atomicBusyError(path);
  const previous = loadKnownMarketplacesSync(storageRoot);
  const next = edit(previous);
  if (next !== previous) writeFileAtomicallySync(path, encodeKnownMarketplaceRecords(next));
  return next;
}
