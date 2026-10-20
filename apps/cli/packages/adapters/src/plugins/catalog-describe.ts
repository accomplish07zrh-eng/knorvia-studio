// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 「描述一个市场插件」：给出组件清单、诊断与展示元数据，但不做完整校验——清单损坏时
// 仍要把能从文件系统独立发现的组件报出来，这是本入口与 validate 的关键差别。
// 取源顺序是固定的三段：已安装记录 → 市场清单条目 → 临时物化。命中即停。

import type { PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { normalizeAuthorValue } from "./catalog-listing.js";
import {
  ensureMarketplaceManifestAvailable,
  loadMarketplaceManifestSync,
} from "./catalog-refresh.js";
import { listInstalledPluginRecords, resolveInstalledPluginRoot } from "./catalog-repository.js";
import type { DescribeMarketplacePluginInput } from "./catalog-describe-types.js";
import type {
  DescribeMarketplacePluginResult,
  PluginManifestDisplayMetadata,
  PluginMarketplaceEntry,
} from "./catalog-types.js";
import { cleanupPluginSourceBestEffort, directoryExists } from "./helpers.js";
import { enumeratePluginComponents } from "./plugin-components.js";
import { readPluginDocument, syntheticPluginManifest } from "./plugin-document.js";
import { resolvePluginEntrySource } from "./plugin-source.js";
import { diagnosticForError, loadedForRoot } from "./plugin-validation.js";

/** 展示元数据的候选字段：逐个判定「有内容才透出」，最后按有无内容决定是否整体返回。 */
const DISPLAY_FIELDS = ["homepage", "version"] as const;

/** 非空字符串判定：类型收窄 + 排除空串，两件事一起做。 */
function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** 从清单抽展示元数据：作者拆两键，主页与版本走白名单，全空则整体缺席。 */
function displayMetadata(
  manifest: PluginManifest | null,
): PluginManifestDisplayMetadata | undefined {
  if (!manifest) return undefined;
  const metadata: PluginManifestDisplayMetadata = {};
  const author = normalizeAuthorValue(manifest.author);
  if (author?.name) metadata.author = author.name;
  if (author?.url) metadata.authorUrl = author.url;
  for (const field of DISPLAY_FIELDS) {
    if (nonEmptyString(manifest[field])) metadata[field] = manifest[field];
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/** 描述一个插件根所需的三样：根路径、所属市场、可选的市场条目。 */
type DescribeTarget = {
  root: string;
  marketplace: string;
  entry?: PluginMarketplaceEntry;
};

/** 在插件根上收集组件与诊断。清单坏掉不阻断组件发现，只留一条诊断。 */
function describeRoot(target: DescribeTarget): DescribeMarketplacePluginResult {
  const diagnostics: PluginDiagnostic[] = [];
  const manifest = resolveManifest(target.root, target.entry);
  const loaded = manifest.value
    ? loadedForRoot(target.root, target.marketplace, manifest.value, manifest.path)
    : undefined;
  const outcome = collectComponents(target.root, manifest.value, diagnostics, loaded);
  if (outcome.failure !== undefined) {
    diagnostics.push(diagnosticForError(outcome.failure, loaded?.id, target.root));
  }
  const metadata = displayMetadata(manifest.value);
  return {
    components: outcome.components,
    diagnostics,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** 清单解析：文档优先，宽松条目退到合成清单，都不成立时为 null。 */
function resolveManifest(
  root: string,
  entry?: PluginMarketplaceEntry,
): { value: PluginManifest | null; path: string | undefined } {
  const absent = { value: null, path: undefined };
  let document: ReturnType<typeof readPluginDocument>;
  try {
    document = readPluginDocument(root);
  } catch {
    // 清单损坏时仍允许组件被独立发现：本入口刻意比完整校验宽松。
    return absent;
  }
  if (document) return { value: document.manifest, path: document.path };
  const synthetic = entry?.strict === false ? syntheticPluginManifest(entry) : null;
  return synthetic === null ? absent : { value: synthetic, path: undefined };
}

/**
 * 组件枚举：失败只记一条诊断，不让整个描述失败。
 * 返回「组件 + 是否失败」，由调用方决定要不要补诊断，避免在这里嵌套错误处理。
 */
function collectComponents(
  root: string,
  manifest: PluginManifest | null,
  diagnostics: PluginDiagnostic[],
  loaded: NonNullable<ReturnType<typeof loadedForRoot>> | undefined,
): { components: DescribeMarketplacePluginResult["components"]; failure: unknown } {
  const components: DescribeMarketplacePluginResult["components"] = [];
  try {
    const found = enumeratePluginComponents(root, manifest, {
      diagnostics,
      ...(loaded === undefined ? {} : { loaded }),
    });
    return { components: found, failure: undefined };
  } catch (failure) {
    return { components, failure };
  }
}

/** 定位一个市场条目所要的三样东西：数据根、市场标识、插件名。 */
type CatalogQuery = {
  storageRoot: string;
  marketplace: string;
  name: string;
};

/** 市场清单里找同名条目；清单与条目任一缺失都按「找不到」处理。 */
function findMarketplaceEntry(query: CatalogQuery): PluginMarketplaceEntry | undefined {
  const manifest = loadMarketplaceManifestSync(query.storageRoot, query.marketplace);
  return manifest?.plugins.find((item) => item.name === query.name);
}

/** 已安装记录且目录仍在时，直接在安装根上描述；否则返回 undefined 交给下一段。 */
function describeFromInstalled(
  input: DescribeMarketplacePluginInput,
  id: string,
): DescribeMarketplacePluginResult | undefined {
  const query: CatalogQuery = {
    storageRoot: input.storageRoot,
    marketplace: input.marketplace,
    name: input.name,
  };
  const installed = listInstalledPluginRecords(query.storageRoot).find(
    (record) => record.id === id,
  );
  if (!installed) return undefined;
  const root = resolveInstalledPluginRoot(query.storageRoot, installed);
  if (!directoryExists(root)) return undefined;
  return describeRoot({
    root,
    marketplace: query.marketplace,
    entry: findMarketplaceEntry(query),
  });
}

export async function describeMarketplacePlugin(
  input: DescribeMarketplacePluginInput,
): Promise<DescribeMarketplacePluginResult> {
  const id = `${input.name}@${input.marketplace}`;
  try {
    const installed = describeFromInstalled(input, id);
    if (installed) return installed;

    await ensureMarketplaceManifestAvailable(input);
    const manifest = loadMarketplaceManifestSync(input.storageRoot, input.marketplace);
    const entry = manifest?.plugins.find((item) => item.name === input.name);
    if (!manifest || !entry)
      throw new CatalogOperationError("plugin_not_found", `Plugin not found: ${id}`);

    const source = await resolvePluginEntrySource({ ...input, manifest, entry });
    try {
      return describeRoot({ root: source.path, marketplace: input.marketplace, entry });
    } finally {
      await cleanupPluginSourceBestEffort(source.cleanup);
    }
  } catch (error) {
    return { components: [], diagnostics: [diagnosticForError(error, id)] };
  }
}
