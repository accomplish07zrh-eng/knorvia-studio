// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  HookEventName,
  PluginDiscoverRequest,
  PluginLoadOutcome,
  PluginOperationOptions,
  PluginPort,
} from "@knorvia/contracts";
import { collectCandidates, collectListings } from "./discovery-candidates.js";
import { diagnostic } from "./discovery-diagnostics.js";
import { readCandidate } from "./discovery-manifest.js";
import { projectPlugin } from "./discovery-runtime.js";
import { throwIfAborted } from "./helpers.js";
import type { PluginAbortOptions } from "./types.js";

export {
  addMarketplace,
  describeMarketplacePlugin,
  ensureDefaultPluginMarketplaces,
  ensureMarketplaceManifestAvailable,
  getPluginDataDir,
  installMarketplacePlugin,
  listInstalledPluginRecords,
  loadKnownMarketplacesSync,
  loadMarketplaceManifestSync,
  normalizeAuthorValue,
  parseEntryStoreListing,
  parseMarketplaceSourceInput,
  readPluginSourceIdentityPin,
  readPluginSourceSha,
  removeMarketplace,
  uninstallMarketplacePlugin,
  updateMarketplace,
  validateMarketplacePlugin,
  validateLocalPluginPath,
  validateMarketplaceSource,
  type DescribeMarketplacePluginResult,
  type InstalledPluginRecord,
  type KnownMarketplaceRecord,
  type MarketplaceSource,
  type PluginComponentGroup,
  type PluginComponentItem,
  type PluginComponentKind,
  type PluginManifestDisplayMetadata,
  type PluginMarketplaceEntry,
  type PluginMarketplaceManifest,
} from "./marketplace.js";
export {
  writeBundledOfficialMarketplacePartitionSync,
  writeCdnOfficialMarketplacePartitionSync,
} from "./official-marketplace.js";
export { getPluginSourceDiagnosticCode } from "./source-errors.js";
export {
  comparePluginUpdate,
  comparePluginVersions,
  type PluginUpdateStatus,
} from "./version-compare.js";

export interface NodePluginAdapterOptions {
  storageRoot: string;
}

export class NodePluginAdapter implements PluginPort {
  constructor(private readonly options: NodePluginAdapterOptions) {}

  async discoverPlugins(
    request: PluginDiscoverRequest,
    options?: PluginOperationOptions,
  ): Promise<PluginLoadOutcome> {
    return this.discoverPluginsSync(request, options);
  }

  discoverPluginsSync(
    request: PluginDiscoverRequest,
    options?: PluginAbortOptions,
  ): PluginLoadOutcome {
    const result: PluginLoadOutcome = {
      commandRoots: [],
      diagnostics: [],
      hooks: {},
      mcpServers: {},
      plugins: [],
      skillRoots: [],
    };
    throwIfAborted(options);
    if (!request.config.enabled) return result;
    const input = { ...request, storageRoot: request.storageRoot || this.options.storageRoot };
    const suppressed = new Set(input.config.suppressedBuiltins);
    const seen = new Set<string>();
    const candidates = collectCandidates(input, result.diagnostics, options);
    for (let index = 0; index < candidates.length; index += 1) {
      throwIfAborted(options);
      const candidate = candidates[index];
      if (!candidate) continue;
      const loaded = readCandidate(candidate, result.diagnostics);
      if (!loaded || (loaded.source === "official" && suppressed.has(loaded.id))) continue;
      if (seen.has(loaded.id)) {
        diagnostic(
          result.diagnostics,
          "plugin_duplicate_id",
          "Duplicate plugin identity",
          loaded,
          loaded.rootPath,
        );
        continue;
      }
      seen.add(loaded.id);
      const explicit = input.config.enabledPlugins[loaded.id];
      const enabled =
        explicit ??
        (candidate.defaultEnabled ||
          input.officialPluginsEnabledByDefault?.has(loaded.id) === true);
      try {
        const { metadata, runtime } = projectPlugin(
          input,
          loaded,
          enabled,
          1000 + index * 10,
          result.diagnostics,
        );
        result.plugins.push(metadata);
        result.commandRoots.push(...runtime.commandRoots);
        result.skillRoots.push(...runtime.skillRoots);
        for (const [event, matchers] of Object.entries(runtime.hooks))
          (result.hooks[event as HookEventName] ??= []).push(...matchers);
        Object.assign(result.mcpServers, runtime.mcpServers);
      } catch {
        throwIfAborted(options);
        diagnostic(
          result.diagnostics,
          "plugin_manifest_invalid",
          "Plugin components could not be loaded",
          loaded,
          loaded.rootPath,
          "error",
        );
      }
    }
    const listings = collectListings(input.storageRoot);
    if (Object.keys(listings).length) result.pluginListingsById = listings;
    const unique = new Map<string, PluginLoadOutcome["diagnostics"][number]>();
    for (const entry of result.diagnostics) unique.set(JSON.stringify(entry), entry);
    result.diagnostics = [...unique.values()];
    return result;
  }
}

export function createNodePluginAdapter(options: NodePluginAdapterOptions): NodePluginAdapter {
  return new NodePluginAdapter(options);
}
export function discoverNodePluginsSync(
  request: PluginDiscoverRequest,
  options?: PluginAbortOptions,
): PluginLoadOutcome {
  return new NodePluginAdapter({ storageRoot: request.storageRoot }).discoverPluginsSync(
    request,
    options,
  );
}
