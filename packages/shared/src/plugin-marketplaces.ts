// SPDX-License-Identifier: Apache-2.0

/**
 * 一个可发现的插件市场（远端配置时由调用方填充）。
 * 字段由字段袋登记，接口再从字段袋投影，保证形状只有一处定义。
 */
type MarketplaceIdentityFields = { id: string; source: string; name: string };

type MarketplaceListingFields = { description: string; pluginCount: number; lastUpdated?: string };

export interface DefaultPluginMarketplace
  extends MarketplaceIdentityFields, MarketplaceListingFields {}

/** 官方内置市场的唯一 id；内置与 CDN 不再拆成两个身份。 */
const OFFICIAL_MARKETPLACE_ID = "knorvia-plugins-bundled";

export const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID = OFFICIAL_MARKETPLACE_ID;

type MarketplaceIdIndex = Readonly<Record<string, true>>;

/**
 * 默认启用的官方插件登记表：插件短名 → true。
 *
 * 对象登记让「名字是否默认启用」的判定与清单同源；完整 plugin id 由短名
 * 加官方市场后缀统一拼出，避免市场名在十条记录里重复十遍。
 *
 * 说明：node_repl 宿主不面向用户、不贡献 skill/command/subagent，但必须始终可用，
 * 因为它的注册门禁是「Browser Use 或 Computer Use 任一启用」；
 * computer-use 已回退为默认关闭，故不在这里。
 */
const DEFAULT_ENABLED_SLUG_INDEX: MarketplaceIdIndex = {
  "browser-use": true,
  "image-search": true,
  documents: true,
  pdf: true,
  presentations: true,
  spreadsheets: true,
  "node-repl-host": true,
  "skill-creator": true,
  "plugin-creator": true,
  "knorvia-guide": true,
};

const DEFAULT_ENABLED_FULL_IDS = Object.keys(DEFAULT_ENABLED_SLUG_INDEX).map(
  (slug) => `${slug}@${OFFICIAL_MARKETPLACE_ID}`,
);

/** 需要与 official-plugin-definitions.ts 中 defaultEnabled 的插件逐一对应。 */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  DEFAULT_ENABLED_FULL_IDS,
);

/** 内置插件仍然可用；远端市场需要用户显式接入，故默认列表为空。 */
export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [];

/** 商店「公开」分段只列官方市场。 */
export const PUBLIC_STORE_MARKETPLACE_IDS: readonly string[] = [OFFICIAL_MARKETPLACE_ID];

const PUBLIC_STORE_LOOKUP: ReadonlySet<string> = new Set(PUBLIC_STORE_MARKETPLACE_IDS);

export function isPublicStoreMarketplaceId(id: string): boolean {
  return PUBLIC_STORE_LOOKUP.has(id);
}
