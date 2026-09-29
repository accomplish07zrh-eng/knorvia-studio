// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { InstalledPluginRecord, KnownMarketplaceRecord } from "./catalog-types.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return record(value) ? Object.values(value) : [];
}

export function decodeKnownMarketplaceRecords(value: unknown): KnownMarketplaceRecord[] {
  if (!record(value)) return [];
  return collection(value.marketplaces).filter((item): item is KnownMarketplaceRecord => {
    // Historical readers accepted these required fields without validating the
    // remaining metadata. Keep each accepted record intact at this wire boundary.
    return (
      record(item) &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.pluginCount === "number" &&
      record(item.source)
    );
  });
}

function currentInstalledRecord(value: unknown): value is InstalledPluginRecord {
  if (!record(value) || (value.scope !== "user" && value.scope !== "workspace")) return false;
  return ["id", "name", "marketplace", "version", "installPath", "installedAt"].every(
    (field) => typeof value[field] === "string",
  );
}

function legacyInstalledRecord(id: string, value: unknown): InstalledPluginRecord | undefined {
  const split = id.lastIndexOf("@");
  if (split <= 0 || split === id.length - 1 || !record(value)) return undefined;
  if (typeof value.installPath !== "string" || !value.installPath) return undefined;
  return {
    id,
    name: id.slice(0, split),
    marketplace: id.slice(split + 1),
    version: typeof value.version === "string" ? value.version : "0.0.0",
    installPath: value.installPath,
    installedAt:
      typeof value.installedAt === "string" ? value.installedAt : "1970-01-01T00:00:00.000Z",
    ...(typeof value.lastUpdated === "string" ? { updatedAt: value.lastUpdated } : {}),
    scope: value.scope === "project" || value.scope === "local" ? "workspace" : "user",
  };
}

export function decodeInstalledPluginRecords(value: unknown): InstalledPluginRecord[] {
  if (!record(value)) return [];
  const plugins = value.plugins;
  if (Array.isArray(plugins)) return plugins.filter(currentInstalledRecord);
  if (!record(plugins)) return [];
  const result: InstalledPluginRecord[] = [];
  for (const [id, entries] of Object.entries(plugins)) {
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      const accepted = legacyInstalledRecord(id, entry);
      if (accepted) result.push(accepted);
    }
  }
  return result;
}

export function encodeKnownMarketplaceRecords(records: KnownMarketplaceRecord[]): string {
  return JSON.stringify({ version: 1, marketplaces: records }, null, 2) + "\n";
}

export function encodeInstalledPluginRecords(records: InstalledPluginRecord[]): string {
  return JSON.stringify({ version: 1, plugins: records }, null, 2) + "\n";
}
