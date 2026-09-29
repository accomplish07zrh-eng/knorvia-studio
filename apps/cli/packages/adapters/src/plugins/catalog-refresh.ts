// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isOfficialMarketplaceId } from "@knorvia/contracts";
import {
  activateDirectoryAtomically,
  recoverAtomicTargetSync,
  type AtomicDirectoryActivation,
} from "./atomic-directory.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { loadMarketplaceSource } from "./catalog-load-source.js";
import { decodeMarketplaceManifest } from "./catalog-manifest.js";
import {
  changeKnownRecords,
  knownAuthorityPath,
  loadKnownMarketplacesSync,
  marketplaceDirectory,
} from "./catalog-repository.js";
import type {
  KnownMarketplaceRecord,
  MarketplaceSource,
  PluginMarketplaceManifest,
} from "./catalog-types.js";
import { appendPluginSourceCleanupError, cleanupPluginSourceBestEffort } from "./helpers.js";
import { writeCdnOfficialMarketplacePartitionSync } from "./official-marketplace.js";
import { getPluginSourceDiagnosticCode } from "./source-errors.js";

export function loadMarketplaceManifestSync(
  storageRoot: string,
  marketplace: string,
): PluginMarketplaceManifest | null {
  const root = recoverAtomicTargetSync(marketplaceDirectory(storageRoot, marketplace));
  try {
    return decodeMarketplaceManifest(
      JSON.parse(readFileSync(join(root, "marketplace.json"), "utf8")),
    );
  } catch {
    return null;
  }
}

function guardMarketplaceIdentity(name: string, expectedId?: string, trustedId?: string): void {
  if (
    (isOfficialMarketplaceId(name) && name !== trustedId) ||
    (trustedId && isOfficialMarketplaceId(trustedId) && name !== trustedId)
  ) {
    throw new CatalogOperationError(
      "plugin_marketplace_invalid",
      "Reserved official marketplace identity is not trusted",
    );
  }
  if (expectedId !== undefined && name !== expectedId) {
    throw new CatalogOperationError(
      "plugin_marketplace_invalid",
      `Marketplace identity does not match ${expectedId}`,
    );
  }
}

