// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

export async function /* 目录条目校验：装配清单、依赖闭包与源码检查后汇总诊断 */ validateMarketplacePlugin(input: {
  /* 所属市场 */ marketplace: string;
  /* 插件条目名 */ name: string;
  /* 插件数据根 */ storageRoot: string;
}): /* 逐条汇总的诊断 */ Promise<PluginValidationDiagnostic[]> {
  const id = `${input.name}@${input.marketplace}`;
  const diagnostics: /* 诊断累积器 */ PluginValidationDiagnostic[] = [];
  try {
    await ensureMarketplaceManifestAvailable(input);
    const manifest = /* 已刷新的市场清单 */ loadMarketplaceManifestSync(
      input.storageRoot,
      input.marketplace,
    );
    const entry = manifest?.plugins.find((item) => item.name === input.name);
    if (!manifest || !entry)
      throw new CatalogOperationError("plugin_not_found", `Plugin not found: ${id}`);
    try {
      await resolveDependencyClosure({
        ...input,
        load: async (marketplace) => {
          await ensureMarketplaceManifestAvailable({ ...input, marketplace });
          return loadMarketplaceManifestSync(input.storageRoot, marketplace);
        },
      });
    } catch (failure) {
      diagnostics.push(diagnosticForError(failure, id));
    }
    const source = await resolvePluginEntrySource({ ...input, manifest, entry });
    try {
      diagnostics.push(...validatePluginRoot({ ...input, root: source.path, entry }));
    } finally {
      await cleanupPluginSourceBestEffort(source.cleanup);
    }
  } catch (failure) {
    diagnostics.push(diagnosticForError(failure, id));
  }
  return /* 汇总结果 */ diagnostics;
}

function deferredEntry(entry: PluginMarketplaceEntry): boolean {
  /* 远程仓库类来源要先物化到本地才能读入口文件 */
  return (
    isRecord(entry.source) &&
    ["github", "git", "url", "git-subdir"]
      /* 物化前无法直接读取 */ .includes(String(entry.source.source))
  );
}

export async function /* 市场来源级校验：逐条目走源码与兼容性检查 */ validateMarketplaceSource(input: {
  /* 要求的市场身份，防同名错装 */ expectedId?: string;
  /* 只校验指定插件 */ pluginName?: string;
  /* 取消信号 */ signal?: AbortSignal;
  /* 待校验的市场来源 */ source: MarketplaceSource;
  /* 插件数据根 */ storageRoot: string;
}): /* 逐条汇总的诊断 */ Promise<PluginValidationDiagnostic[]> {
  const diagnostics: /* 诊断累积器 */ PluginValidationDiagnostic[] = [];
  let lease: MarketplaceSourceLease | undefined;
  try {
    lease = await loadMarketplaceSource(input.source, input.signal);
    const { manifest } = lease;
    if (input.expectedId !== undefined && manifest.name !== input.expectedId) {
      throw new CatalogOperationError(
        "plugin_marketplace_invalid",
        `Marketplace identity does not match ${input.expectedId}`,
      );
    }
    const targets =
      input.pluginName !== undefined
        ? manifest.plugins.filter((entry) => entry.name === input.pluginName)
        : manifest.plugins;
    if (input.pluginName !== undefined && !targets.length)
      throw new CatalogOperationError(
        "plugin_not_found",
        `Plugin not found: ${input.pluginName}@${manifest.name}`,
      );
    for (const entry of targets) {
      assertAtomicNotAborted(input.signal);
      const id = `${entry.name}@${manifest.name}`;
      if (deferredEntry(entry)) {
        diagnostics.push({
          code: /* 推迟到物化之后再校验 */ "plugin_validation_deferred",
          severity: /* 非阻断提示 */ "warning",
          message: `Plugin source validation requires materialization: ${id}`,
          pluginId: id,
        });
        appendCompatibilityDiagnostics(entry.raw, id, undefined, diagnostics);
        continue;
      }
      try {
        const source = await resolvePluginEntrySource({
          storageRoot: input.storageRoot,
          marketplace: manifest.name,
          manifest,
          entry,
          ...(lease.sourceRoot !== undefined ? { sourceRoot: lease.sourceRoot } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        try {
          diagnostics.push(
            ...validatePluginRoot({
              storageRoot: input.storageRoot,
              marketplace: manifest.name,
              root: source.path,
              entry,
            }),
          );
        } finally {
          await cleanupPluginSourceBestEffort(source.cleanup);
        }
      } catch (failure) {
        assertAtomicNotAborted(input.signal);
        diagnostics.push(diagnosticForError(failure, id));
      }
    }
  } catch (failure) {
    const cleanup = await cleanupPluginSourceBestEffort(lease?.cleanup);
    lease = undefined;
    assertAtomicNotAborted(input.signal);
    if (failure instanceof Error && failure.name === "AbortError") throw failure;
    diagnostics.push(diagnosticForError(appendPluginSourceCleanupError(failure, cleanup)));
  } finally {
    await cleanupPluginSourceBestEffort(lease?.cleanup);
  }
  return /* 汇总结果 */ diagnostics;
}

export async function /* 本地路径校验：目录/清单文件/插件入口三种形态分流 */ validateLocalPluginPath(input: {
  /* 待校验的本地路径 */ path: string;
  /* 取消信号 */ signal?: AbortSignal;
  /* 插件数据根 */ storageRoot: string;
}): /* 逐条汇总的诊断 */ Promise<PluginValidationDiagnostic[]> {
  assertAtomicNotAborted(input.signal);
  const path = resolve(input.path);
  try {
    if (directoryExists(path)) {
      if (findMarketplaceFile(path))
        return validateMarketplaceSource({ ...input, source: { source: "directory", path } });
      const entry: PluginMarketplaceEntry = { name: basename(path), raw: { name: basename(path) } };
      // The actual manifest supplies the local plugin name; there is no catalog
      // entry against which to report a spurious folder-name mismatch.
      const candidates = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"];
      const manifestPath = candidates
        .map((directory) => resolve(path, directory, "plugin.json"))
        .find(fileExists);
      const document = manifestPath ? readPluginDocumentAt(manifestPath) : undefined;
      if (document) entry.name = document.manifest.name;
      return validatePluginRoot({
        ...input,
        root: path,
        marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
        entry,
        ...(document ? { document } : {}),
      });
    }
    if (!fileExists(path))
      throw new CatalogOperationError("plugin_not_found", `Plugin path not found: ${path}`);
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(value) && "plugins" in value)
      return validateMarketplaceSource({ ...input, source: { source: "file", path } });
    const document = readPluginDocumentAt(path);
    const parent = dirname(path);
    const root = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"].includes(basename(parent))
      ? dirname(parent)
      : parent;
    return validatePluginRoot({
      storageRoot: input.storageRoot,
      root,
      document,
      marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
      entry: { name: document.manifest.name, raw: document.raw },
    });
  } catch (failure) {
    return [diagnosticForError(failure, undefined, path)];
  }
}
