// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件校验的三条入口：按「市场条目」、「整个市场来源」、「本地路径」三种形态分流。
// 三者都只汇总诊断、不抛错（取消失例例外，它要继续向上传播），调用方拿到的永远是一份列表。
// 校验路径与非校验路径共用同一套插件文档读取器，避免两处对清单合法性判断不一致。

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

/** 只有这几类来源要先物化，才能读到入口文件。 */
const DEFERRED_SOURCES = ["github", "git", "url", "git-subdir"];

/** 清单所在的三个约定目录；本地路径校验要用它判断父目录是否就是清单目录。 */
const MANIFEST_DIRECTORIES = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"];

/** 单条市场条目的校验入参。 */
type EntryValidationAsk = {
  marketplace: string;
  name: string;
  storageRoot: string;
};

/** 整份市场来源的校验入参。 */
type SourceValidationAsk = {
  expectedId?: string;
  pluginName?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
};

/** 本地路径校验入参。 */
type PathValidationAsk = {
  path: string;
  signal?: AbortSignal;
  storageRoot: string;
};

/** 远程类来源在物化前无法读入口文件，先报一条推迟提示。 */
function isDeferredEntry(entry: PluginMarketplaceEntry): boolean {
  if (!isRecord(entry.source)) return false;
  return DEFERRED_SOURCES.includes(String(entry.source.source));
}

/** 取取消信号，用于把 AbortError 与非取消失败分开。 */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** 加载市场来源并核对身份；身份不符直接抛目录错误。 */
async function leaseMarketplace(ask: SourceValidationAsk): Promise<MarketplaceSourceLease> {
  const lease = await loadMarketplaceSource(ask.source, ask.signal);
  const mismatched = ask.expectedId !== undefined && lease.manifest.name !== ask.expectedId;
  if (mismatched) {
    throw new CatalogOperationError(
      "plugin_marketplace_invalid",
      `Marketplace identity does not match ${ask.expectedId}`,
    );
  }
  return lease;
}

/** 选出本次要校验的条目；指定了插件名却找不到时报「插件不存在」。 */
function selectTargets(
  ask: SourceValidationAsk,
  manifest: MarketplaceSourceLease["manifest"],
): PluginMarketplaceEntry[] {
  if (ask.pluginName === undefined) return manifest.plugins;
  const matched = manifest.plugins.filter((entry) => entry.name === ask.pluginName);
  if (matched.length === 0) {
    throw new CatalogOperationError(
      "plugin_not_found",
      `Plugin not found: ${ask.pluginName}@${manifest.name}`,
    );
  }
  return matched;
}

/** 校验单条目源码；不论校验结果如何都要释放临时物化目录。 */
async function validateEntrySource(
  ask: SourceValidationAsk,
  lease: MarketplaceSourceLease,
  entry: PluginMarketplaceEntry,
  diagnostics: PluginValidationDiagnostic[],
): Promise<void> {
  const id = `${entry.name}@${lease.manifest.name}`;
  if (isDeferredEntry(entry)) {
    diagnostics.push({
      code: "plugin_validation_deferred",
      severity: "warning",
      message: `Plugin source validation requires materialization: ${id}`,
      pluginId: id,
    });
    appendCompatibilityDiagnostics(entry.raw, id, undefined, diagnostics);
    return;
  }
  const source = await resolvePluginEntrySource({
    storageRoot: ask.storageRoot,
    marketplace: lease.manifest.name,
    manifest: lease.manifest,
    entry,
    ...(lease.sourceRoot !== undefined ? { sourceRoot: lease.sourceRoot } : {}),
    ...(ask.signal ? { signal: ask.signal } : {}),
  });
  try {
    const found = validatePluginRoot({
      storageRoot: ask.storageRoot,
      marketplace: lease.manifest.name,
      root: source.path,
      entry,
    });
    diagnostics.push(...found);
  } finally {
    await cleanupPluginSourceBestEffort(source.cleanup);
  }
}

