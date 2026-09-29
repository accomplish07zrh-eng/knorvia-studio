// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

function partitionDirectory(storageRoot: string): string {
  return join(storageRoot, "marketplaces", KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE);
}

function readJsonRecord(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function bundledManifest(directory: string): Record<string, unknown> | undefined {
  const envelope = readJsonRecord(join(directory, "bundled-marketplace.json"));
  return envelope?.version === 1 && isRecord(envelope.manifest) ? envelope.manifest : undefined;
}

function entries(manifest: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return Array.isArray(manifest?.plugins) ? manifest.plugins.filter(isRecord) : [];
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, "utf8");
}

function mergePartitions(directory: string): Record<string, unknown> {
  const bundled = bundledManifest(directory);
  const cdn = readJsonRecord(join(directory, "cdn-marketplace.json"));
  const remoteEntries = entries(cdn);
  const overridden = new Set(remoteEntries.filter(namedEntry).map((entry) => entry.name));
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
  return merged;
}

function assertOfficial(manifest: Record<string, unknown>): void {
  if (manifest.name !== KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE) {
    throw new Error(`Expected official marketplace ${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE}`);
  }
}

export function writeBundledOfficialMarketplacePartitionSync(input: {
  manifest: Record<string, unknown>;
  storageRoot: string;
}): Record<string, unknown> {
  assertOfficial(input.manifest);
  const directory = partitionDirectory(input.storageRoot);
  // 兼容既有分区的规范字节顺序，避免内容未变时仅因字段次序不同而重写。
  writeChangedJson(join(directory, "bundled-marketplace.json"), {
    manifest: input.manifest,
    version: 1,
  });
  return mergePartitions(directory);
}

export function writeCdnOfficialMarketplacePartitionSync(input: {
  manifest: Record<string, unknown>;
  storageRoot: string;
}): Record<string, unknown> {
  assertOfficial(input.manifest);
  const directory = partitionDirectory(input.storageRoot);
  writeChangedJson(join(directory, "cdn-marketplace.json"), input.manifest);
  return mergePartitions(directory);
}

function strictlyInside(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  return (
    !!distance &&
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
