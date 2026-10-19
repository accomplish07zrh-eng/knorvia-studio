// SPDX-License-Identifier: Apache-2.0
/**
 * 插件市场源定义与官方内置市场配置。
 * 维护默认启用的官方插件集合、公开市场分类识别与市场元数据接口。
 */

interface MarketplaceBaseMetadata {
  id: string;
  source: string;
  name: string;
}

interface MarketplaceContentMetrics {
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

export interface DefaultPluginMarketplace
  extends MarketplaceBaseMetadata, MarketplaceContentMetrics {}

/** 官方捆绑插件市场唯一标识 */
export const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID = "knorvia-plugins-bundled";

const DEFAULT_PLUGIN_SLUGS_CSV =
  "browser-use,image-search,documents,pdf,presentations,spreadsheets,node-repl-host,skill-creator,plugin-creator,knorvia-guide";

/** 首次安装或配置初始化时默认启用的官方插件 ID 集合（10 项官方核心插件） */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  DEFAULT_PLUGIN_SLUGS_CSV.split(",").map(
    (slug) => `${slug}@${KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID}`,
  ),
);

/** 默认注册的远程插件市场清单（内置插件常驻，远程市场需用户显式配置） */
export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [];

/** 商店公开分段支持的市场标识元组 */
export const PUBLIC_STORE_MARKETPLACE_IDS = [KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID] as const;

/** 检查指定市场标识是否属于公开商店支持的官方市场 */
export function isPublicStoreMarketplaceId(id: string): boolean {
  return (PUBLIC_STORE_MARKETPLACE_IDS as readonly string[]).includes(id);
}
