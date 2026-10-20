// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 市场清单的生命周期：添加、刷新、移除，以及「记录里有但磁盘上没有」时的补建。
// addMarketplace 有两条必须守住的边界：
//   1. 目录先原子激活、记录后写；任一步失败都要把已写的记录回滚掉；
//   2. 回滚前要确认记录没被别人改过（比对 lastUpdated 与事务号），否则宁可不回滚——
//      回滚一份更新的记录比留着不一致更糟。

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
import type { KnownMarketplaceRecord, PluginMarketplaceManifest } from "./catalog-types.js";
import type {
  AddMarketplaceInput,
  EnsureMarketplaceManifestAvailableInput,
  RemoveMarketplaceInput,
  UpdateMarketplaceInput,
} from "./catalog-refresh-types.js";
import { appendPluginSourceCleanupError, cleanupPluginSourceBestEffort } from "./helpers.js";
import { writeCdnOfficialMarketplacePartitionSync } from "./official-marketplace.js";
import { getPluginSourceDiagnosticCode } from "./source-errors.js";

/** 市场清单文件名。 */
const MANIFEST_FILE = "marketplace.json";

/** 读一个市场的清单：目录先走恢复，读不到或解码失败都按「未安装」返回 null。 */
export function loadMarketplaceManifestSync(
  /* 市场数据根目录 */ storageRoot: string,
  /* 市场标识 */ marketplace: string,
): /* 清单缺失或损坏时按未安装处理 */ PluginMarketplaceManifest | null {
  const root = recoverAtomicTargetSync(marketplaceDirectory(storageRoot, marketplace));
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, MANIFEST_FILE), "utf8"));
  } catch {
    return null;
  }
  return decodeMarketplaceManifest(raw);
}

/**
 * 身份守卫：官方标识只认受信来源，且与期望身份一致。
 * 这两条都是安全边界，不是可选校验。
 */
