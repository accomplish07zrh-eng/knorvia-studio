// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { isAbsolute, relative, resolve } from "node:path";
import { rm } from "node:fs/promises";
import { activateDirectoryAtomically, type AtomicDirectoryActivation } from "./atomic-directory.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { resolveDependencyClosure } from "./catalog-dependencies.js";
import {
  ensureMarketplaceManifestAvailable,
  loadMarketplaceManifestSync,
} from "./catalog-refresh.js";
import {
  changeInstalledRecords,
  getPluginDataDir,
  installedAuthorityPath,
  pluginCacheDirectory,
} from "./catalog-repository.js";
import type { InstalledPluginRecord, MarketplaceInstallResult } from "./catalog-types.js";
import { appendPluginSourceCleanupError, cleanupPluginSourceBestEffort } from "./helpers.js";
import {
  ensureInstallManifest,
  installationVersion,
  requireZipPluginManifest,
} from "./plugin-document.js";
import { resolvePluginEntrySource } from "./plugin-source.js";
import { isZipPluginUrlSource } from "./zip-source.js";

export async function installMarketplacePlugin(input: {
  marketplace: string;
  name: string;
  signal?: AbortSignal;
  storageRoot: string;
  scope?: "user" | "workspace";
  allowCrossMarketplaces?: ReadonlySet<string>;
}): Promise<MarketplaceInstallResult> {
  const closure = await resolveDependencyClosure({
    ...input,
    load: async (marketplace) => {
      await ensureMarketplaceManifestAvailable({ ...input, marketplace });
      return loadMarketplaceManifestSync(input.storageRoot, marketplace);
    },
  });
  const activated: AtomicDirectoryActivation[] = [];
  const proposed: InstalledPluginRecord[] = [];
  let published = false;
  try {
    for (const node of closure) {
      assertAtomicNotAborted(input.signal);
      const source = await resolvePluginEntrySource({ ...input, ...node });
      let primary: unknown;
      let failed = false;
      try {
        const version = installationVersion(node.entry, source.path);
        const targetPath = pluginCacheDirectory(
          input.storageRoot,
          node.marketplace,
          node.entry.name,
          version,
        );
        if (isZipPluginUrlSource(node.entry.source))
          requireZipPluginManifest(source.path, node.entry, node.marketplace);
        let activation: AtomicDirectoryActivation | undefined;
        if (resolve(source.path) === resolve(targetPath)) {
          assertAtomicNotAborted(input.signal);
          await ensureInstallManifest(targetPath, node.entry);
        } else {
          activation = await activateDirectoryAtomically({
            authorityPath: installedAuthorityPath(input.storageRoot),
            sourcePath: source.path,
            targetPath,
            ...(input.signal ? { signal: input.signal } : {}),
            prepare: (stagedPath) => ensureInstallManifest(stagedPath, node.entry),
          });
          activated.push(activation);
        }
        const timestamp = new Date().toISOString();
        proposed.push({
          id: node.id,
          name: node.entry.name,
          marketplace: node.marketplace,
          version,
          installPath: targetPath,
          installedAt: timestamp,
          updatedAt: timestamp,
          scope: input.scope ?? "user",
          dependencies: node.dependencies,
          ...(node.entry.source !== undefined ? { source: node.entry.source } : {}),
          ...(activation ? { cacheTransactionId: activation.transactionId } : {}),
        });
      } catch (error) {
        primary = error;
        failed = true;
      }
      const cleanupFailure = await cleanupPluginSourceBestEffort(source.cleanup);
      if (failed) throw appendPluginSourceCleanupError(primary, cleanupFailure);
    }
    assertAtomicNotAborted(input.signal);
    const installed = await changeInstalledRecords(input.storageRoot, (previous) => {
      // A queued authority edit may start after cancellation. Once this callback
      // starts publication, complete that publication and its finalization.
      assertAtomicNotAborted(input.signal);
      const next = proposed.map((record) => {
        const existing = previous.find((item) => item.id === record.id);
        return existing ? { ...record, installedAt: existing.installedAt } : record;
      });
      const updatedIds = new Set(next.map((record) => record.id));
      return {
        records: [...previous.filter((record) => !updatedIds.has(record.id)), ...next],
        result: next,
      };
    });
    published = true;
    for (const activation of activated) await activation.finalize();
    return { closure: closure.map((node) => node.id), installed };
  } catch (error) {
    let failure = error;
    if (!published) {
      for (const activation of [...activated].reverse()) {
        try {
          await activation.rollback();
        } catch (cleanupError) {
          failure = appendPluginSourceCleanupError(failure, cleanupError);
        }
      }
    }
    throw failure;
  }
}

function requireCacheOwnedPath(storageRoot: string, path: string): string {
  const cacheRoot = resolve(storageRoot, "cache");
  const target = resolve(path);
  const displacement = relative(cacheRoot, target);
  if (
    !displacement ||
    displacement === ".." ||
    displacement.startsWith("../") ||
    displacement.startsWith("..\\") ||
    isAbsolute(displacement)
  ) {
    throw new Error("Refusing to remove a plugin path outside the managed cache");
  }
  return target;
}

export async function uninstallMarketplacePlugin(input: {
  pluginId: string;
  storageRoot: string;
  removeCache?: boolean;
  keepData?: boolean;
}): Promise<InstalledPluginRecord | null> {
  const removed = await changeInstalledRecords(input.storageRoot, (records) => {
    const index = records.findIndex((record) => record.id === input.pluginId);
    const selected = records[index] ?? null;
    return {
      result: selected,
      records: selected ? [...records.slice(0, index), ...records.slice(index + 1)] : records,
      write: selected !== null,
    };
  });
  if (removed && input.removeCache) {
    const target = requireCacheOwnedPath(input.storageRoot, removed.installPath);
    await rm(target, { recursive: true, force: true });
    if (!input.keepData)
      await rm(getPluginDataDir(input.storageRoot, input.pluginId), {
        recursive: true,
        force: true,
      });
  }
  return removed;
}
