// SPDX-License-Identifier: Apache-2.0

/*
 * 商店排序用到的纯数据表：兜底分类、默认分类序、旧分类迁移表与文档类插件顺序。
 * 排序算法本身（名次表构造、六级比较）在 pluginStoreOrdering.ts。
 */

/** 分类缺失或空串时归到这里，并固定排在已知分类之后。 */
export const FALLBACK_PLUGIN_STORE_CATEGORY = "other";

/** 本地默认分类顺序。 */
export const PLUGIN_STORE_CATEGORY_ORDER: readonly string[] = [
  "productivity",
  "developer-tools",
  "utilities",
  "finance",
  "legal",
  "template",
];

/** 旧分类名到现行分类名的迁移表。 */
export const LEGACY_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  guides: "utilities",
};

/** 官方文档类插件的短名，顺序即展示优先级：先表格类、后文字类。 */
export const DOCUMENT_PLUGIN_SLUGS = ["pdf", "presentations", "spreadsheets", "documents"];
