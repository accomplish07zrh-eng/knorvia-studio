// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件目录（marketplace）这一层的形状声明。
//
// 四组形状，按「数据从哪来 → 怎么存 → 怎么校验 → 怎么展示」排列：
//   - **来源**：`MarketplaceSource` 是九分支判别联合，每个分支只带它自己需要的字段；
//   - **清单**：名字 + 原始对象 + 若干条目；条目本身有一组可选展示字段；
//   - **记录**：已登记的市场、已安装的插件、刷新失败；
//   - **校验与展示**：诊断条目与展示元数据。
//
// 字段声明顺序统一按「标识 → 来源/归属 → 内容 → 时间 → 可选扩展」组织，
// 与 JSON 落盘后的自然阅读顺序一致。

import type { PluginDiagnostic, PluginStoreListing } from "@knorvia/contracts";
import type { PluginComponentGroup } from "./plugin-components.js";

// ── 来源：九个判别分支，各分支只带自己需要的字段 ────────────────────
type UrlSource = { source: "url"; url: string; headers?: Record<string, string> };
type RepoSource = {
  source: "github";
  repo: string;
  ref?: string;
  path?: string;
  sparsePaths?: string[];
};
type GitSource = {
  source: "git";
  url: string;
  ref?: string;
  path?: string;
  sparsePaths?: string[];
};
type NpmSource = { source: "npm"; package: string };
type FileSource = { source: "file"; path: string };
type DirectorySource = { source: "directory"; path: string };
type HostPatternSource = { source: "hostPattern"; hostPattern: string };
type PathPatternSource = { source: "pathPattern"; pathPattern: string };
type SettingsSource = { source: "settings"; marketplace: PluginMarketplaceManifest };

/** marketplace 的来源：九个分支的判别联合。 */
export type MarketplaceSource =
  | UrlSource
  | RepoSource
  | GitSource
  | NpmSource
  | FileSource
  | DirectorySource
  | HostPatternSource
  | PathPatternSource
  | SettingsSource;

// ── 清单 ────────────────────────────────────────────────────────────
/** 清单里的一条插件条目：标识与原始对象在前，展示三元随后，其余可选扩展在后。 */
export interface PluginMarketplaceEntry {
  name: string;
  raw: Record<string, unknown>;
  category?: string;
  description?: string;
  version?: string;
  source?: unknown;
  cachePath?: string;
  dependencies?: string[];
  strict?: boolean;
  tags?: string[];
  listing?: PluginStoreListing;
}

/** 一份 marketplace 清单：名字与原始对象，加上它的条目与可选限制。 */
export interface PluginMarketplaceManifest {
  name: string;
  raw: Record<string, unknown>;
  plugins: PluginMarketplaceEntry[];
  description?: string;
  allowCrossMarketplaceDependenciesOn?: string[];
  pluginRoot?: string;
  featured?: string[];
}

// ── 记录 ────────────────────────────────────────────────────────────
/** 一次刷新失败：错误码 + 发生时间 + 文案。 */
export interface MarketplaceRefreshFailure {
  code: PluginDiagnostic["code"];
  failedAt: string;
  message: string;
}

/** 已登记的市场：标识、来源、名字，然后是计数、时间与上次失败。 */
export interface KnownMarketplaceRecord {
  id: string;
  source: MarketplaceSource;
  name: string;
  addedAt: string;
  pluginCount: number;
  description?: string;
  lastUpdated?: string;
  lastRefreshFailure?: MarketplaceRefreshFailure;
  cacheTransactionId?: string;
}

/** 已安装的插件：标识与归属、版本与安装位置、时间，然后是可选扩展。 */
export interface InstalledPluginRecord {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  installPath: string;
  installedAt: string;
  scope: "user" | "workspace";
  updatedAt?: string;
  dependencies?: string[];
  source?: unknown;
  cacheTransactionId?: string;
}

/** 一次安装的结果：安装闭包 + 实际写入的记录。 */
export interface MarketplaceInstallResult {
  closure: string[];
  installed: InstalledPluginRecord[];
}

// ── 校验与展示 ──────────────────────────────────────────────────────
/** 一条校验诊断：错误码与文案在前，严重度随后，然后是定位信息。 */
export interface PluginValidationDiagnostic {
  code: PluginDiagnostic["code"];
  message: string;
  severity: PluginDiagnostic["severity"];
  path?: string;
  pluginId?: string;
}

/** 清单的展示元数据（都可缺席）。 */
export interface PluginManifestDisplayMetadata {
  author?: string;
  authorUrl?: string;
  homepage?: string;
  version?: string;
}

/** 描述一个 marketplace 插件的结果：组件、诊断与可选元数据。 */
export interface DescribeMarketplacePluginResult {
  components: PluginComponentGroup[];
  diagnostics: PluginValidationDiagnostic[];
  metadata?: PluginManifestDisplayMetadata;
}
