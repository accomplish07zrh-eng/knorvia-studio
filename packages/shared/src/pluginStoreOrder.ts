// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/*
 * 插件商店排序配置。排序只影响展示：某一种模式的数据坏掉时只回退该模式，
 * 既不阻塞目录浏览，也不污染另一种模式。
 */

/** 去重但保留首次出现的位置（顺序即用户配置的优先级）。 */
function keepFirstOccurrence(ids: readonly string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

/** 有序 id 列表：逐项 trim + 非空，再去重。 */
const orderedIds = z.array(z.string().trim().min(1)).transform(keepFirstOccurrence);

const modeOrder = z.object({
  categoryOrder: orderedIds.optional(),
  pluginOrder: z.record(z.string(), orderedIds).optional(),
});

/** 单个模式整体容错：解析失败当作未配置，而不是让整个根失败。 */
const tolerantModeOrder = modeOrder.optional().catch(undefined);

const storeOrder = z.object({
  code: tolerantModeOrder,
  work: tolerantModeOrder,
});

export type PluginStoreModeOrder = z.infer<typeof modeOrder>;
export type PluginStoreOrder = z.infer<typeof storeOrder>;

/** 非法根返回 null（视为未配置）；模式级错误只丢掉该模式。 */
export function parsePluginStoreOrder(value: unknown): PluginStoreOrder | null {
  const result = storeOrder.safeParse(value);
  return result.success ? result.data : null;
}
