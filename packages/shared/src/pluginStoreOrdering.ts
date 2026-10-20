// SPDX-License-Identifier: Apache-2.0
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "./plugin-marketplaces.js";
import {
  DOCUMENT_PLUGIN_SLUGS,
  FALLBACK_PLUGIN_STORE_CATEGORY,
  LEGACY_CATEGORY_ALIASES,
  PLUGIN_STORE_CATEGORY_ORDER,
} from "./pluginStoreOrdering-data.js";

import type { PluginStoreModeOrder } from "./pluginStoreOrder.js";

/*
 * 商店列表的排序规则，从强到弱依次是：
 *   服务端下发的分类顺序 → 本地默认分类顺序 → 服务端下发的插件顺序
 *   → 文档类插件优先级 → 展示名（按 locale 比较）→ 原始下标
 * 最后一级保证排序稳定，同样的输入永远得到同样的输出。
 * 纯数据表见 ./pluginStoreOrdering-data.js。
 */

export { FALLBACK_PLUGIN_STORE_CATEGORY, PLUGIN_STORE_CATEGORY_ORDER };

/** 把有序数组压成「值 → 名次」表；重复值保留首次出现的位置。 */
function toRankTable(values: readonly string[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const value of values) {
    if (!table.has(value)) table.set(value, table.size);
  }
  return table;
}

/** 查不到名次的值统一排在所有已知值之后。 */
function rankOf(table: ReadonlyMap<string, number>, value: string): number {
  return table.get(value) ?? table.size;
}

const DOCUMENT_PLUGIN_RANKS = toRankTable(
  DOCUMENT_PLUGIN_SLUGS.map((slug) => `${slug}@${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID}`),
);

/** 文档类插件的固定展示顺序。 */
export const compareDocumentPluginPriority = (leftId: string, rightId: string): number =>
  rankOf(DOCUMENT_PLUGIN_RANKS, leftId) - rankOf(DOCUMENT_PLUGIN_RANKS, rightId);

/** 分类名归一：去空白、空串视为未知、旧名映射到新名。 */
export const resolvePluginStoreCategory = (category: string | undefined): string | undefined => {
  const normalized = category?.trim();
  if (!normalized) return undefined;
  return LEGACY_CATEGORY_ALIASES[normalized] ?? normalized;
};

/** 排序需要的最小投影：id 用于插件级名次，分类用于分组，展示名用于兜底比较。 */
type PluginStoreSortEntry = {
  id: string;
  category?: string;
  displayName: string;
};

type RankedEntry<T> = {
  item: T;
  slot: number;
} & PluginStoreSortEntry & { category: string };

/**
 * 默认分类顺序：已知分类按表排，未知分类按名字排，兜底分类永远最后。
 * 名次表由调用方每次排序时现算并传进来：导出的分类序数组是可变的，
 * 调用方改过之后排序结果必须跟着变（契约测试即按此断言）。
 */
function compareCategoryByDefault(
  left: string,
  right: string,
  defaultRanks: ReadonlyMap<string, number>,
): number {
  if (left === right) return 0;
  if (left === FALLBACK_PLUGIN_STORE_CATEGORY) return 1;
  if (right === FALLBACK_PLUGIN_STORE_CATEGORY) return -1;

  const leftRank = defaultRanks.get(left);
  const rightRank = defaultRanks.get(right);
  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  if (leftRank !== undefined) return -1;
  if (rightRank !== undefined) return 1;
  return left < right ? -1 : 1;
}

/** 按 `order` 建立「分类 → 插件名次表」；没下发的分类不建表（即不参与插件级排序）。 */
function buildPluginRankTables(
  order: PluginStoreModeOrder | undefined,
): Map<string, Map<string, number>> {
  const tables = new Map<string, Map<string, number>>();
  for (const [category, ids] of Object.entries(order?.pluginOrder ?? {})) {
    tables.set(category, toRankTable(ids));
  }
  return tables;
}

/** 分类归一后再投影成可排序条目；原始下标留作最后一级兜底。 */
function rankEntries<T>(
  items: readonly T[],
  project: (item: T) => PluginStoreSortEntry,
): RankedEntry<T>[] {
  return items.map((item, slot) => {
    const projected = project(item);
    const category =
      resolvePluginStoreCategory(projected.category) ?? FALLBACK_PLUGIN_STORE_CATEGORY;
    return { item, slot, id: projected.id, displayName: projected.displayName, category };
  });
}

/** 六级比较：任意一级分出胜负即返回，全部相等才落到原始下标。 */
function compareRanked<T>(
  left: RankedEntry<T>,
  right: RankedEntry<T>,
  locale: string,
  categoryRanks: ReadonlyMap<string, number>,
  defaultCategoryRanks: ReadonlyMap<string, number>,
  pluginRanksByCategory: ReadonlyMap<string, ReadonlyMap<string, number>>,
): number {
  const byServerCategory =
    rankOf(categoryRanks, left.category) - rankOf(categoryRanks, right.category);
  if (byServerCategory !== 0) return byServerCategory;

  const byDefaultCategory = compareCategoryByDefault(
    left.category,
    right.category,
    defaultCategoryRanks,
  );
  if (byDefaultCategory !== 0) return byDefaultCategory;

  const pluginRanks = pluginRanksByCategory.get(left.category);
  if (pluginRanks !== undefined) {
    const byServerPlugin = rankOf(pluginRanks, left.id) - rankOf(pluginRanks, right.id);
    if (byServerPlugin !== 0) return byServerPlugin;
  }

  const byDocument = compareDocumentPluginPriority(left.id, right.id);
  if (byDocument !== 0) return byDocument;

  const byName = left.displayName.localeCompare(right.displayName, locale);
  if (byName !== 0) return byName;

  return left.slot - right.slot;
}

export function sortPluginStoreEntries<T>(
  items: readonly T[],
  project: (item: T) => PluginStoreSortEntry,
  locale: string,
  order?: PluginStoreModeOrder,
): T[] {
  const categoryRanks = toRankTable(order?.categoryOrder ?? []);
  const defaultCategoryRanks = toRankTable(PLUGIN_STORE_CATEGORY_ORDER);
  const pluginRanksByCategory = buildPluginRankTables(order);
  const ranked = rankEntries(items, project);
  ranked.sort((left, right) =>
    compareRanked(left, right, locale, categoryRanks, defaultCategoryRanks, pluginRanksByCategory),
  );
  return ranked.map((entry) => entry.item);
}
