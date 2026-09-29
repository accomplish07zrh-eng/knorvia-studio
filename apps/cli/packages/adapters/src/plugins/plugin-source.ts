// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { resolve } from "node:path";
import { recoverAtomicTargetSync } from "./atomic-directory.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { readPluginSourceSha } from "./catalog-source-input.js";
import { marketplaceDirectory, pluginCacheDirectory } from "./catalog-repository.js";
import type { PluginMarketplaceEntry, PluginMarketplaceManifest } from "./catalog-types.js";
import { directoryExists, isRecord, resolveInside } from "./helpers.js";
import { materializeRepository } from "./source-git.js";
import { resolveZipPluginSource } from "./zip-source.js";

export interface PluginSourceLease {
  path: string;
  cleanup?: () => Promise<void>;
}

function requiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Plugin source ${field} must be a nonempty string`);
  return value;
}

function repositoryOptions(source: Record<string, unknown>, signal?: AbortSignal) {
  const sha = readPluginSourceSha(source);
  return {
    ...(typeof source.path === "string" ? { path: source.path } : {}),
    ...(typeof source.ref === "string" ? { ref: source.ref } : {}),
    ...(sha !== undefined ? { sha } : {}),
    ...(signal ? { signal } : {}),
  };
}

export function marketplacePluginBase(
  storageRoot: string,
  marketplace: string,
  manifest: PluginMarketplaceManifest,
): string {
  const root = recoverAtomicTargetSync(marketplaceDirectory(storageRoot, marketplace));
  const selected =
    manifest.pluginRoot !== undefined ? resolveInside(root, manifest.pluginRoot) : null;
  return selected && directoryExists(selected) ? selected : root;
}

function requireLocalDirectory(path: string): PluginSourceLease {
  if (!directoryExists(path)) throw new Error(`Plugin source directory not found: ${path}`);
  return { path };
}

function zipOptions(source: Record<string, unknown>, signal?: AbortSignal) {
  const url = requiredString(source, "url");
  if (typeof source.sha256 !== "string")
    throw new Error("Plugin ZIP source sha256 must be a string");
  if (source.path !== undefined && typeof source.path !== "string")
    throw new Error("Plugin ZIP path must be a string");
  if (source.stripRoot !== undefined && typeof source.stripRoot !== "boolean")
    throw new Error("Plugin ZIP stripRoot must be a boolean");
  let headers: Record<string, string> | undefined;
  if (source.headers !== undefined) {
    if (
      !isRecord(source.headers) ||
      Object.values(source.headers).some((value) => typeof value !== "string")
    ) {
      throw new Error("Plugin ZIP headers must be a string map");
    }
    headers = source.headers as Record<string, string>;
  }
  return {
    url,
    sha256: source.sha256,
    ...(typeof source.path === "string" ? { path: source.path } : {}),
    ...(typeof source.stripRoot === "boolean" ? { stripRoot: source.stripRoot } : {}),
    ...(headers ? { headers } : {}),
    ...(signal ? { signal } : {}),
  };
}

export async function resolvePluginEntrySource(input: {
  storageRoot: string;
  marketplace: string;
  manifest: PluginMarketplaceManifest;
  entry: PluginMarketplaceEntry;
  signal?: AbortSignal;
  sourceRoot?: string;
}): Promise<PluginSourceLease> {
  assertAtomicNotAborted(input.signal);
  const { entry } = input;
  const source = entry.source;
  if (source === "filesystem" || source === "sea") {
    if (entry.cachePath !== undefined) {
      const cache = recoverAtomicTargetSync(entry.cachePath);
      if (directoryExists(cache)) return { path: cache };
    }
    const cache = pluginCacheDirectory(
      input.storageRoot,
      input.marketplace,
      entry.name,
      entry.version || "0.0.0",
    );
    return requireLocalDirectory(recoverAtomicTargetSync(cache));
  }
  let base =
    input.sourceRoot ?? marketplacePluginBase(input.storageRoot, input.marketplace, input.manifest);
  if (input.sourceRoot && input.manifest.pluginRoot !== undefined) {
    const selected = resolveInside(base, input.manifest.pluginRoot);
    if (selected && directoryExists(selected)) base = selected;
  }
  if (typeof source === "string") {
    const local = resolveInside(base, source.replace(/^\.\//u, ""));
    if (local && directoryExists(local)) return { path: local };
    return requireLocalDirectory(resolve(source));
  }
  if (!isRecord(source)) {
    const local = resolveInside(base, entry.name);
    if (!local) throw new Error("Plugin source name escapes the marketplace directory");
    return requireLocalDirectory(local);
  }
  switch (source.source) {
    case "directory":
      return requireLocalDirectory(resolve(requiredString(source, "path")));
    case "github":
      return materializeRepository({
        url: `https://github.com/${requiredString(source, "repo")}.git`,
        ...repositoryOptions(source, input.signal),
      });
    case "git":
      return materializeRepository({
        url: requiredString(source, "url"),
        ...repositoryOptions(source, input.signal),
      });
    case "git-subdir": {
      let url = requiredString(source, "url");
      if (url.includes("/") && !url.includes(":")) url = `https://github.com/${url}.git`;
      return materializeRepository({
        url,
        ...repositoryOptions(source, input.signal),
        path: requiredString(source, "path"),
      });
    }
    case "url": {
      if (source.type === "zip") return resolveZipPluginSource(zipOptions(source, input.signal));
      if (typeof source.type === "string" && source.type && source.type !== "git")
        throw new Error(`Unsupported plugin URL source type: ${source.type}`);
      return materializeRepository({
        url: requiredString(source, "url"),
        ...repositoryOptions(source, input.signal),
      });
    }
    case "npm":
    case "pip":
      throw new Error(`Unsupported plugin package source: ${source.source}`);
    default:
      throw new Error("Invalid or unsupported plugin source object");
  }
}
