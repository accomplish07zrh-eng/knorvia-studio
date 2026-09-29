// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { AtomicDirectoryActivation } from "./public-declarations/atomic-directory.js";
import type {
  DescribeMarketplacePluginResult,
  InstalledPluginRecord,
  KnownMarketplaceRecord,
  MarketplaceRefreshFailure,
  MarketplaceSource,
  PluginComponentGroup,
  PluginComponentItem,
  PluginComponentKind,
  PluginManifestDisplayMetadata,
  PluginMarketplaceEntry,
  PluginMarketplaceManifest,
  PluginValidationDiagnostic,
} from "./public-declarations/marketplace.js";
import type {
  PluginAbortOptions,
  PluginCandidate,
  PluginComponents,
  LoadedPlugin,
} from "./public-declarations/types.js";
import type { PluginUpdateStatus } from "./public-declarations/version-compare.js";
import type {
  PluginZipDownloadError,
  ResolvedZipPluginSourceRoot,
} from "./public-declarations/zip-source.js";

type Facades = {
  atomic: typeof import("./public-declarations/atomic-directory.js");
  archive: typeof import("./public-declarations/github-archive-source.js");
  helpers: typeof import("./public-declarations/helpers.js");
  marketplace: typeof import("./public-declarations/marketplace.js");
  official: typeof import("./public-declarations/official-marketplace.js");
  sourceErrors: typeof import("./public-declarations/source-errors.js");
  versions: typeof import("./public-declarations/version-compare.js");
  zip: typeof import("./public-declarations/zip-source.js");
};

declare const facades: Facades;
declare const activation: AtomicDirectoryActivation;
declare const zipError: PluginZipDownloadError;
declare const records: KnownMarketplaceRecord[];

interface DefaultPluginMarketplace {
  id: string;
  source: string;
  name: string;
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

const defaultFixture = {
  id: "fixture-market",
  source: "https://example.invalid/marketplace.json",
  name: "Fixture Marketplace",
  description: "Synthetic contract fixture",
  pluginCount: 1,
  lastUpdated: "2026-09-01T00:00:00.000Z",
} satisfies DefaultPluginMarketplace;

const synchronousDefaults: KnownMarketplaceRecord[] =
  facades.marketplace.ensureDefaultPluginMarketplaces("synthetic");
const activationResult: Promise<AtomicDirectoryActivation> =
  facades.atomic.activateDirectoryAtomically({ targetPath: "synthetic" });
const archiveResult: Promise<ResolvedZipPluginSourceRoot> =
  facades.archive.resolveGitHubArchiveSource({ url: "https://github.com/acme/repo" });
const updateStatus: PluginUpdateStatus = facades.versions.comparePluginUpdate({
  installedVersion: undefined,
  installedSha: undefined,
  latestVersion: undefined,
  latestSha: undefined,
});
const diagnosticCode = facades.sourceErrors.getPluginSourceDiagnosticCode(zipError);
const cleanupResult: Promise<unknown> = facades.helpers.cleanupPluginSourceBestEffort(
  activation.rollback,
);
const officialManifest: Record<string, unknown> =
  facades.official.writeBundledOfficialMarketplacePartitionSync({
    manifest: { name: "knorvia-plugins-bundled" },
    storageRoot: "synthetic",
  });
const zipHash: string | undefined = facades.zip.readZipPluginSourceSha256({});

type PublicMarketplaceTypes = [
  MarketplaceSource,
  PluginMarketplaceEntry,
  PluginMarketplaceManifest,
  MarketplaceRefreshFailure,
  InstalledPluginRecord,
  PluginValidationDiagnostic,
  DescribeMarketplacePluginResult,
  PluginManifestDisplayMetadata,
  PluginComponentGroup,
  PluginComponentItem,
  PluginComponentKind,
];
type ApprovedSupportTypes = [PluginCandidate, LoadedPlugin, PluginComponents, PluginAbortOptions];

void activationResult;
void archiveResult;
void cleanupResult;
void diagnosticCode;
void defaultFixture;
void officialManifest;
void records;
void synchronousDefaults;
void updateStatus;
void zipHash;
declare const publicTypes: PublicMarketplaceTypes;
declare const supportTypes: ApprovedSupportTypes;
void publicTypes;
void supportTypes;
