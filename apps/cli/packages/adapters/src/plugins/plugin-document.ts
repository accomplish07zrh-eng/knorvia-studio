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
  /* 规范化后的清单 */ manifest: PluginManifest;
  /* 清单原文 */ raw: Record<string, unknown>;
  /* 清单文件路径 */ path: string;
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
  return /* 任何位置都没有清单 */ undefined;
}

export function readPluginDocumentAt(path: string): PluginDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Cannot read plugin manifest: ${path}`,
    );
  }
  const name = isRecord(parsed) && typeof parsed.name === "string" ? parsed.name.trim() : undefined;
  if (!isRecord(parsed) || !validPluginName(name)) {
    throw new CatalogOperationError("plugin_manifest_invalid", `Invalid plugin manifest: ${path}`);
  }
  const manifest = {
    ...parsed,
    name: /* 规范化后的清单名 */ name,
    version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
  } as PluginManifest;
  return { manifest, raw: parsed, path };
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
  /* 条目专属字段不进合成清单 */
  const removed = new Set(
    "source category tags strict displayName displayName_i18n description_i18n icon privacyPolicy termsOfService heroImage examplePrompts examplePrompts_i18n requiresPaidPlan".split(
      " ",
    ),
  );
  return /* 剥离条目字段后的合成清单 */ {
    ...Object.fromEntries(Object.entries(entry.raw).filter(([key]) => !removed.has(key))),
    name: /* 清单名取目录条目名 */ entry.name,
    version: entry.version ?? "0.0.0",
  } as PluginManifest;
}

export function requireZipPluginManifest(
  root: string,
  /* 目录条目 */ entry: PluginMarketplaceEntry,
  /* 所属市场 */ marketplace: string,
): /* 读不到或不匹配即抛错 */ void {
  const resolved =
    readPluginDocument(root)?.manifest ??
    (entry.strict === false ? syntheticPluginManifest(entry) : undefined);
  if (!resolved) {
    throw new CatalogOperationError(
      "plugin_manifest_not_found",
      `Plugin manifest not found: ${entry.name}@${marketplace}`,
    );
  }
  if (resolved.name !== entry.name) {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Plugin manifest name does not match ${entry.name}`,
    );
  }
}

export async function ensureInstallManifest(
  root: string,
  /* 宽松条目缺清单时补写 */ entry: PluginMarketplaceEntry,
): Promise<void> {
  if (entry.strict !== false || findPluginManifestPath(root)) return;
  const path = join(root, ".claude-plugin", "plugin.json");
  const manifest = syntheticPluginManifest(entry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