function guardMarketplaceIdentity(name: string, expectedId?: string, trustedId?: string): void {
  const officialName = isOfficialMarketplaceId(name);
  const trustedOfficial = trustedId !== undefined && isOfficialMarketplaceId(trustedId);
  if ((officialName && name !== trustedId) || (trustedOfficial && name !== trustedId)) {
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

/** 官方市场的清单要先并入 CDN 分区，再以合并结果为准。 */
function mergeIfOfficial(
  input: AddMarketplaceInput,
  manifest: PluginMarketplaceManifest,
): PluginMarketplaceManifest {
  if (!isOfficialMarketplaceId(manifest.name)) return manifest;
  const merged = writeCdnOfficialMarketplacePartitionSync({
    storageRoot: input.storageRoot,
    manifest: manifest.raw,
  });
  const decoded = decodeMarketplaceManifest(merged);
  if (!decoded) {
    throw new CatalogOperationError(
      "plugin_marketplace_invalid",
      "Merged official marketplace is invalid",
    );
  }
  return decoded;
}

/** 目录只在「官方且已有本地目录」或「有实体来源」时才需要激活。 */
async function activateIfNeeded(
  input: AddMarketplaceInput,
  manifest: PluginMarketplaceManifest,
  official: boolean,
  sourceRoot: string | undefined,
): Promise<AtomicDirectoryActivation | undefined> {
  if (official && sourceRoot === undefined) return undefined;
  return activateDirectoryAtomically({
    authorityPath: knownAuthorityPath(input.storageRoot),
    targetPath: marketplaceDirectory(input.storageRoot, manifest.name),
    ...(sourceRoot === undefined ? {} : { sourcePath: sourceRoot }),
    ...(input.signal ? { signal: input.signal } : {}),
    prepare: (stagedPath) =>
      writeFile(join(stagedPath, MANIFEST_FILE), `${JSON.stringify(manifest.raw, null, 2)}\n`),
  });
}

/**
 * 造一条市场权威记录。字段名是契约，`addedAt` 继承上一次的值
 * （首次添加才用当前时间），事务号只在真的激活过目录时才有。
 */
function makeRecord(
  input: AddMarketplaceInput,
  manifest: PluginMarketplaceManifest,
  predecessor: KnownMarketplaceRecord | undefined,
  generation: string | undefined,
  now: string,
): KnownMarketplaceRecord {
  const record = {} as KnownMarketplaceRecord;
  record.id = manifest.name;
  record.source = input.source;
  record.name = manifest.name;
  record.addedAt = predecessor?.addedAt ?? now;
  record.lastUpdated = now;
  record.pluginCount = manifest.plugins.length;
  if (manifest.description !== undefined) record.description = manifest.description;
  if (generation !== undefined) record.cacheTransactionId = generation;
  return record;
}

/** 把新记录写进权威清单（存在则替换，否则追加），并回传被替换前的版本。 */
async function publishRecord(
  input: AddMarketplaceInput,
  manifest: PluginMarketplaceManifest,
  generation: string | undefined,
): Promise<{ record: KnownMarketplaceRecord; predecessor: KnownMarketplaceRecord | undefined }> {
  let predecessor: KnownMarketplaceRecord | undefined;
  const record = await changeKnownRecords(input.storageRoot, (records) => {
    assertAtomicNotAborted(input.signal);
    predecessor = records.find((item) => item.id === manifest.name);
    const next = [...records];
    const published = makeRecord(
      input,
      manifest,
      predecessor,
      generation,
      new Date().toISOString(),
    );
    const index = records.findIndex((item) => item.id === published.id);
    if (index < 0) next.push(published);
    else next[index] = published;
    return { records: next, result: published };
  });
  return { record, predecessor };
}

/**
 * 回滚已发布的记录。若当前记录已被别的写入改过（更新时刻或事务号不同），
 * 说明状态已前进，此时拒绝回滚并抛错，由调用方决定如何收场。
 */
async function rollbackRecord(
  input: AddMarketplaceInput,
  published: KnownMarketplaceRecord,
  predecessor: KnownMarketplaceRecord | undefined,
): Promise<void> {
  await changeKnownRecords(input.storageRoot, (records) => {
    const index = records.findIndex((item) => item.id === published.id);
    const current = records[index];
    if (
      !current ||
      current.lastUpdated !== published.lastUpdated ||
      current.cacheTransactionId !== published.cacheTransactionId
    ) {
      throw new Error("Marketplace state was superseded; refusing to roll back the newer record");
    }
    const next = [...records];
    if (predecessor) next[index] = predecessor;
    else next.splice(index, 1);
    return { records: next, result: undefined };
  });
}

/** 失败路径的收尾：先尽力回滚记录，再按是否回滚成功决定目录是回退还是落地。 */
async function compensateFailure(
  input: AddMarketplaceInput,
  activation: AtomicDirectoryActivation | undefined,
  published: KnownMarketplaceRecord | undefined,
  predecessor: KnownMarketplaceRecord | undefined,
  primary: unknown,
): Promise<unknown> {
  let cause = primary;
  let rollbackSafe = true;
  if (published) {
    try {
      await rollbackRecord(input, published, predecessor);
    } catch (rollbackError) {
      rollbackSafe = false;
      cause = appendPluginSourceCleanupError(cause, rollbackError);
    }
  }
  try {
    if (rollbackSafe) await activation?.rollback();
    else await activation?.finalize();
  } catch (directoryError) {
    cause = appendPluginSourceCleanupError(cause, directoryError);
  }
  return cause;
}

export async function addMarketplace(input: AddMarketplaceInput): Promise<KnownMarketplaceRecord> {
  const source = await loadMarketplaceSource(input.source, input.signal);
  let activation: AtomicDirectoryActivation | undefined;
  let published: KnownMarketplaceRecord | undefined;
  let predecessor: KnownMarketplaceRecord | undefined;
  let primary: unknown;
  let failed = false;
  try {
    guardMarketplaceIdentity(source.manifest.name, input.expectedId, input.trustedId);
    // 清单到手后再查中止：避免已经取消还去写盘。
    assertAtomicNotAborted(input.signal);
    const manifest = mergeIfOfficial(input, source.manifest);
    const official = isOfficialMarketplaceId(manifest.name);
    activation = await activateIfNeeded(input, manifest, official, source.sourceRoot);
    assertAtomicNotAborted(input.signal);

    const outcome = await publishRecord(input, manifest, activation?.transactionId);
    published = outcome.record;
    predecessor = outcome.predecessor;
    if (activation) assertAtomicNotAborted(input.signal);
    await activation?.finalize();
  } catch (error) {
    failed = true;
    primary = await compensateFailure(input, activation, published, predecessor, error);
  }
  const cleanupFailure = await cleanupPluginSourceBestEffort(source.cleanup);
  if (failed) throw appendPluginSourceCleanupError(primary, cleanupFailure);
  return published as KnownMarketplaceRecord;
}

export async function ensureMarketplaceManifestAvailable(
  input: EnsureMarketplaceManifestAvailableInput,
): Promise<KnownMarketplaceRecord | null> {
  assertAtomicNotAborted(input.signal);
  const known = loadKnownMarketplacesSync(input.storageRoot).find(
    (record) => record.id === input.marketplace,
  );
  if (known === undefined) return null;
  if (loadMarketplaceManifestSync(input.storageRoot, input.marketplace) !== null) return known;
  return addMarketplace({
    source: known.source,
    storageRoot: input.storageRoot,
    expectedId: known.id,
    trustedId: known.id,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

/** 把刷新失败写进记录：错误码取来源分类或目录专用码，文案保留原文。 */
async function recordRefreshFailure(
  input: UpdateMarketplaceInput,
  recordId: string,
  error: unknown,
): Promise<void> {
  const fromSource = getPluginSourceDiagnosticCode(error);
  const fromCatalog = error instanceof CatalogOperationError ? error.diagnosticCode : undefined;
  const code = fromSource ?? fromCatalog ?? "plugin_marketplace_invalid";
  const text = error instanceof Error ? error.message : String(error);
  await changeKnownRecords(input.storageRoot, (current) => ({
    records: current.map((item) =>
      item.id === recordId
        ? {
            ...item,
            lastRefreshFailure: { code, failedAt: new Date().toISOString(), message: text },
          }
        : item,
    ),
    result: undefined,
  }));
}

export async function updateMarketplace(
  input: UpdateMarketplaceInput,
): Promise<KnownMarketplaceRecord[]> {
  const records = loadKnownMarketplacesSync(input.storageRoot);
  const selected =
    input.marketplace === undefined
      ? records
      : records.filter((record) => record.id === input.marketplace);
  if (input.marketplace !== undefined && selected.length === 0) {
    throw new Error(`Marketplace not found: ${input.marketplace}`);
  }
  const updated: KnownMarketplaceRecord[] = [];
  // 逐市场串行刷新：单个失败只记录，不打断其余市场。
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
      await recordRefreshFailure(input, record.id, error);
    }
  }
  return updated;
}

export async function removeMarketplace(input: RemoveMarketplaceInput): Promise<void> {
  await changeKnownRecords(input.storageRoot, (records) => ({
    records: records.filter((record) => record.id !== input.marketplace),
    result: undefined,
  }));
}
