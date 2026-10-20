// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 官方市场由两个分区拼成：捆绑分区（随安装包一起发布）与 CDN 分区（可远端更新）。
// 合并视图写到 marketplace.json：CDN 条目优先，捆绑条目只补 CDN 没覆盖的名字。
// 两个分区各自写入时会顺手重算合并视图，因此读到 marketplace.json 的地方不需要自己拼。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

/** 分区目录名与两个分区的文件名、合并视图文件名。 */
const PARTITION_ROOT = "marketplaces";
const BUNDLED_FILE = "bundled-marketplace.json";
const CDN_FILE = "cdn-marketplace.json";
const MERGED_FILE = "marketplace.json";

/** 捆绑分区的信封版本：目前只认 1，其它版本按「分区缺失」处理。 */
const BUNDLED_ENVELOPE_VERSION = 1;

/** 插件缓存目录名。 */
const CACHE_ROOT = "cache";

/** 官方市场目录。 */
function partitionDirectory(storageRoot: string): string {
  return join(storageRoot, PARTITION_ROOT, KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE);
}

/** 读一个 JSON 文件为普通对象；读不到、解析失败或不是对象都返回 undefined。 */
function readJsonRecord(path: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? parsed : undefined;
}

/** 捆绑分区里的清单正文：信封版本与内层对象都要合格。 */
function bundledManifest(directory: string): Record<string, unknown> | undefined {
  const envelope = readJsonRecord(join(directory, BUNDLED_FILE));
  if (envelope === undefined) return undefined;
  if (envelope.version !== BUNDLED_ENVELOPE_VERSION) return undefined;
  return isRecord(envelope.manifest) ? envelope.manifest : undefined;
}

/** 清单里的插件数组；缺失或不是数组都视为空。 */
function entries(manifest: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const plugins = manifest?.plugins;
  return Array.isArray(plugins) ? plugins.filter(isRecord) : [];
}

/** 条目是否带可用名（合并与缓存根推导都要名字）。 */
function namedEntry(
  entry: Record<string, unknown>,
): entry is Record<string, unknown> & { name: string } {
  return typeof entry.name === "string" && entry.name.length > 0;
}

/** 只在内容真的变化时写盘，避免无谓的 mtime 抖动。 */
function writeChangedJson(path: string, value: unknown): void {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  let unchanged = false;
  try {
    unchanged = readFileSync(path, "utf8") === bytes;
  } catch {
    // 读不到就当作需要写入；真正的写错误由下面的写入自己抛出。
  }
  if (unchanged) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, "utf8");
}

/** 重算合并视图并写回 marketplace.json，返回同一份内容。 */
function mergePartitions(directory: string): Record<string, unknown> {
  const bundled = bundledManifest(directory);
  const cdn = readJsonRecord(join(directory, CDN_FILE));
  const remote = entries(cdn);
  const covered = new Set(remote.filter(namedEntry).map((entry) => entry.name));
  const bundledOnly = entries(bundled).filter(
    (entry) => namedEntry(entry) && !covered.has(entry.name),
  );
  const merged = { ...bundled, ...cdn } as Record<string, unknown>;
  merged.name = KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE;
  merged.plugins = [...remote, ...bundledOnly];
  writeChangedJson(join(directory, MERGED_FILE), merged);
  return merged;
}

/** 官方市场的清单名必须是官方标识，否则写入没有意义。 */
function assertOfficial(manifest: Record<string, unknown>): void {
  if (manifest.name !== KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE) {
    throw new Error(`Expected official marketplace ${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE}`);
  }
}

/** 分区写入的公共入参。 */
type PartitionWriteAsk = {
  manifest: Record<string, unknown>;
  storageRoot: string;
};

export function /* 写入捆绑分区并重算合并视图 */ writeBundledOfficialMarketplacePartitionSync(
  ask: PartitionWriteAsk,
): Record<string, unknown> {
  assertOfficial(ask.manifest);
  const directory = partitionDirectory(ask.storageRoot);
  // 信封字段顺序固定为 manifest、version，保持既有分区的规范字节顺序。
  const envelope: Record<string, unknown> = {};
  envelope.manifest = ask.manifest;
  envelope.version = BUNDLED_ENVELOPE_VERSION;
  writeChangedJson(join(directory, BUNDLED_FILE), envelope);
  return mergePartitions(directory);
}

export function /* 写入 CDN 分区并重算合并视图 */ writeCdnOfficialMarketplacePartitionSync(
  ask: PartitionWriteAsk,
): Record<string, unknown> {
  assertOfficial(ask.manifest);
  const directory = partitionDirectory(ask.storageRoot);
  writeChangedJson(join(directory, CDN_FILE), ask.manifest);
  return mergePartitions(directory);
}

/**
 * candidate 是否严格位于 root 之内：不能是 root 本身，也不能经 `..` 逃出。
 * 用于把清单里声明的缓存路径限制在官方缓存根下。
 */
function strictlyInside(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  if (distance.length === 0) return false;
  if (distance === "..") return false;
  if (distance.startsWith("../") || distance.startsWith("..\\")) return false;
  return !isAbsolute(distance);
}

/** 捆绑分区里声明的插件缓存根；没有捆绑分区时返回 undefined。 */
export function loadBundledOfficialPluginRootsSync(storageRoot: string): string[] | undefined {
  const manifest = bundledManifest(partitionDirectory(storageRoot));
  if (manifest === undefined) return undefined;
  const base = resolve(storageRoot, CACHE_ROOT, KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE);
  const roots: string[] = [];
  for (const entry of entries(manifest)) {
    if (!namedEntry(entry)) continue;
    if (typeof entry.cachePath !== "string") continue;
    const namedRoot = resolve(base, entry.name);
    const declared = resolve(entry.cachePath);
    // 两层都要在缓存根内：先限制插件名目录，再限制声明路径。
    if (!strictlyInside(base, namedRoot)) continue;
    if (!strictlyInside(namedRoot, declared)) continue;
    roots.push(declared);
  }
  return roots;
}
