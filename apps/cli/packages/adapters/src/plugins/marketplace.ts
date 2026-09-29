// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export type {
  MarketplaceSource,
  PluginMarketplaceEntry,
  PluginMarketplaceManifest,
  KnownMarketplaceRecord,
  MarketplaceRefreshFailure,
  InstalledPluginRecord,
  PluginValidationDiagnostic,
  DescribeMarketplacePluginResult,
  PluginManifestDisplayMetadata,
} from "./catalog-types.js";
export type {
  PluginComponentGroup,
  PluginComponentItem,
  PluginComponentKind,
} from "./plugin-components.js";
export {
  parseMarketplaceSourceInput,
  readPluginSourceSha,
  readPluginSourceIdentityPin,
} from "./catalog-source-input.js";
export { parseEntryStoreListing, normalizeAuthorValue } from "./catalog-listing.js";
export {
  loadKnownMarketplacesSync,
  listInstalledPluginRecords,
  resolveInstalledPluginRoot,
  getPluginDataDir,
} from "./catalog-repository.js";
export { ensureDefaultPluginMarketplaces } from "./catalog-defaults.js";
export {
  addMarketplace,
  updateMarketplace,
  removeMarketplace,
  ensureMarketplaceManifestAvailable,
  loadMarketplaceManifestSync,
} from "./catalog-refresh.js";
export { installMarketplacePlugin, uninstallMarketplacePlugin } from "./catalog-install.js";
export {
  validateMarketplacePlugin,
  validateMarketplaceSource,
  validateLocalPluginPath,
} from "./catalog-validation.js";
export { describeMarketplacePlugin } from "./catalog-describe.js";
