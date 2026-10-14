// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  KNORVIA_INLINE_PLUGIN_MARKETPLACE,
  KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE,
  isOfficialMarketplaceId,
  type PluginDiagnostic,
  type PluginDiscoverRequest,
  type PluginStoreListing,
} from "@knorvia/contracts";
import { loadBundledOfficialPluginRootsSync } from "./official-marketplace.js";
import {
  listInstalledPluginRecords,
  loadKnownMarketplacesSync,
  loadMarketplaceManifestSync,
  resolveInstalledPluginRoot,
} from "./marketplace.js";
import { isNotFoundError, throwIfAborted } from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import type { PluginAbortOptions, PluginCandidate } from "./types.js";

function directories(root: string, diagnostics: PluginDiagnostic[]): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (!isNotFoundError(error))
      diagnostic(
        diagnostics,
        "plugin_root_not_found",
        "Cannot enumerate plugin cache",
        undefined,
        root,
      );
    return /* 枚举失败按空清单处理，诊断已入列 */ [];
  }
}

export function collectCandidates(
  /* 发现请求：配置目录/官方根/存储根 */ request: PluginDiscoverRequest,
  /* 逐条诊断收集器 */ diagnostics: PluginDiagnostic[],
  /* 中止选项 */ options?: PluginAbortOptions,
): /* 三类来源汇总为候选数组 */ PluginCandidate[] {
  throwIfAborted(options);
  const candidates: PluginCandidate[] = request.config.dirs.map((root) => ({
    rootPath: /* 内联插件根：相对工作目录解析 */ resolve(request.workingDirectory, root),
    marketplace: KNORVIA_INLINE_PLUGIN_MARKETPLACE,
    source: /* 配置目录内联来源 */ "inline",
    defaultEnabled: /* 内联目录默认启用 */ true,
  }));
  const official = (rootPath: string): void => {
    candidates.push({
      rootPath: resolve(rootPath),
      marketplace: KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE,
      source: "official",
      defaultEnabled: /* 官方捆绑默认不启用，需显式打开 */ false,
    });
  };
  for (const root of request.officialPluginRoots ?? []) official(root);
  const bundled = loadBundledOfficialPluginRootsSync(request.storageRoot);
  if (bundled !== undefined) {
    for (const root of bundled) official(root);
  } else {
    const cache = join(request.storageRoot, "cache");
    for (const market of directories(cache, diagnostics)) {
      const name = market.slice(cache.length + 1);
      if (!isOfficialMarketplaceId(name)) continue;
      for (const plugin of directories(market, diagnostics))
        for (const version of directories(plugin, diagnostics)) official(version);
    }
  }
  for (const record of listInstalledPluginRecords(request.storageRoot)) {
    throwIfAborted(/* 每条记录前复查中止，长清单也能及时退出 */ options);
    candidates.push({
      rootPath: resolveInstalledPluginRoot(request.storageRoot, record),
      marketplace: record.marketplace,
      source: "cache",
      defaultEnabled: /* 已安装插件沿用安装时的启用设置 */ false,
    });
  }
  return candidates;
}

export function /* 汇总各市场清单里的门店展示信息（键为 插件名@市场） */ collectListings(
  /* 市场数据根目录 */ storageRoot: string,
): Record<string, PluginStoreListing> {
  const entries: Array<[string, PluginStoreListing]> = [];
  for (const market of loadKnownMarketplacesSync(storageRoot)) {
    const manifest = loadMarketplaceManifestSync(storageRoot, market.id);
    for (const plugin of manifest?.plugins ?? [])
      if (plugin.listing) entries.push([`${plugin.name}@${market.id}`, plugin.listing]);
  }
  return Object.fromEntries(entries);
}
