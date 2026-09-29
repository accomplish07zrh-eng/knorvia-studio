// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { decodeMarketplaceManifest } from "./catalog-manifest.js";
import type { MarketplaceSource, PluginMarketplaceManifest } from "./catalog-types.js";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  fileExists,
  resolveInside,
} from "./helpers.js";
import { downloadSource } from "./source-download.js";
import { materializeRepository } from "./source-git.js";

export interface MarketplaceSourceLease {
  manifest: PluginMarketplaceManifest;
  sourceRoot?: string;
  cleanup?: () => Promise<void>;
}

function requiredManifest(value: unknown, settings = false): PluginMarketplaceManifest {
  const manifest = decodeMarketplaceManifest(value, settings);
  if (!manifest)
    throw new CatalogOperationError(
      "plugin_marketplace_invalid",
      "Marketplace manifest is invalid",
    );
  return manifest;
}

export function findMarketplaceFile(root: string, preferred?: string): string | undefined {
  const names = [
    ...(preferred !== undefined ? [preferred] : []),
    ".claude-plugin/marketplace.json",
    "marketplace.json",
  ];
  for (const name of names) {
    const path = resolveInside(root, name);
    if (path && fileExists(path)) return path;
  }
  return undefined;
}

async function readSourceManifest(path: string): Promise<PluginMarketplaceManifest> {
  return requiredManifest(JSON.parse(await readFile(path, "utf8")));
}

export async function loadMarketplaceSource(
  source: MarketplaceSource,
  signal?: AbortSignal,
): Promise<MarketplaceSourceLease> {
  assertAtomicNotAborted(signal);
  switch (source.source) {
    case "settings":
      return { manifest: requiredManifest(source.marketplace, true) };
    case "file":
      return { manifest: await readSourceManifest(source.path), sourceRoot: dirname(source.path) };
    case "directory": {
      const path = findMarketplaceFile(source.path);
      if (!path)
        throw new CatalogOperationError(
          "plugin_marketplace_invalid",
          `Marketplace manifest not found: ${source.path}`,
        );
      return { manifest: await readSourceManifest(path), sourceRoot: source.path };
    }
    case "url": {
      const { response } = await downloadSource({
        url: source.url,
        maxBytes: 10 * 1024 * 1024,
        zip: false,
        ...(source.headers ? { headers: source.headers } : {}),
        ...(signal ? { signal } : {}),
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`Marketplace download failed with HTTP ${response.status}`);
      return { manifest: requiredManifest(JSON.parse(new TextDecoder().decode(response.body))) };
    }
    case "git":
    case "github": {
      const lease = await materializeRepository({
        url: source.source === "github" ? `https://github.com/${source.repo}.git` : source.url,
        ...(source.ref !== undefined ? { ref: source.ref } : {}),
        ...(source.sparsePaths !== undefined ? { sparsePaths: source.sparsePaths } : {}),
        ...(signal ? { signal } : {}),
      });
      try {
        const path = findMarketplaceFile(lease.path, source.path);
        if (!path)
          throw new CatalogOperationError(
            "plugin_marketplace_invalid",
            `Marketplace manifest not found: ${join(lease.path, "marketplace.json")}`,
          );
        const manifest = await readSourceManifest(path);
        assertAtomicNotAborted(signal);
        return { manifest, sourceRoot: lease.path, cleanup: lease.cleanup };
      } catch (error) {
        throw appendPluginSourceCleanupError(
          error,
          await cleanupPluginSourceBestEffort(lease.cleanup),
        );
      }
    }
    case "npm":
    case "hostPattern":
    case "pathPattern":
      throw new CatalogOperationError(
        "plugin_marketplace_source_unsupported",
        `Unsupported marketplace source: ${source.source}`,
      );
    default:
      throw new CatalogOperationError(
        "plugin_marketplace_source_unsupported",
        "Unsupported marketplace source",
      );
  }
}