export async function /* 目录条目校验：装配清单、依赖闭包与源码检查后汇总诊断 */ validateMarketplacePlugin(
  ask: EntryValidationAsk,
): Promise<PluginValidationDiagnostic[]> {
  const id = `${ask.name}@${ask.marketplace}`;
  const diagnostics: PluginValidationDiagnostic[] = [];
  try {
    await ensureMarketplaceManifestAvailable(ask);
    const manifest = loadMarketplaceManifestSync(ask.storageRoot, ask.marketplace);
    const entry = manifest?.plugins.find((item) => item.name === ask.name);
    if (!manifest || !entry) {
      throw new CatalogOperationError("plugin_not_found", `Plugin not found: ${id}`);
    }
    // 依赖闭包失败只记一条诊断，不阻断后续源码检查。
    try {
      await resolveDependencyClosure({
        ...ask,
        load: async (marketplaceName: string) => {
          await ensureMarketplaceManifestAvailable({ ...ask, marketplace: marketplaceName });
          return loadMarketplaceManifestSync(ask.storageRoot, marketplaceName);
        },
      });
    } catch (closureFailure) {
      diagnostics.push(diagnosticForError(closureFailure, id));
    }
    const source = await resolvePluginEntrySource({ ...ask, manifest, entry });
    try {
      diagnostics.push(...validatePluginRoot({ ...ask, root: source.path, entry }));
    } finally {
      await cleanupPluginSourceBestEffort(source.cleanup);
    }
  } catch (failure) {
    diagnostics.push(diagnosticForError(failure, id));
  }
  return diagnostics;
}

export async function /* 市场来源级校验：逐条目走源码与兼容性检查 */ validateMarketplaceSource(
  ask: SourceValidationAsk,
): Promise<PluginValidationDiagnostic[]> {
  const diagnostics: PluginValidationDiagnostic[] = [];
  let lease: MarketplaceSourceLease | undefined;
  try {
    lease = await leaseMarketplace(ask);
    const targets = selectTargets(ask, lease.manifest);
    for (const entry of targets) {
      assertAtomicNotAborted(ask.signal);
      try {
        await validateEntrySource(ask, lease, entry, diagnostics);
      } catch (failure) {
        assertAtomicNotAborted(ask.signal);
        diagnostics.push(diagnosticForError(failure, `${entry.name}@${lease.manifest.name}`));
      }
    }
  } catch (failure) {
    // 先释放一次租约再判定错误归属：清理失败要并入原始错误的文案。
    const cleanup = await cleanupPluginSourceBestEffort(lease?.cleanup);
    lease = undefined;
    assertAtomicNotAborted(ask.signal);
    if (isAbort(failure)) throw failure;
    diagnostics.push(diagnosticForError(appendPluginSourceCleanupError(failure, cleanup)));
  } finally {
    await cleanupPluginSourceBestEffort(lease?.cleanup);
  }
  return diagnostics;
}

/** 本地路径的三种形态：带清单的市场目录、插件根目录、或被直接指到的清单文件。 */
async function validateMarketplaceDirectory(
  ask: PathValidationAsk,
  path: string,
): Promise<PluginValidationDiagnostic[]> {
  const entry: PluginMarketplaceEntry = { name: basename(path), raw: { name: basename(path) } };
  // 真正的清单会给出插件名，这里不按目录名做假阳性比对。
  const manifestPath = MANIFEST_DIRECTORIES.map((directory) =>
    resolve(path, directory, "plugin.json"),
  ).find(fileExists);
  const document = manifestPath === undefined ? undefined : readPluginDocumentAt(manifestPath);
  if (document) entry.name = document.manifest.name;
  return validatePluginRoot({
    ...ask,
    root: path,
    marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
    entry,
    ...(document === undefined ? {} : { document }),
  });
}

/** 直接指向清单文件时，插件根是清单目录的上一层（若清单在约定目录里）。 */
function pluginRootForManifestFile(path: string): string {
  const parent = dirname(path);
  return MANIFEST_DIRECTORIES.includes(basename(parent)) ? dirname(parent) : parent;
}

async function validateManifestFile(
  ask: PathValidationAsk,
  path: string,
): Promise<PluginValidationDiagnostic[]> {
  // 解析失败不在本函数内转换：交给外层 catch 统一转成诊断，保持原始错误信息。
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (isRecord(value) && "plugins" in value) {
    return validateMarketplaceSource({ ...ask, source: { source: "file", path } });
  }
  const document = readPluginDocumentAt(path);
  return validatePluginRoot({
    storageRoot: ask.storageRoot,
    root: pluginRootForManifestFile(path),
    document,
    marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
    entry: { name: document.manifest.name, raw: document.raw },
  });
}

export async function /* 本地路径校验：目录/清单文件/插件入口三种形态分流 */ validateLocalPluginPath(
  ask: PathValidationAsk,
): Promise<PluginValidationDiagnostic[]> {
  assertAtomicNotAborted(ask.signal);
  const path = resolve(ask.path);
  try {
    if (directoryExists(path)) {
      if (findMarketplaceFile(path)) {
        return validateMarketplaceSource({ ...ask, source: { source: "directory", path } });
      }
      return await validateMarketplaceDirectory(ask, path);
    }
    if (!fileExists(path)) {
      throw new CatalogOperationError("plugin_not_found", `Plugin path not found: ${path}`);
    }
    return await validateManifestFile(ask, path);
  } catch (failure) {
    return [diagnosticForError(failure, undefined, path)];
  }
}
