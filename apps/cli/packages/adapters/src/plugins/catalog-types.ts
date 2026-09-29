// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginDiagnostic, PluginStoreListing } from "@knorvia/contracts";
import type { PluginComponentGroup } from "./plugin-components.js";

export type MarketplaceSource =
  | { source: "url"; url: string; headers?: Record<string, string> }
  | { source: "github"; repo: string; ref?: string; path?: string; sparsePaths?: string[] }
  | { source: "git"; url: string; ref?: string; path?: string; sparsePaths?: string[] }
  | { source: "npm"; package: string }
  | { source: "file"; path: string }
  | { source: "directory"; path: string }
  | { source: "hostPattern"; hostPattern: string }
  | { source: "pathPattern"; pathPattern: string }
  | { source: "settings"; marketplace: PluginMarketplaceManifest };

export interface PluginMarketplaceEntry {
  name: string;
  raw: Record<string, unknown>;
  category?: string;
  description?: string;
  version?: string;
  source?: unknown;
  cachePath?: string;
  dependencies?: string[];
  strict?: boolean;
  tags?: string[];
  listing?: PluginStoreListing;
}

export interface PluginMarketplaceManifest {
  name: string;
  raw: Record<string, unknown>;
  plugins: PluginMarketplaceEntry[];
  description?: string;
  allowCrossMarketplaceDependenciesOn?: string[];
  pluginRoot?: string;
  featured?: string[];
}

export interface MarketplaceRefreshFailure {
  code: PluginDiagnostic["code"];
  failedAt: string;
  message: string;
}

export interface KnownMarketplaceRecord {
  id: string;
  source: MarketplaceSource;
  name: string;
  addedAt: string;
  pluginCount: number;
  description?: string;
  lastUpdated?: string;
  lastRefreshFailure?: MarketplaceRefreshFailure;
  cacheTransactionId?: string;
}

export interface InstalledPluginRecord {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  installPath: string;
  installedAt: string;
  scope: "user" | "workspace";
  updatedAt?: string;
  dependencies?: string[];
  source?: unknown;
  cacheTransactionId?: string;
}

export interface MarketplaceInstallResult {
  closure: string[];
  installed: InstalledPluginRecord[];
}

export interface PluginValidationDiagnostic {
  code: PluginDiagnostic["code"];
  message: string;
  severity: PluginDiagnostic["severity"];
  path?: string;
  pluginId?: string;
}

export interface PluginManifestDisplayMetadata {
  author?: string;
  authorUrl?: string;
  homepage?: string;
  version?: string;
}

export interface DescribeMarketplacePluginResult {
  components: PluginComponentGroup[];
  diagnostics: PluginValidationDiagnostic[];
  metadata?: PluginManifestDisplayMetadata;
}