export async function addMarketplace(input: {
  expectedId?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
  trustedId?: string;
}): Promise<KnownMarketplaceRecord> {
  const source = await loadMarketplaceSource(input.source, input.signal);
  let activation: AtomicDirectoryActivation | undefined;
  let published: KnownMarketplaceRecord | undefined;
  let predecessor: KnownMarketplaceRecord | undefined;
  let primary: unknown;
  let failed = false;
  try {
    let manifest = source.manifest;
    guardMarketplaceIdentity(manifest.name, input.expectedId, input.trustedId);
    assertAtomicNotAborted(input.signal);
    const official = isOfficialMarketplaceId(manifest.name);
    if (official) {
      const merged = writeCdnOfficialMarketplacePartitionSync({
        storageRoot: input.storageRoot,
        manifest: manifest.raw,
      });
      const decoded = decodeMarketplaceManifest(merged);
      if (!decoded)
        throw new CatalogOperationError(
          "plugin_marketplace_invalid",
          "Merged official marketplace is invalid",
        );
      manifest = decoded;
    }
    if (!official || source.sourceRoot) {
      activation = await activateDirectoryAtomically({
        authorityPath: knownAuthorityPath(input.storageRoot),
        targetPath: marketplaceDirectory(input.storageRoot, manifest.name),
        ...(source.sourceRoot !== undefined ? { sourcePath: source.sourceRoot } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        prepare: (stagedPath) =>
          writeFile(
            join(stagedPath, "marketplace.json"),
            JSON.stringify(manifest.raw, null, 2) + "\n",
          ),
      });
    }
    assertAtomicNotAborted(input.signal);
    const currentManifest = manifest;
    const generation = activation?.transactionId;
    published = await changeKnownRecords(input.storageRoot, (records) => {
      assertAtomicNotAborted(input.signal);
      predecessor = records.find((record) => record.id === currentManifest.name);
      const now = new Date().toISOString();
      const record: KnownMarketplaceRecord = {
        id: currentManifest.name,
        source: input.source,
        name: currentManifest.name,
        addedAt: predecessor?.addedAt ?? now,
        lastUpdated: now,
        pluginCount: currentManifest.plugins.length,
        ...(currentManifest.description !== undefined
          ? { description: currentManifest.description }
          : {}),
        ...(generation ? { cacheTransactionId: generation } : {}),
      };
      const index = records.findIndex((item) => item.id === record.id);
      const next = [...records];
      if (index < 0) next.push(record);
      else next[index] = record;
      return { records: next, result: record };
    });
    if (activation) assertAtomicNotAborted(input.signal);
    await activation?.finalize();
  } catch (error) {
    failed = true;
    primary = error;
    let safeToRollback = true;
    if (published) {
      const own = published;
      try {
        await changeKnownRecords(input.storageRoot, (records) => {
          const index = records.findIndex((record) => record.id === own.id);
          const current = records[index];
          if (
            !current ||
            current.lastUpdated !== own.lastUpdated ||
            current.cacheTransactionId !== own.cacheTransactionId
          ) {
            throw new Error(
              "Marketplace state was superseded; refusing to roll back the newer record",
            );
          }
          const next = [...records];
          if (predecessor) next[index] = predecessor;
          else next.splice(index, 1);
          return { records: next, result: undefined };
        });
      } catch (rollbackError) {
        safeToRollback = false;
        primary = appendPluginSourceCleanupError(primary, rollbackError);
      }
    }
    try {
      if (safeToRollback) await activation?.rollback();
      else await activation?.finalize();
    } catch (rollbackError) {
      primary = appendPluginSourceCleanupError(primary, rollbackError);
    }
  }
  const cleanupFailure = await cleanupPluginSourceBestEffort(source.cleanup);
  if (failed) throw appendPluginSourceCleanupError(primary, cleanupFailure);
  return published!;
}

export async function ensureMarketplaceManifestAvailable(input: {
  marketplace: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<KnownMarketplaceRecord | null> {
  assertAtomicNotAborted(input.signal);
  const known = loadKnownMarketplacesSync(input.storageRoot).find(
    (record) => record.id === input.marketplace,
  );
  if (!known) return null;
  if (loadMarketplaceManifestSync(input.storageRoot, input.marketplace)) return known;
  return addMarketplace({
    source: known.source,
    storageRoot: input.storageRoot,
    expectedId: known.id,
    trustedId: known.id,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

export async function updateMarketplace(input: {
  marketplace?: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<KnownMarketplaceRecord[]> {
  const records = loadKnownMarketplacesSync(input.storageRoot);
  const selected =
    input.marketplace !== undefined
      ? records.filter((record) => record.id === input.marketplace)
      : records;
  if (input.marketplace !== undefined && selected.length === 0)
    throw new Error(`Marketplace not found: ${input.marketplace}`);
  const updated: KnownMarketplaceRecord[] = [];
  for (const record of selected) {
    assertAtomicNotAborted(input.signal);
    try {
      updated.push(
        await addMarketplace({
          source: record.source,
          storageRoot: input.storageRoot,
          expectedId: record.id,
          trustedId: record.id,
          ...(input.signal ? { signal: input.signal } : {}),
        }),
      );
    } catch (error) {
      assertAtomicNotAborted(input.signal);
      if (error instanceof Error && error.name === "AbortError") throw error;
      const code =
        getPluginSourceDiagnosticCode(error) ??
        (error instanceof CatalogOperationError
          ? error.diagnosticCode
          : "plugin_marketplace_invalid");
      await changeKnownRecords(input.storageRoot, (current) => ({
        records: current.map((item) =>
          item.id === record.id
            ? {
                ...item,
                lastRefreshFailure: {
                  code,
                  failedAt: new Date().toISOString(),
                  message: error instanceof Error ? error.message : String(error),
                },
              }
            : item,
        ),
        result: undefined,
      }));
    }
  }
  return updated;
}

export async function removeMarketplace(input: {
  marketplace: string;
  storageRoot: string;
}): Promise<void> {
  await changeKnownRecords(input.storageRoot, (records) => ({
    records: records.filter((record) => record.id !== input.marketplace),
    result: undefined,
  }));
}
