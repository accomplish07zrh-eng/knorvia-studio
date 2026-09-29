// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginMarketplaceEntry, PluginMarketplaceManifest } from "./catalog-types.js";
import { parseEntryStoreListing } from "./catalog-listing.js";
import { isRecord } from "./helpers.js";
import { validPluginName } from "./plugin-document.js";

const normalizedManifests = new WeakSet<object>();

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function dependency(value: unknown): string | undefined {
  if (typeof value === "string") return value.replace(/@\^[^@]*$/u, "");
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return undefined;
  const name = value.name.trim();
  const marketplace = typeof value.marketplace === "string" ? value.marketplace.trim() : "";
  return marketplace ? `${name}@${marketplace}` : name;
}

function decodeEntry(value: unknown): PluginMarketplaceEntry | undefined {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return undefined;
  const entry: PluginMarketplaceEntry = { name: value.name.trim(), raw: value };
  for (const key of ["description", "version", "cachePath", "category"] as const) {
    if (typeof value[key] === "string") entry[key] = value[key];
  }
  if (value.source !== undefined) entry.source = value.source;
  if (typeof value.strict === "boolean") entry.strict = value.strict;
  const tags = strings(value.tags);
  if (tags) entry.tags = tags;
  if (Array.isArray(value.dependencies)) {
    entry.dependencies = value.dependencies
      .map(dependency)
      .filter((item): item is string => item !== undefined);
  }
  const listing = parseEntryStoreListing(value);
  if (listing) entry.listing = listing;
  return entry;
}

function settingsAsWire(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(isRecord(value.raw) ? value.raw : {}), ...value };
  delete result.raw;
  if (Array.isArray(value.plugins)) {
    result.plugins = value.plugins.map((entry) => {
      if (!isRecord(entry)) return entry;
      const raw = { ...(isRecord(entry.raw) ? entry.raw : {}), ...entry };
      delete raw.raw;
      return raw;
    });
  }
  if (typeof value.pluginRoot === "string") {
    result.metadata = {
      ...(isRecord(result.metadata) ? result.metadata : {}),
      pluginRoot: value.pluginRoot,
    };
  }
  delete result.pluginRoot;
  return result;
}

export function decodeMarketplaceManifest(
  value: unknown,
  settings = false,
): PluginMarketplaceManifest | null {
  if (!isRecord(value)) return null;
  if (normalizedManifests.has(value)) return value as unknown as PluginMarketplaceManifest;
  if (settings) return decodeMarketplaceManifest(settingsAsWire(value));
  if (typeof value.name !== "string") return null;
  const name = value.name.trim();
  if (!validPluginName(name)) return null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  let items: unknown[] = [];
  if (Array.isArray(value.plugins)) items = value.plugins;
  else if (isRecord(value.plugins)) {
    items = Object.entries(value.plugins).map(([key, item]) =>
      isRecord(item) ? { name: key, ...item } : { name: key },
    );
  }
  const plugins = items
    .map(decodeEntry)
    .filter((item): item is PluginMarketplaceEntry => item !== undefined);
  const result: PluginMarketplaceManifest = { name, plugins, raw: value };
  const description =
    typeof value.description === "string" ? value.description : metadata.description;
  if (typeof description === "string") result.description = description;
  const pluginRoot = metadata.pluginRoot;
  if (typeof pluginRoot === "string") result.pluginRoot = pluginRoot;
  const allowed = strings(value.allowCrossMarketplaceDependenciesOn);
  if (allowed) result.allowCrossMarketplaceDependenciesOn = allowed;
  const featured = strings(value.featured)?.filter((item) => item.trim().length > 0);
  if (featured?.length) result.featured = featured;
  normalizedManifests.add(result);
  return result;
}
