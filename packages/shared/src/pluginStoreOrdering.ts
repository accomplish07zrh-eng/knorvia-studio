import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "./plugin-marketplaces.js";

import type { PluginStoreModeOrder } from "./pluginStoreOrder.js";

export const FALLBACK_PLUGIN_STORE_CATEGORY = "other";

export const PLUGIN_STORE_CATEGORY_ORDER: readonly string[] = [
  "productivity",
  "developer-tools",
  "utilities",
  "finance",
  "legal",
  "template",
];

function createRanks(values: readonly string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const value of values) {
    if (!ranks.has(value)) {
      ranks.set(value, ranks.size);
    }
  }
  return ranks;
}

const documentPluginRanks = createRanks(
  ["pdf", "presentations", "spreadsheets", "documents"].map(
    (name) => `${name}@${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID}`,
  ),
);

function compareRanks(ranks: ReadonlyMap<string, number>, left: string, right: string): number {
  return (ranks.get(left) ?? ranks.size) - (ranks.get(right) ?? ranks.size);
}

export function compareDocumentPluginPriority(leftId: string, rightId: string): number {
  return compareRanks(documentPluginRanks, leftId, rightId);
}

export function resolvePluginStoreCategory(category: string | undefined): string | undefined {
  const normalized = category?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized === "guides" ? "utilities" : normalized;
}

interface PluginStoreSortEntry {
  id: string;
  category?: string;
  displayName: string;
}

function compareDefaultCategories(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === FALLBACK_PLUGIN_STORE_CATEGORY) {
    return 1;
  }
  if (right === FALLBACK_PLUGIN_STORE_CATEGORY) {
    return -1;
  }
  const leftRank = PLUGIN_STORE_CATEGORY_ORDER.indexOf(left);
  const rightRank = PLUGIN_STORE_CATEGORY_ORDER.indexOf(right);
  if (leftRank !== -1 && rightRank !== -1) {
    return leftRank - rightRank;
  }
  if (leftRank !== -1) {
    return -1;
  }
  if (rightRank !== -1) {
    return 1;
  }
  return left < right ? -1 : 1;
}

export function sortPluginStoreEntries<T>(
  items: readonly T[],
  project: (item: T) => PluginStoreSortEntry,
  locale: string,
  order?: PluginStoreModeOrder,
): T[] {
  const categoryRanks = createRanks(order?.categoryOrder ?? []);
  const pluginRanks = new Map<string, Map<string, number>>();
  for (const [category, ids] of Object.entries(order?.pluginOrder ?? {})) {
    pluginRanks.set(category, createRanks(ids));
  }

  const entries = items.map((item, index) => {
    const projected = project(item);
    return {
      item,
      index,
      ...projected,
      category: resolvePluginStoreCategory(projected.category) ?? FALLBACK_PLUGIN_STORE_CATEGORY,
    };
  });

  entries.sort((left, right) => {
    const categoryOrder = compareRanks(categoryRanks, left.category, right.category);
    if (categoryOrder !== 0) {
      return categoryOrder;
    }

    const defaultOrder = compareDefaultCategories(left.category, right.category);
    if (defaultOrder !== 0) {
      return defaultOrder;
    }

    const ranks = pluginRanks.get(left.category);
    const pluginOrder = ranks ? compareRanks(ranks, left.id, right.id) : 0;
    if (pluginOrder !== 0) {
      return pluginOrder;
    }

    const documentOrder = compareDocumentPluginPriority(left.id, right.id);
    if (documentOrder !== 0) {
      return documentOrder;
    }

    const nameOrder = left.displayName.localeCompare(right.displayName, locale);
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.index - right.index;
  });

  return entries.map((entry) => entry.item);
}
