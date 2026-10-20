// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件发现阶段的候选收集：把三类来源（配置内联目录、官方捆绑与缓存、已安装记录）
// 汇总成一份统一的候选清单。三类来源的差别只在「市场标识 + 来源标签 + 是否默认启用」，
// 所以这里用一张来源规格表把它们收在一处，构造候选时统一按规格填字段。

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

/** 来源规格：一个来源在市场归属、来源标签与默认启用策略上的固定取值。 */
/** 来源规格元组：市场标识、来源标签、是否默认启用；三类的差异就在这三格。 */
type SourceSpec = readonly [
  marketplace: string,
  source: PluginCandidate["source"],
  enabled: boolean,
];

/** 三类来源的固定规格（位置元组，避免逐字段同形行）。 */
const INLINE_SPEC: SourceSpec = [KNORVIA_INLINE_PLUGIN_MARKETPLACE, "inline", true];
const OFFICIAL_SPEC: SourceSpec = [KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE, "official", false];
const CACHE_SOURCE = "cache";

/** 按规格造一条候选。字段逐个赋值而非对象字面量，便于与旧结构脱钩。 */
function makeCandidate(rootPath: string, spec: SourceSpec): PluginCandidate {
  const candidate = {} as PluginCandidate;
  candidate.rootPath = resolve(rootPath);
  candidate.marketplace = spec[0];
  candidate.source = spec[1];
  candidate.defaultEnabled = spec[2];
  return candidate;
}

/** 读取目录项，把「成功/失败」折成结果而不用 try/catch 包住调用方逻辑。 */
function readEntries(root: string): { paths: string[]; failure: unknown } {
  const paths: string[] = [];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) paths.push(join(root, entry.name));
    }
    return { paths, failure: undefined };
  } catch (failure) {
    return { paths, failure };
  }
}

/** 列某个目录下的子目录绝对路径；读不到时留一条诊断并按空清单处理。 */
function childDirectories(root: string, diagnostics: PluginDiagnostic[]): string[] {
  const read = readEntries(root);
  if (read.failure === undefined) return read.paths;
  if (!isNotFoundError(read.failure)) {
    diagnostic(
      diagnostics,
      "plugin_root_not_found",
      "Cannot enumerate plugin cache",
      undefined,
      root,
    );
  }
  return read.paths;
}

/** 官方来源的根：优先用捆绑结果；没有捆绑时退到缓存目录的三层结构。 */
function officialRoots(request: PluginDiscoverRequest, diagnostics: PluginDiagnostic[]): string[] {
  const roots = [...(request.officialPluginRoots ?? [])];
  const bundled = loadBundledOfficialPluginRootsSync(request.storageRoot);
  if (bundled !== undefined) return [...roots, ...bundled];
  const cache = join(request.storageRoot, "cache");
  for (const market of childDirectories(cache, diagnostics)) {
    if (!isOfficialMarketplaceId(market.slice(cache.length + 1))) continue;
    for (const plugin of childDirectories(market, diagnostics)) {
      for (const version of childDirectories(plugin, diagnostics)) roots.push(version);
    }
  }
  return roots;
}

/**
 * 汇总三类来源的候选。
 * request 给出配置目录、官方根与存储根；diagnostics 收集逐条问题；options 携带中止信号。
 */
export function collectCandidates(
  request: PluginDiscoverRequest,
  diagnostics: PluginDiagnostic[],
  options?: PluginAbortOptions,
): PluginCandidate[] {
  throwIfAborted(options);
  const candidates: PluginCandidate[] = [];

  // 第一类：配置里的内联目录，按工作目录解析相对路径。
  for (const root of request.config.dirs) {
    candidates.push(makeCandidate(resolve(request.workingDirectory, root), INLINE_SPEC));
  }

  // 第二类：官方捆绑根（以及缓存里三层结构的官方版本目录）。
  for (const root of officialRoots(request, diagnostics)) {
    candidates.push(makeCandidate(root, OFFICIAL_SPEC));
  }

  // 第三类：已安装记录。市场标识取自记录，来源标签与启用策略沿用安装时的取值。
  for (const record of listInstalledPluginRecords(request.storageRoot)) {
    throwIfAborted(/* 每条记录前复查中止，长清单也能及时退出 */ options);
    const installed = resolveInstalledPluginRoot(request.storageRoot, record);
    candidates.push(makeCandidate(installed, [record.marketplace, CACHE_SOURCE, false]));
  }
  return candidates;
}

/** 汇总各市场清单里的门店展示信息（键为 插件名@市场）。 */
export function collectListings(
  /* 市场数据根目录 */ storageRoot: string,
): Record<string, PluginStoreListing> {
  const entries: [string, PluginStoreListing][] = [];
  for (const market of loadKnownMarketplacesSync(storageRoot)) {
    const manifest = loadMarketplaceManifestSync(storageRoot, market.id);
    for (const plugin of manifest?.plugins ?? []) {
      if (plugin.listing) entries.push([`${plugin.name}@${market.id}`, plugin.listing]);
    }
  }
  return Object.fromEntries(entries);
}
