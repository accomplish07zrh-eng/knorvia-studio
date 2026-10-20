// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件清单文档的读取、校验与合成。清单可能在三个约定目录之一，读取时按固定顺序找第一个
// 存在的；清单名必须符合插件名规则。宽松条目（strict === false）允许没有清单，此时按条目
// 字段合成一份最小清单——合成时要把「只属于市场条目」的字段剥掉，否则会污染清单。

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PluginManifest } from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import type { PluginMarketplaceEntry } from "./catalog-types.js";
import { fileExists, isRecord } from "./helpers.js";

/** 清单的三个约定位置，按优先级排列；第一个存在的即为该插件清单。 */
export const PLUGIN_MANIFEST_LOCATIONS = [
  ".knorvia-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
] as const;

/** 补写合成清单时用的落点（宽松条目没有清单时才写）。 */
const SYNTHETIC_MANIFEST_DIRECTORY = ".claude-plugin";

/** 插件名规则：小写字母数字起头，后续允许点、下划线、连字符，最长 128。 */
const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

/** 缺省版本：清单没写版本时用它，避免下游拿到 undefined。 */
const FALLBACK_VERSION = "0.0.0";

/**
 * 只属于市场条目、不属于清单的字段。合成清单时逐个剥掉。
 * 写成映射而非空白分隔串，避免把字段名压进一个字符串再拆分。
 */
const ENTRY_ONLY_FIELDS = {
  source: true,
  category: true,
  tags: true,
  strict: true,
  displayName: true,
  displayName_i18n: true,
  description_i18n: true,
  icon: true,
  privacyPolicy: true,
  termsOfService: true,
  heroImage: true,
  examplePrompts: true,
  examplePrompts_i18n: true,
  requiresPaidPlan: true,
} as const;

export function validPluginName(value: unknown): value is string {
  return typeof value === "string" && PLUGIN_NAME_PATTERN.test(value);
}

export interface PluginDocument {
  /* 规范化后的清单 */ manifest: PluginManifest;
  /* 清单原文 */ raw: Record<string, unknown>;
  /* 清单文件路径 */ path: string;
}

/** 三个约定位置里第一个存在的清单路径。 */
export function findPluginManifestPath(root: string): string | undefined {
  const candidates = PLUGIN_MANIFEST_LOCATIONS.map((location) => join(root, location));
  return candidates.find(fileExists);
}

/** 读插件根下的清单：按约定顺序找到第一个存在的位置再读它。 */
export function readPluginDocument(root: string): PluginDocument | undefined {
  const path = findPluginManifestPath(root);
  return path === undefined ? undefined : readPluginDocumentAt(path);
}

/** 读并校验一个具体路径的清单。读不出 JSON 与内容不合格都抛同一类错误。 */
export function readPluginDocumentAt(path: string): PluginDocument {
  const parsed = parseManifestFile(path);
  const declaredName = isRecord(parsed) ? parsed.name : undefined;
  const name = typeof declaredName === "string" ? declaredName.trim() : undefined;
  if (!validPluginName(name)) {
    throw new CatalogOperationError("plugin_manifest_invalid", `Invalid plugin manifest: ${path}`);
  }
  const manifest: PluginManifest = {
    ...(parsed as Record<string, unknown>),
    name,
    version:
      typeof (parsed as Record<string, unknown>).version === "string"
        ? ((parsed as Record<string, unknown>).version as string)
        : FALLBACK_VERSION,
  } as PluginManifest;
  return { manifest, raw: parsed as Record<string, unknown>, path };
}

/** 解析清单文件；失败统一转成目录错误，文案带上路径。 */
function parseManifestFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Cannot read plugin manifest: ${path}`,
    );
  }
}

/**
 * 安装版本探测。宽松条目允许清单缺失或损坏：探测失败就退回条目自带的版本。
 * 严格条目的合法性由 validatePluginRoot 与 ZIP 门禁负责，这里只做尽力读取。
 */
export function installationVersion(entry: PluginMarketplaceEntry, root: string): string {
  const path = findPluginManifestPath(root);
  if (path !== undefined) {
    try {
      const value: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (isRecord(value) && typeof value.version === "string" && value.version.trim().length > 0) {
        return value.version;
      }
    } catch {
      // 宽松探测：读不到就继续走条目自带的版本，不在这里判定清单非法。
    }
  }
  return entry.version || FALLBACK_VERSION;
}

/** 剥掉条目专属字段后合成清单：保留清单名与版本，其余原样透传。 */
export function syntheticPluginManifest(entry: PluginMarketplaceEntry): PluginManifest {
  const kept: [string, unknown][] = [];
  for (const [key, value] of Object.entries(entry.raw)) {
    if (!Object.hasOwn(ENTRY_ONLY_FIELDS, key)) kept.push([key, value]);
  }
  const manifest: PluginManifest = {
    ...Object.fromEntries(kept),
    name: entry.name,
    version: entry.version ?? FALLBACK_VERSION,
  } as PluginManifest;
  return manifest;
}

/** ZIP 安装前置：必须有清单，或能由宽松条目合成；且清单名必须与条目名一致。 */
export function requireZipPluginManifest(
  root: string,
  /* 目录条目 */ entry: PluginMarketplaceEntry,
  /* 所属市场 */ marketplace: string,
): /* 读不到或不匹配即抛错 */ void {
  const existing = readPluginDocument(root);
  const manifest =
    existing?.manifest ?? (entry.strict === false ? syntheticPluginManifest(entry) : undefined);
  if (!manifest) {
    throw new CatalogOperationError(
      "plugin_manifest_not_found",
      `Plugin manifest not found: ${entry.name}@${marketplace}`,
    );
  }
  if (manifest.name !== entry.name) {
    throw new CatalogOperationError(
      "plugin_manifest_invalid",
      `Plugin manifest name does not match ${entry.name}`,
    );
  }
}

/** 宽松条目缺清单时补写一份合成清单，让后续安装步骤能读到文件。 */
export async function ensureInstallManifest(
  root: string,
  /* 宽松条目缺清单时补写 */ entry: PluginMarketplaceEntry,
): Promise<void> {
  if (entry.strict !== false || findPluginManifestPath(root) !== undefined) return;
  const path = join(root, SYNTHETIC_MANIFEST_DIRECTORY, "plugin.json");
  const manifest = syntheticPluginManifest(entry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
