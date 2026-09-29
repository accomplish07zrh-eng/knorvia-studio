// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { DEFAULT_PLUGIN_MARKETPLACES } from "@knorvia/shared";
import { changeKnownRecordsSync } from "./catalog-repository.js";
import type { KnownMarketplaceRecord, MarketplaceSource } from "./catalog-types.js";

function defaultSource(value: string): MarketplaceSource {
  const source = value.trim();
  if (source.includes("/") && !source.includes(":")) {
    const separator = Math.max(source.lastIndexOf("#"), source.lastIndexOf("@"));
    const repo = separator < 0 ? source : source.slice(0, separator);
    const ref = separator < 0 ? "" : source.slice(separator + 1);
    return { source: "github", repo, ...(ref ? { ref } : {}) };
  }
  return { source: "url", url: source };
}

export function ensureDefaultPluginMarketplaces(storageRoot: string): KnownMarketplaceRecord[] {
  return changeKnownRecordsSync(storageRoot, (known) => {
    const present = new Set(known.map((record) => record.id));
    const missing = DEFAULT_PLUGIN_MARKETPLACES.filter((record) => !present.has(record.id));
    if (!missing.length) return known;
    const addedAt = new Date().toISOString();
    return [
      ...known,
      ...missing.map(
        (record): KnownMarketplaceRecord => ({
          id: record.id,
          source: defaultSource(record.source),
          name: record.name,
          description: record.description,
          addedAt,
          ...(record.lastUpdated ? { lastUpdated: record.lastUpdated } : {}),
          pluginCount: record.pluginCount,
        }),
      ),
    ];
  });
}
