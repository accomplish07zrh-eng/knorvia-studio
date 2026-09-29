// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PluginManifest } from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import type { PluginMarketplaceEntry } from "./catalog-types.js";
import { fileExists, isRecord } from "./helpers.js";

export const PLUGIN_MANIFEST_LOCATIONS = [
  ".knorvia-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
] as const;

export function validPluginName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value);
}

export interface PluginDocument {
  manifest: PluginManifest;
  raw: Record<string, unknown>;
  path: string;
}

export function findPluginManifestPath(root: string): string | undefined {
  return PLUGIN_MANIFEST_LOCATIONS.map((location) => join(root, location)).find(fileExists);
}

export function readPluginDocument(root: string): PluginDocument | undefined {
  for (const location of PLUGIN_MANIFEST_LOCATIONS) {
    const path = join(root, location);
    if (!fileExists(path)) continue;
    return readPluginDocumentAt(path);
  }
  return undefined;
}

export function readPluginDocumentAt(path: string): PluginDocument {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Cannot read plugin manifest: ${path}`,
    );
  }
  const name = isRecord(value) && typeof value.name === "string" ? value.name.trim() : undefined;
  if (!isRecord(value) || !validPluginName(name)) {
    throw new CatalogOperationError("plugin_manifest_invalid", `Invalid plugin manifest: ${path}`);
  }
  const manifest = {
    ...value,
    name,
    version: typeof value.version === "string" ? value.version : "0.0.0",
  } as PluginManifest;
  return { manifest, raw: value, path };
}

export function installationVersion(entry: PluginMarketplaceEntry, root: string): string {
  const path = findPluginManifestPath(root);
  if (path) {
    try {
      const value: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (isRecord(value) && typeof value.version === "string" && value.version.trim())
        return value.version;
    } catch {
      // Non-ZIP install has a deliberately lenient version probe. Validation
      // and the separate ZIP gate remain responsible for malformed manifests.
    }
  }
  return entry.version || "0.0.0";
}

export function syntheticPluginManifest(entry: PluginMarketplaceEntry): PluginManifest {
  const removed = new Set([
    "source",
    "category",
    "tags",
    "strict",
    "displayName",
    "displayName_i18n",
    "description_i18n",
    "icon",
    "privacyPolicy",
    "termsOfService",
    "heroImage",
    "examplePrompts",
    "examplePrompts_i18n",
    "requiresPaidPlan",
  ]);
  return {
    ...Object.fromEntries(Object.entries(entry.raw).filter(([key]) => !removed.has(key))),
    name: entry.name,
    version: entry.version ?? "0.0.0",
  } as PluginManifest;
}

export function requireZipPluginManifest(
  root: string,
  entry: PluginMarketplaceEntry,
  marketplace: string,
): void {
  const manifest =
    readPluginDocument(root)?.manifest ??
    (entry.strict === false ? syntheticPluginManifest(entry) : undefined);
  if (!manifest) {
    throw new CatalogOperationError(
      "plugin_manifest_not_found",
      `Plugin manifest not found: ${entry.name}@${marketplace}`,
    );
  }
  if (manifest.name !== entry.name) {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Plugin manifest name does not match ${entry.name}`,
    );
  }
}

export async function ensureInstallManifest(
  root: string,
  entry: PluginMarketplaceEntry,
): Promise<void> {
  if (entry.strict !== false || findPluginManifestPath(root)) return;
  const path = join(root, ".claude-plugin", "plugin.json");
  const manifest = syntheticPluginManifest(entry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
