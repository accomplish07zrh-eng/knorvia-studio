// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginDiagnosticCode } from "@knorvia/contracts";
import type { PluginMarketplaceEntry, PluginMarketplaceManifest } from "./catalog-types.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";

export class CatalogOperationError extends Error {
  readonly diagnosticCode: PluginDiagnosticCode;

  constructor(code: PluginDiagnosticCode, message: string) {
    super(message);
    this.name = "CatalogOperationError";
    this.diagnosticCode = code;
  }
}

export interface DependencyNode {
  id: string;
  marketplace: string;
  entry: PluginMarketplaceEntry;
  manifest: PluginMarketplaceManifest;
  dependencies: string[];
}

export function pluginReference(
  value: string,
  defaultMarketplace: string,
): { id: string; name: string; marketplace: string } {
  const separator = value.lastIndexOf("@");
  const name = separator < 0 ? value : value.slice(0, separator);
  const marketplace = separator < 0 ? defaultMarketplace : value.slice(separator + 1);
  if (!name || !marketplace)
    throw new CatalogOperationError(
      "plugin_dependency_missing",
      `Invalid plugin dependency: ${value}`,
    );
  return { id: `${name}@${marketplace}`, name, marketplace };
}

export async function resolveDependencyClosure(input: {
  marketplace: string;
  name: string;
  signal?: AbortSignal;
  allowCrossMarketplaces?: ReadonlySet<string>;
  load: (marketplace: string) => Promise<PluginMarketplaceManifest | null>;
}): Promise<DependencyNode[]> {
  const catalogs = new Map<string, PluginMarketplaceManifest>();
  const load = async (id: string) => {
    if (catalogs.has(id)) return catalogs.get(id)!;
    assertAtomicNotAborted(input.signal);
    const manifest = await input.load(id);
    if (!manifest)
      throw new CatalogOperationError(
        "plugin_dependency_missing",
        `Plugin marketplace not found: ${id}`,
      );
    catalogs.set(id, manifest);
    return manifest;
  };
  const rootManifest = await load(input.marketplace);
  const permitted =
    input.allowCrossMarketplaces ?? new Set(rootManifest.allowCrossMarketplaceDependenciesOn ?? []);
  const pending = new Set<string>();
  const finished = new Set<string>();
  const ordered: DependencyNode[] = [];

  const visit = async (name: string, marketplace: string): Promise<void> => {
    assertAtomicNotAborted(input.signal);
    const id = `${name}@${marketplace}`;
    if (pending.has(id))
      throw new CatalogOperationError(
        "plugin_dependency_cycle",
        `Plugin dependency cycle includes ${id}`,
      );
    if (finished.has(id)) return;
    const manifest = await load(marketplace);
    const entry = manifest.plugins.find((item) => item.name === name);
    if (!entry)
      throw new CatalogOperationError(
        "plugin_dependency_missing",
        `Plugin dependency not found: ${id}`,
      );
    const dependencies = (entry.dependencies ?? []).map((value) =>
      pluginReference(value, marketplace),
    );
    pending.add(id);
    for (const dependency of dependencies) {
      if (dependency.marketplace !== marketplace && !permitted.has(dependency.marketplace)) {
        throw new CatalogOperationError(
          "plugin_dependency_cross_marketplace",
          `Cross-marketplace plugin dependency is not allowed: ${dependency.id}`,
        );
      }
      await visit(dependency.name, dependency.marketplace);
    }
    pending.delete(id);
    finished.add(id);
    ordered.push({
      id,
      marketplace,
      manifest,
      entry,
      dependencies: dependencies.map((item) => item.id),
    });
  };
  await visit(input.name, input.marketplace);
  return ordered;
}
