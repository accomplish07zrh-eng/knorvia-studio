// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { normalizeAuthorValue } from "./catalog-listing.js";
import {
  ensureMarketplaceManifestAvailable,
  loadMarketplaceManifestSync,
} from "./catalog-refresh.js";
import { listInstalledPluginRecords, resolveInstalledPluginRoot } from "./catalog-repository.js";
import type { DescribeMarketplacePluginInput } from "./catalog-describe-types.js";
import type {
  DescribeMarketplacePluginResult,
  PluginManifestDisplayMetadata,
  PluginMarketplaceEntry,
} from "./catalog-types.js";
import { cleanupPluginSourceBestEffort, directoryExists } from "./helpers.js";
import { enumeratePluginComponents } from "./plugin-components.js";
import { readPluginDocument, syntheticPluginManifest } from "./plugin-document.js";
import { resolvePluginEntrySource } from "./plugin-source.js";
import { diagnosticForError, loadedForRoot } from "./plugin-validation.js";

function displayMetadata(
  manifest: PluginManifest | null,
): /* 有内容才透出，否则整体缺席 */ PluginManifestDisplayMetadata | undefined {
  if (!manifest) return undefined;
  const author = normalizeAuthorValue(manifest.author);
  const result: PluginManifestDisplayMetadata = {};
  if (author?.name) result.author = author.name;
  if (author?.url) result.authorUrl = author.url;
  if (typeof manifest.homepage === "string" && manifest.homepage)
    result.homepage = manifest.homepage;
  if (typeof manifest.version === "string" && manifest.version) result.version = manifest.version;
  return Object.keys(result).length ? result : undefined;
}

function describeRoot(
  root: string,
  /* 所属市场标识 */ marketplace: string,
  entry?: PluginMarketplaceEntry,
): DescribeMarketplacePluginResult {
  const diagnostics: PluginDiagnostic[] = [];
  let manifest: PluginManifest | null = null;
  let manifestPath: string | undefined;
  try {
    const document = readPluginDocument(root);
    manifest =
      document?.manifest ?? (entry?.strict === false ? syntheticPluginManifest(entry) : null);
    manifestPath = document?.path;
  } catch {
    // A malformed manifest does not erase independently discoverable filesystem
    // components. Describe deliberately differs from full validation here.
  }
  const loaded = manifest ? loadedForRoot(root, marketplace, manifest, manifestPath) : undefined;
  let components: DescribeMarketplacePluginResult["components"] = [];
  try {
    components = enumeratePluginComponents(root, manifest, {
      diagnostics,
      ...(loaded ? { loaded } : {}),
    });
  } catch (error) {
    diagnostics.push(diagnosticForError(error, loaded?.id, root));
  }
  const metadata = displayMetadata(manifest);
  return { components, diagnostics, ...(metadata ? { metadata } : {}) };
}

export async function describeMarketplacePlugin(
  input: DescribeMarketplacePluginInput,
): Promise<DescribeMarketplacePluginResult> {
  const id = `${input.name}@${input.marketplace}`;
  try {
    const installed = listInstalledPluginRecords(input.storageRoot).find(
      (record) => record.id === id,
    );
    if (installed) {
      const root = resolveInstalledPluginRoot(input.storageRoot, installed);
      if (directoryExists(root)) {
        const entry = loadMarketplaceManifestSync(
          /* 市场数据根目录 */ input.storageRoot,
          /* 市场标识 */ input.marketplace,
        )?.plugins.find((item) => item.name === input.name);
        return describeRoot(root, input.marketplace, entry);
      }
    }
    await ensureMarketplaceManifestAvailable(input);
    const manifest = loadMarketplaceManifestSync(
      /* 市场数据根目录 */ input.storageRoot,
      /* 市场标识 */ input.marketplace,
    );
    const entry = manifest?.plugins.find((item) => item.name === input.name);
    if (!manifest || !entry)
      throw new CatalogOperationError("plugin_not_found", `Plugin not found: ${id}`);
    const source = await resolvePluginEntrySource({ ...input, manifest, entry });
    try {
      return describeRoot(source.path, input.marketplace, entry);
    } finally {
      await cleanupPluginSourceBestEffort(source.cleanup);
    }
  } catch (error) {
    return { components: [], diagnostics: [diagnosticForError(error, id)] };
  }
}
