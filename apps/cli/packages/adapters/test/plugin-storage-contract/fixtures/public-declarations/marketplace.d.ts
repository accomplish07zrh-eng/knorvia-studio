// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

import type { PluginDiagnostic, PluginStoreListing } from "@knorvia/contracts";
import { type PluginComponentGroup } from "./plugin-components.js";
export type MarketplaceSource =
  | {
      source: "url";
      headers?: Record<string, string>;
      url: string;
    }
  | {
      path?: string;
      ref?: string;
      repo: string;
      source: "github";
      sparsePaths?: string[];
    }
  | {
      path?: string;
      ref?: string;
      source: "git";
      sparsePaths?: string[];
      url: string;
    }
  | {
      package: string;
      source: "npm";
    }
  | {
      source: "file";
      path: string;
    }
  | {
      source: "directory";
      path: string;
    }
  | {
      hostPattern: string;
      source: "hostPattern";
    }
  | {
      pathPattern: string;
      source: "pathPattern";
    }
  | {
      source: "settings";
      marketplace: PluginMarketplaceManifest;
    };
export interface PluginMarketplaceEntry {
  name: string;
  category?: string;
  description?: string;
  version?: string;
  source?: unknown;
  cachePath?: string;
  dependencies?: string[];
  strict?: boolean;
  tags?: string[];
  listing?: PluginStoreListing;
  raw: Record<string, unknown>;
}
export interface PluginMarketplaceManifest {
  name: string;
  description?: string;
  plugins: PluginMarketplaceEntry[];
  allowCrossMarketplaceDependenciesOn?: string[];
  pluginRoot?: string;
  featured?: string[];
  raw: Record<string, unknown>;
}
export interface KnownMarketplaceRecord {
  id: string;
  source: MarketplaceSource;
  name: string;
  description?: string;
  addedAt: string;
  lastUpdated?: string;
  lastRefreshFailure?: MarketplaceRefreshFailure;
  pluginCount: number;
  /** 内部崩溃恢复代际；协议/UI 投影不暴露。 */
  cacheTransactionId?: string;
}
export interface MarketplaceRefreshFailure {
  code: PluginDiagnostic["code"];
  failedAt: string;
  message: string;
}
export interface InstalledPluginRecord {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  installPath: string;
  installedAt: string;
  updatedAt?: string;
  scope: "user" | "workspace";
  dependencies?: string[];
  source?: unknown;
  /** 内部崩溃恢复代际；协议/UI 投影不暴露。 */
  cacheTransactionId?: string;
}
interface MarketplaceInstallResult {
  closure: string[];
  installed: InstalledPluginRecord[];
}
export interface PluginValidationDiagnostic {
  code: PluginDiagnostic["code"];
  message: string;
  path?: string;
  pluginId?: string;
  severity: PluginDiagnostic["severity"];
}
export type {
  PluginComponentGroup,
  PluginComponentItem,
  PluginComponentKind,
} from "./plugin-components.js";
export interface DescribeMarketplacePluginResult {
  components: PluginComponentGroup[];
  diagnostics: PluginValidationDiagnostic[];
  metadata?: PluginManifestDisplayMetadata;
}
export interface PluginManifestDisplayMetadata {
  author?: string;
  authorUrl?: string;
  homepage?: string;
  version?: string;
}
export declare function parseMarketplaceSourceInput(input: string): Promise<MarketplaceSource>;
export declare function loadKnownMarketplacesSync(storageRoot: string): KnownMarketplaceRecord[];
export declare function ensureDefaultPluginMarketplaces(
  storageRoot: string,
): KnownMarketplaceRecord[];
export declare function ensureMarketplaceManifestAvailable(input: {
  marketplace: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<KnownMarketplaceRecord | null>;
export declare function addMarketplace(input: {
  expectedId?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
  trustedId?: string;
}): Promise<KnownMarketplaceRecord>;
export declare function updateMarketplace(input: {
  marketplace?: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<KnownMarketplaceRecord[]>;
export declare function removeMarketplace(input: {
  marketplace: string;
  storageRoot: string;
}): Promise<void>;
export declare function loadMarketplaceManifestSync(
  storageRoot: string,
  marketplace: string,
): PluginMarketplaceManifest | null;
export declare function listInstalledPluginRecords(storageRoot: string): InstalledPluginRecord[];
export declare function resolveInstalledPluginRoot(
  storageRoot: string,
  record: InstalledPluginRecord,
): string;
export declare function installMarketplacePlugin(input: {
  marketplace: string;
  name: string;
  signal?: AbortSignal;
  storageRoot: string;
  scope?: "user" | "workspace";
  allowCrossMarketplaces?: ReadonlySet<string>;
}): Promise<MarketplaceInstallResult>;
export declare function uninstallMarketplacePlugin(input: {
  pluginId: string;
  storageRoot: string;
  removeCache?: boolean;
  /** `knorvia plugins uninstall --keep-data`：删安装缓存但保留 data/<plugin-id> 用户数据目录。 */
  keepData?: boolean;
}): Promise<InstalledPluginRecord | null>;
export declare function validateMarketplacePlugin(input: {
  marketplace: string;
  name: string;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]>;
/**
 * 按需枚举单个插件的组件「名称 + 描述」，供 marketplace 详情 UI 使用。
 * - 已安装插件：直接读本地缓存/安装目录，无需联网。
 * - 未安装候选：解析并按需临时 clone 插件源（finally 清理临时目录），参照 validateMarketplacePlugin。
 * 组件名称与描述来自组件目录的 frontmatter（command/agent 的 .md、skill 的 SKILL.md）、
 * 以及 manifest（hooks 事件名、mcpServers 名称、object 形式声明的 commands/agents）。
 * 任何一类组件读取失败都降级为「能拿到多少返回多少」+ 诊断，不抛断整个详情。
 */
export declare function describeMarketplacePlugin(input: {
  marketplace: string;
  name: string;
  storageRoot: string;
}): Promise<DescribeMarketplacePluginResult>;
export declare function validateMarketplaceSource(input: {
  expectedId?: string;
  pluginName?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]>;
/**
 * 校验本地插件或 marketplace 路径，只读解析 manifest 并返回结构化诊断，不写入 storage。
 * 输入可以是目录或 manifest 文件；目录按 marketplace 优先、插件根目录其次的顺序识别。
 */
export declare function validateLocalPluginPath(input: {
  path: string;
  signal?: AbortSignal;
  storageRoot: string;
}): Promise<PluginValidationDiagnostic[]>;
export declare function readPluginSourceSha(source: unknown): string | undefined;
export declare function readPluginSourceIdentityPin(source: unknown): string | undefined;
/**
 * 从目录条目解析可选的商店展示信息。兼容字符串或对象形式的 author、i18n map 和多值字段；
 * 解析不到有效内容时返回 undefined，避免给每个条目挂空对象。
 */
export declare function parseEntryStoreListing(
  entry: Record<string, unknown>,
): PluginStoreListing | undefined;
/** author 字段兼容 string 与 {name,url}（plugin.json 与目录条目共用此规则）。 */
export declare function normalizeAuthorValue(value: unknown):
  | {
      name?: string;
      url?: string;
    }
  | undefined;
export declare function getPluginDataDir(storageRoot: string, pluginId: string): string;
//# sourceMappingURL=marketplace.d.ts.map
