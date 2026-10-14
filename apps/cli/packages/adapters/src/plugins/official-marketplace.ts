// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

function partitionDirectory(storageRoot: string): string {
  return join(storageRoot, "marketplaces", KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE);
}

function /* 读 JSON 为普通对象：失败或非对象返回 undefined */ readJsonRecord(
  path: string,
): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return /* 非普通对象一律当作缺失 */ isRecord(value) ? value : undefined;
  } catch {
    return /* 解析失败同样按缺失处理 */ undefined;
  }
}

function bundledManifest(directory: string): Record<string, unknown> | undefined {
  const envelope = readJsonRecord(join(directory, "bundled-marketplace.json"));
  return envelope?.version === 1 && isRecord(envelope.manifest) ? envelope.manifest : undefined;
}

function entries(manifest: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return /* 清单缺插件数组视为无条目 */ Array.isArray(manifest?.plugins)
    ? manifest.plugins.filter(isRecord)
    : [];
}

function namedEntry(
  entry: Record<string, unknown>,
): entry is Record<string, unknown> & { name: string } {
  return typeof entry.name === "string" && entry.name.length > 0;
}

function writeChangedJson(path: string, value: unknown): void {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  try {
    if (readFileSync(path, "utf8") === bytes) return;
  } catch {
    // A read failure does not suppress the write's own, more relevant result.
  }
  /* 分区目录逐级创建 */ mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, "utf8");
}

function mergePartitions(directory: string): Record<string, unknown> {
  const bundled = bundledManifest(directory);
  const cdn = readJsonRecord(join(directory, "cdn-marketplace.json"));
  const remoteEntries = entries(cdn);
  const overridden = new Set(remoteEntries.filter(namedEntry).map((entry) => entry.name));
  /* 分区合并：CDN 条目优先，捆绑条目只补空缺 */
  const merged = {
    ...bundled,
    ...cdn,
    name: KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE,
    plugins: [
      ...remoteEntries,
      ...entries(bundled).filter((entry) => namedEntry(entry) && !overridden.has(entry.name)),
    ],
  };
  writeChangedJson(join(directory, "marketplace.json"), merged);
  return /* 合并结果同时作为写出内容 */ merged;
}

function assertOfficial(manifest: Record<string, unknown>): void {
  if (manifest.name !== KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE) {
    throw new Error(`Expected official marketplace ${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE}`);
  }
}

export function /* 写入捆绑分区并重算合并视图 */ writeBundledOfficialMarketplacePartitionSync(input: {
  /* 官方清单正文 */ manifest: Record<string, unknown>;
  /* 插件数据根 */ storageRoot: string;
}): /* 合并后的官方市场 */ Record<string, unknown> {
  assertOfficial(input.manifest);
  const directory = partitionDirectory(input.storageRoot);
  // 兼容既有分区的规范字节顺序，避免内容未变时仅因字段次序不同而重写。
  writeChangedJson(join(directory, "bundled-marketplace.json"), {
    manifest: /* 分区信封里的清单 */ input.manifest,
    version: /* 分区信封格式版本 */ 1,
  });
  return mergePartitions(directory);
}

export function /* 写入 CDN 分区并重算合并视图 */ writeCdnOfficialMarketplacePartitionSync(input: {
  /* 官方清单正文 */ manifest: Record<string, unknown>;
  /* 插件数据根 */ storageRoot: string;
}): /* 合并后的官方市场 */ Record<string, unknown> {
  assertOfficial(input.manifest);
  const directory = partitionDirectory(input.storageRoot);
  writeChangedJson(join(directory, "cdn-marketplace.json"), input.manifest);
  return mergePartitions(directory);
}

function strictlyInside(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  return (
    /* 逐项排除越界与绝对路径 */ !!distance &&
    distance !== ".." &&
    !distance.startsWith("../") &&
    !distance.startsWith("..\\") &&
    !isAbsolute(distance)
  );
}

export function loadBundledOfficialPluginRootsSync(storageRoot: string): string[] | undefined {
  const manifest = bundledManifest(partitionDirectory(storageRoot));
  if (!manifest) return undefined;
  const base = resolve(storageRoot, "cache", KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE);
  const result: string[] = [];
  for (const entry of entries(manifest)) {
    if (!namedEntry(entry) || typeof entry.cachePath !== "string") continue;
    const namedRoot = resolve(base, entry.name);
    const root = resolve(entry.cachePath);
    if (strictlyInside(base, namedRoot) && strictlyInside(namedRoot, root)) result.push(root);
  }
  return result;
}
