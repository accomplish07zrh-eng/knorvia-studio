// SPDX-License-Identifier: Apache-2.0
/**
 * 插件商店条目多维度组合排序引擎。
 * 实现分类优先级、自定义置顶、文档插件特定权重、本地化字符序与稳定保序比较。
 */

import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "../plugin-marketplaces.js";
import type { PluginStoreModeOrder } from "../pluginStoreOrder.js";

/** 默认未分类或无法识别分类的归底标识 */
export const FALLBACK_PLUGIN_STORE_CATEGORY = "other";

const DEFAULT_CATEGORY_SEQUENCE_CSV =
  "productivity,developer-tools,utilities,finance,legal,template";

/** 官方默认推荐的分类呈现顺序 */
export const PLUGIN_STORE_CATEGORY_ORDER: readonly string[] =
  DEFAULT_CATEGORY_SEQUENCE_CSV.split(",");

function buildLookupRankMap(sequence: readonly string[]): Map<string, number> {
  const indexMap = new Map<string, number>();
  for (const key of sequence) {
    if (!indexMap.has(key)) {
      indexMap.set(key, indexMap.size);
    }
  }
  return indexMap;
}

const DOCUMENT_PLUGIN_SLUGS_CSV = "pdf,presentations,spreadsheets,documents";
const DOCUMENT_PLUGIN_RANK_TABLE = buildLookupRankMap(
  DOCUMENT_PLUGIN_SLUGS_CSV.split(",").map(
    (name) => `${name}@${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID}`,
  ),
);

/** 对比两个插件在官方文档处理插件中的显示优先级（0 为最优先） */
export function compareDocumentPluginPriority(leftId: string, rightId: string): number {
  const maxRank = DOCUMENT_PLUGIN_RANK_TABLE.size;
  const rankLeft = DOCUMENT_PLUGIN_RANK_TABLE.get(leftId) ?? maxRank;
  const rankRight = DOCUMENT_PLUGIN_RANK_TABLE.get(rightId) ?? maxRank;
  return rankLeft - rankRight;
}

/** 规范化分类名称：去除前后空白，将旧别名 guides 映射为 utilities */
export function resolvePluginStoreCategory(category: string | undefined): string | undefined {
  if (!category) {
    return undefined;
  }
  const trimmed = category.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed === "guides" ? "utilities" : trimmed;
}

interface PluginStoreSortEntry {
  id: string;
  category?: string;
  displayName: string;
}

function compareBuiltinCategoryOrder(catA: string, catB: string): number {
  if (catA === catB) {
    return 0;
  }
  if (catA === FALLBACK_PLUGIN_STORE_CATEGORY) {
    return 1;
  }
  if (catB === FALLBACK_PLUGIN_STORE_CATEGORY) {
    return -1;
  }

  const posA = PLUGIN_STORE_CATEGORY_ORDER.indexOf(catA);
  const posB = PLUGIN_STORE_CATEGORY_ORDER.indexOf(catB);
  if (posA !== -1 && posB !== -1) {
    return posA - posB;
  }
  if (posA !== -1) {
    return -1;
  }
  if (posB !== -1) {
    return 1;
  }
  return catA.localeCompare(catB);
}

/**
 * 对插件商店展示条目执行多层优先级级联排序。
 */
export function sortPluginStoreEntries<T>(
  items: readonly T[],
  project: (item: T) => PluginStoreSortEntry,
  locale: string,
  order?: PluginStoreModeOrder,
): T[] {
  const customCategoryRanks = buildLookupRankMap(order?.categoryOrder ?? []);
  const customItemRanksByCategory = new Map<string, Map<string, number>>();

  for (const [catName, pluginIdList] of Object.entries(order?.pluginOrder ?? {})) {
    customItemRanksByCategory.set(catName, buildLookupRankMap(pluginIdList));
  }

  const enrichedItems = items.map((rawItem, originalPos) => {
    const meta = project(rawItem);
    const resolvedCategory =
      resolvePluginStoreCategory(meta.category) ?? FALLBACK_PLUGIN_STORE_CATEGORY;
    return {
      rawItem,
      originalPos,
      id: meta.id,
      category: resolvedCategory,
      displayName: meta.displayName,
    };
  });

  enrichedItems.sort((entryA, entryB) => {
    if (customCategoryRanks.size > 0) {
      const defaultHighRank = customCategoryRanks.size;
      const rankA = customCategoryRanks.get(entryA.category) ?? defaultHighRank;
      const rankB = customCategoryRanks.get(entryB.category) ?? defaultHighRank;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
    }

    const categoryDelta = compareBuiltinCategoryOrder(entryA.category, entryB.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    const categorySpecificItemMap = customItemRanksByCategory.get(entryA.category);
    if (categorySpecificItemMap) {
      const defaultItemRank = categorySpecificItemMap.size;
      const itemRankA = categorySpecificItemMap.get(entryA.id) ?? defaultItemRank;
      const itemRankB = categorySpecificItemMap.get(entryB.id) ?? defaultItemRank;
      if (itemRankA !== itemRankB) {
        return itemRankA - itemRankB;
      }
    }

    const docPriorityDelta = compareDocumentPluginPriority(entryA.id, entryB.id);
    if (docPriorityDelta !== 0) {
      return docPriorityDelta;
    }

    const nameDelta = entryA.displayName.localeCompare(entryB.displayName, locale);
    if (nameDelta !== 0) {
      return nameDelta;
    }

    return entryA.originalPos - entryB.originalPos;
  });

  return enrichedItems.map((wrapped) => wrapped.rawItem);
}
