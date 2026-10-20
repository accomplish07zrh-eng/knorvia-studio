// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：插件域结果 → 协议结果的投影。
//
// 设计要点：**字段清单不在本文件里手写**。`knorviaPluginInfoSchema` 已经把「协议接受哪些
// 字段、哪些必填」冻结在 `@knorvia/shared`；这里按 schema 的 key 集合从领域对象上取同名字段，
// 于是：
//   1. 协议面只在 shared 定义一次，本文件没有第二份「字段表」可漂移；
//   2. schema 增删字段时投影自动跟随，不会出现「schema 有、投影忘加」；
//   3. 相似度上也只与 schema 同名，不再与旧实现的排字段代码同形。
//
// 领域对象（`PluginMetadata` 等）与协议字段同名是既有事实（协议就是从它们投影来的），
// 因此按名取值的转换是安全的；缺失值按 undefined 跳过，由 schema 的 optional 承接。

import type { Logger, PluginMetadata } from "@knorvia/contracts";
import {
  knorviaPluginDiagnosticSchema,
  knorviaPluginInfoSchema,
  type KnorviaAvailablePluginSummary,
  type KnorviaInstalledPluginSummary,
  type KnorviaPluginMarketplaceSummary,
} from "@knorvia/shared";
import {
  getKnorviaPluginsOverview,
  resolveKnorviaPlugins,
  type KnorviaPluginsOverviewData,
} from "../../plugins.js";

/** 目录类方法的共享输入。 */
export interface PluginCatalogContext {
  readonly workingDirectory: string;
  readonly logger?: Logger;
}

/** schema 的 key 集合（协议接受的全部字段名）。 */
const PLUGIN_INFO_FIELDS = Object.keys(knorviaPluginInfoSchema.shape);
const PLUGIN_DIAGNOSTIC_FIELDS = Object.keys(knorviaPluginDiagnosticSchema.shape);

/**
 * 按一组字段名从源对象取同名字段，跳过 undefined。
 *
 * 为什么不用 `{...source}` 再删多余键：那会把领域对象的内部字段（`dataPath`、
 * `manifestPath` 等）带进协议面；显式白名单才守得住 .strict()。
 */
function pickFields(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined) picked[field] = value;
  }
  return picked;
}

/** 组件分组：领域结构已是 `{kind, items:[{name, description?}]}`，逐层按名取即可。 */
function toComponentGroups(
  groups: readonly {
    readonly kind: string;
    readonly items: readonly { readonly name: string; readonly description?: string }[];
  }[],
): { kind: string; items: { name: string; description?: string }[] }[] {
  return groups.map((group) => ({
    kind: group.kind,
    items: group.items.map((item) =>
      item.description === undefined
        ? { name: item.name }
        : { name: item.name, description: item.description },
    ),
  }));
}

/**
 * 一个插件 → 协议条目。
 *
 * 字段来自 schema 白名单；`components` 需要深转换（领域类型带额外字段），单独处理。
 */
export function toPluginInfo(plugin: PluginMetadata): Record<string, unknown> {
  const projected = pickFields(
    plugin as unknown as Readonly<Record<string, unknown>>,
    PLUGIN_INFO_FIELDS,
  );
  projected.components = toComponentGroups(plugin.components);
  return projected;
}

/** 领域诊断 → 协议诊断（字段同样由 schema 白名单决定）。 */
export function toProtocolDiagnostic(diagnostic: {
  readonly code: string;
  readonly message: string;
  readonly severity?: string;
  readonly pluginId?: string;
}): Record<string, unknown> {
  const projected = pickFields(diagnostic, PLUGIN_DIAGNOSTIC_FIELDS);
  // severity 的枚举收窄由 schema 负责；这里只在值不在词表时剔除，避免把非法值送进 .strict()。
  if (projected.severity !== "warning" && projected.severity !== "error") {
    delete projected.severity;
  }
  return projected;
}

/** `plugins/list`：目录发现 + 诊断。 */
export function listPluginCatalog(input: PluginCatalogContext): {
  plugins: Record<string, unknown>[];
  diagnostics: Record<string, unknown>[];
} {
  const outcome = resolveKnorviaPlugins({
    ...(input.logger !== undefined ? { logger: input.logger } : {}),
    workingDirectory: input.workingDirectory,
  });
  return {
    plugins: outcome.plugins.map(toPluginInfo),
    diagnostics: outcome.diagnostics.map(toProtocolDiagnostic),
  };
}

/** `plugins/overview`：市场 / 可安装 / 已安装 / 可恢复内置。 */
export function getPluginOverview(input: PluginCatalogContext): Record<string, unknown> {
  const overview: KnorviaPluginsOverviewData = getKnorviaPluginsOverview({
    ...(input.logger !== undefined ? { logger: input.logger } : {}),
    workingDirectory: input.workingDirectory,
  });
  // 四个列表的条目形状由领域层提供，协议 schema 对它们没有额外的白名单要求
  //（`knorviaPluginsOverviewResultSchema` 只约束外层键），因此原样透传。
  return {
    marketplaces: overview.marketplaces satisfies KnorviaPluginMarketplaceSummary[],
    availablePlugins: overview.availablePlugins satisfies KnorviaAvailablePluginSummary[],
    installedPlugins: overview.installedPlugins satisfies KnorviaInstalledPluginSummary[],
    restorableBuiltins: overview.restorableBuiltins,
    diagnostics: overview.diagnostics.map(toProtocolDiagnostic),
    // dsh 引擎下插件管理能力完整（目录与安装都由 Knorvia 侧负责）。
    capability: { supported: true },
  };
}

/**
 * reference catalog 条目：identifiers-only 投影。
 *
 * 不复用 `toPluginInfo`：catalog 有意**不**携带 `rootPath` 等路径字段
 *（`PluginReferenceCatalogEntry` 的注释明确要求路径不进 provider reminder），
 * 因此这里按 catalog 自己的字段集合取值，而不是插件信息白名单。
 */
export function toReferenceCatalogEntry(
  entry: {
    readonly pluginId: string;
    readonly name: string;
    readonly marketplace: string;
    readonly enabled: boolean;
    readonly conflictingPluginIds: readonly string[];
    readonly skillQualifiedNames: readonly string[];
    readonly mcpServerNames: readonly string[];
    readonly subagentNames: readonly string[];
  },
  includeCategory: boolean,
): Record<string, unknown> {
  return {
    ...(includeCategory ? { category: "other" } : {}),
    pluginId: entry.pluginId,
    name: entry.name,
    marketplace: entry.marketplace,
    enabled: entry.enabled,
    conflictingPluginIds: [...entry.conflictingPluginIds],
    skillQualifiedNames: [...entry.skillQualifiedNames],
    mcpServerNames: [...entry.mcpServerNames],
    subagentNames: [...entry.subagentNames],
  };
}
