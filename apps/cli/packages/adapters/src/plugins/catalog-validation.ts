// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { KNORVIA_INLINE_PLUGIN_MARKETPLACE } from "@knorvia/contracts";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { CatalogOperationError, resolveDependencyClosure } from "./catalog-dependencies.js";
import {
  findMarketplaceFile,
  loadMarketplaceSource,
  type MarketplaceSourceLease,
} from "./catalog-load-source.js";
import {
  ensureMarketplaceManifestAvailable,
  loadMarketplaceManifestSync,
} from "./catalog-refresh.js";
import type {
  MarketplaceSource,
  PluginMarketplaceEntry,
  PluginValidationDiagnostic,
} from "./catalog-types.js";
import {
  appendPluginSourceCleanupError,
  cleanupPluginSourceBestEffort,
  directoryExists,
  fileExists,
  isRecord,
} from "./helpers.js";
import { readPluginDocumentAt } from "./plugin-document.js";
import { resolvePluginEntrySource } from "./plugin-source.js";
import {
  appendCompatibilityDiagnostics,
  diagnosticForError,
  validatePluginRoot,
} from "./plugin-validation.js";

export async function validateMarketplacePlugin(input: {
  marketplace: string;
  name: string;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]> {
  const id = `${input.name}@${input.marketplace}`;
  const diagnostics: PluginValidationDiagnostic[] = [];
  try {
    await ensureMarketplaceManifestAvailable(input);
    const manifest = loadMarketplaceManifestSync(input.storageRoot, input.marketplace);
    const entry = manifest?.plugins.find((item) => item.name === input.name);
    if (!manifest || !entry)
      throw new CatalogOperationError("plugin_not_found", `Plugin not found: ${id}`);
    try {
      await resolveDependencyClosure({
        ...input,
        load: async (marketplace) => {
          await ensureMarketplaceManifestAvailable({ ...input, marketplace });
          return loadMarketplaceManifestSync(input.storageRoot, marketplace);
        },
      });
    } catch (error) {
      diagnostics.push(diagnosticForError(error, id));
    }
    const source = await resolvePluginEntrySource({ ...input, manifest, entry });
    try {
      diagnostics.push(...validatePluginRoot({ ...input, root: source.path, entry }));
    } finally {
      await cleanupPluginSourceBestEffort(source.cleanup);
    }
  } catch (error) {
    diagnostics.push(diagnosticForError(error, id));
  }
  return diagnostics;
}

function deferredEntry(entry: PluginMarketplaceEntry): boolean {
  return (
    isRecord(entry.source) &&
    ["github", "git", "url", "git-subdir"].includes(String(entry.source.source))
  );
}

export async function validateMarketplaceSource(input: {
  expectedId?: string;
  pluginName?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]> {
  const diagnostics: PluginValidationDiagnostic[] = [];
  let lease: MarketplaceSourceLease | undefined;
  try {
    lease = await loadMarketplaceSource(input.source, input.signal);
    const { manifest } = lease;
    if (input.expectedId !== undefined && manifest.name !== input.expectedId) {
      throw new CatalogOperationError(
        "plugin_marketplace_invalid",
        `Marketplace identity does not match ${input.expectedId}`,
      );
    }
    const entries =
      input.pluginName !== undefined
        ? manifest.plugins.filter((entry) => entry.name === input.pluginName)
        : manifest.plugins;
    if (input.pluginName !== undefined && !entries.length)
      throw new CatalogOperationError(
        "plugin_not_found",
        `Plugin not found: ${input.pluginName}@${manifest.name}`,
      );
    for (const entry of entries) {
      assertAtomicNotAborted(input.signal);
      const id = `${entry.name}@${manifest.name}`;
      if (deferredEntry(entry)) {
        diagnostics.push({
          code: "plugin_validation_deferred",
          severity: "warning",
          message: `Plugin source validation requires materialization: ${id}`,
          pluginId: id,
        });
        appendCompatibilityDiagnostics(entry.raw, id, undefined, diagnostics);
        continue;
      }
      try {
        const source = await resolvePluginEntrySource({
          storageRoot: input.storageRoot,
          marketplace: manifest.name,
          manifest,
          entry,
          ...(lease.sourceRoot !== undefined ? { sourceRoot: lease.sourceRoot } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        try {
          diagnostics.push(
            ...validatePluginRoot({
              storageRoot: input.storageRoot,
              marketplace: manifest.name,
              root: source.path,
              entry,
            }),
          );
        } finally {
          await cleanupPluginSourceBestEffort(source.cleanup);
        }
      } catch (error) {
        assertAtomicNotAborted(input.signal);
        diagnostics.push(diagnosticForError(error, id));
      }
    }
  } catch (error) {
    const cleanup = await cleanupPluginSourceBestEffort(lease?.cleanup);
    lease = undefined;
    assertAtomicNotAborted(input.signal);
    if (error instanceof Error && error.name === "AbortError") throw error;
    diagnostics.push(diagnosticForError(appendPluginSourceCleanupError(error, cleanup)));
  } finally {
    await cleanupPluginSourceBestEffort(lease?.cleanup);
  }
  return diagnostics;
}

export async function validateLocalPluginPath(input: {
  path: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]> {
  assertAtomicNotAborted(input.signal);
  const path = resolve(input.path);
  try {
    if (directoryExists(path)) {
      if (findMarketplaceFile(path))
        return validateMarketplaceSource({ ...input, source: { source: "directory", path } });
      const entry: PluginMarketplaceEntry = { name: basename(path), raw: { name: basename(path) } };
      // The actual manifest supplies the local plugin name; there is no catalog
      // entry against which to report a spurious folder-name mismatch.
      const candidates = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"];
      const manifestPath = candidates
        .map((directory) => resolve(path, directory, "plugin.json"))
        .find(fileExists);
      const document = manifestPath ? readPluginDocumentAt(manifestPath) : undefined;
      if (document) entry.name = document.manifest.name;
      return validatePluginRoot({
        ...input,
        root: path,
        marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
        entry,
        ...(document ? { document } : {}),
      });
    }
    if (!fileExists(path))
      throw new CatalogOperationError("plugin_not_found", `Plugin path not found: ${path}`);
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(value) && "plugins" in value)
      return validateMarketplaceSource({ ...input, source: { source: "file", path } });
    const document = readPluginDocumentAt(path);
    const parent = dirname(path);
    const root = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"].includes(basename(parent))
      ? dirname(parent)
      : parent;
    return validatePluginRoot({
      storageRoot: input.storageRoot,
      root,
      document,
      marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
      entry: { name: document.manifest.name, raw: document.raw },
    });
  } catch (error) {
    return [diagnosticForError(error, undefined, path)];
  }
}
