// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  KNORVIA_INLINE_PLUGIN_MARKETPLACE,
  KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE,
  isOfficialMarketplaceId,
  type PluginDiagnostic,
  type PluginDiscoverRequest,
  type PluginStoreListing,
} from "@knorvia/contracts";
import { loadBundledOfficialPluginRootsSync } from "./official-marketplace.js";
import {
  listInstalledPluginRecords,
  loadKnownMarketplacesSync,
  loadMarketplaceManifestSync,
  resolveInstalledPluginRoot,
} from "./marketplace.js";
import { isNotFoundError, throwIfAborted } from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import type { PluginAbortOptions, PluginCandidate } from "./types.js";

function directories(root: string, diagnostics: PluginDiagnostic[]): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (!isNotFoundError(error))
      diagnostic(
        diagnostics,
        "plugin_root_not_found",
        "Cannot enumerate plugin cache",
        undefined,
        root,
      );
    return [];
  }
}

export function collectCandidates(
  request: PluginDiscoverRequest,
  diagnostics: PluginDiagnostic[],
  options?: PluginAbortOptions,
): PluginCandidate[] {
  throwIfAborted(options);
  const candidates: PluginCandidate[] = request.config.dirs.map((root) => ({
    rootPath: resolve(request.workingDirectory, root),
    marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
    source: "inline",
    defaultEnabled: true,
  }));
  const official = (rootPath: string): void => {
    candidates.push({
      rootPath: resolve(rootPath),
      marketplace: KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE,
      source: "official",
      defaultEnabled: false,
    });
  };
  for (const root of request.officialPluginRoots ?? []) official(root);
  const bundled = loadBundledOfficialPluginRootsSync(request.storageRoot);
  if (bundled !== undefined) {
    for (const root of bundled) official(root);
  } else {
    const cache = join(request.storageRoot, "cache");
    for (const market of directories(cache, diagnostics)) {
      const name = market.slice(cache.length + 1);
      if (!isOfficialMarketplaceId(name)) continue;
      for (const plugin of directories(market, diagnostics))
        for (const version of directories(plugin, diagnostics)) official(version);
    }
  }
  for (const record of listInstalledPluginRecords(request.storageRoot)) {
    throwIfAborted(options);
    candidates.push({
      rootPath: resolveInstalledPluginRoot(request.storageRoot, record),
      marketplace: record.marketplace,
      source: "cache",
      defaultEnabled: false,
    });
  }
  return candidates;
}

export function collectListings(storageRoot: string): Record<string, PluginStoreListing> {
  const entries: Array<[string, PluginStoreListing]> = [];
  for (const market of loadKnownMarketplacesSync(storageRoot)) {
    const manifest = loadMarketplaceManifestSync(storageRoot, market.id);
    for (const plugin of manifest?.plugins ?? [])
      if (plugin.listing) entries.push([`${plugin.name}@${market.id}`, plugin.listing]);
  }
  return Object.fromEntries(entries);
}
