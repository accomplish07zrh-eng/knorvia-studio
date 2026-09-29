// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { join } from "node:path";
import {
  isOfficialMarketplaceId,
  type PluginDiagnostic,
  type PluginManifest,
} from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { getPluginDataDir } from "./catalog-repository.js";
import type { PluginMarketplaceEntry, PluginValidationDiagnostic } from "./catalog-types.js";
import { isRecord } from "./helpers.js";
import { loadPluginMcpServerDefinitions, resolvePluginMcpServers } from "./mcp.js";
import {
  readPluginDocument,
  syntheticPluginManifest,
  type PluginDocument,
} from "./plugin-document.js";
import { getPluginSourceDiagnosticCode } from "./source-errors.js";
import type { LoadedPlugin } from "./types.js";

export function diagnosticForError(
  error: unknown,
  pluginId?: string,
  path?: string,
): PluginValidationDiagnostic {
  return {
    code:
      getPluginSourceDiagnosticCode(error) ??
      (error instanceof CatalogOperationError
        ? error.diagnosticCode
        : "plugin_marketplace_invalid"),
    message: error instanceof Error ? error.message : String(error),
    severity: "error",
    ...(pluginId !== undefined ? { pluginId } : {}),
    ...(path !== undefined ? { path } : {}),
  };
}

function hasUnsupportedBundle(value: unknown): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<unknown[]>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string" && (item.endsWith(".mcpb") || item.endsWith(".dxt"))) return true;
    if (Array.isArray(item) && !visited.has(item)) {
      visited.add(item);
      for (const nested of item) pending.push(nested);
    }
  }
  return false;
}

export function appendCompatibilityDiagnostics(
  manifest: Record<string, unknown> | PluginManifest,
  pluginId: string,
  path: string | undefined,
  diagnostics: PluginValidationDiagnostic[],
): void {
  const add = (code: PluginValidationDiagnostic["code"], message: string) =>
    diagnostics.push({
      code,
      message,
      severity: "warning",
      pluginId,
      ...(path !== undefined ? { path } : {}),
    });
  for (const key of ["channels", "lspServers", "outputStyles", "settings"]) {
    if (key in manifest)
      add("plugin_unsupported_component", `Plugin component ${key} is diagnostic-only`);
  }
  if (isRecord(manifest.userConfig)) {
    for (const [name, option] of Object.entries(manifest.userConfig)) {
      if (isRecord(option) && option.required === true && option.default === undefined) {
        add("plugin_variable_missing", `Plugin configuration ${name} requires a value`);
      }
    }
  }
  if (hasUnsupportedBundle(manifest.mcpServers))
    add(
      "plugin_marketplace_source_unsupported",
      "MCP bundle sources (.mcpb/.dxt) are not supported",
    );
}

export function loadedForRoot(
  rootPath: string,
  marketplace: string,
  manifest: PluginManifest,
  manifestPath?: string,
): LoadedPlugin {
  return {
    id: `${manifest.name}@${marketplace}`,
    marketplace,
    rootPath,
    manifest,
    manifestPath: manifestPath ?? join(rootPath, ".claude-plugin", "plugin.json"),
    source: isOfficialMarketplaceId(marketplace) ? "official" : "cache",
  };
}

export function validatePluginRoot(input: {
  root: string;
  marketplace: string;
  entry: PluginMarketplaceEntry;
  storageRoot: string;
  document?: PluginDocument;
}): PluginValidationDiagnostic[] {
  const id = `${input.entry.name}@${input.marketplace}`;
  const diagnostics: PluginDiagnostic[] = [];
  let document: PluginDocument | undefined;
  try {
    document = input.document ?? readPluginDocument(input.root);
  } catch (error) {
    return [
      {
        code: "plugin_manifest_invalid",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        path: input.root,
        pluginId: id,
      },
    ];
  }
  const manifest =
    document?.manifest ??
    (input.entry.strict === false ? syntheticPluginManifest(input.entry) : undefined);
  if (!manifest)
    return [
      {
        code: "plugin_manifest_not_found",
        severity: "error",
        message: `Plugin manifest not found: ${id}`,
        path: input.root,
        pluginId: id,
      },
    ];
  if (manifest.name !== input.entry.name)
    diagnostics.push({
      code: "plugin_manifest_invalid",
      severity: "error",
      message: `Plugin manifest name does not match ${input.entry.name}`,
      path: input.root,
      pluginId: id,
    });
  appendCompatibilityDiagnostics(manifest, id, input.root, diagnostics);
  const loaded = loadedForRoot(input.root, input.marketplace, manifest, document?.path);
  try {
    const definitions = loadPluginMcpServerDefinitions({ diagnostics, loaded });
    resolvePluginMcpServers({
      dataPath: getPluginDataDir(input.storageRoot, id),
      definitions,
      diagnostics,
      env: {},
      options: {},
      loaded,
      workingDirectory: process.cwd(),
    });
  } catch (error) {
    diagnostics.push(diagnosticForError(error, id, input.root));
  }
  return diagnostics;
}
