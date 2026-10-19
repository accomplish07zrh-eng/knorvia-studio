// SPDX-License-Identifier: Apache-2.0
/**
 * 插件商店排序偏好结构解析。
 * 支持按工作模式（code / work）独立配置分类顺序与分类内插件顺序，单模式异常独立回退。
 */

import { z } from "zod";

/** 清洗并去重保序的字符串序列模式 */
const createDeduplicatedSequenceSchema = () =>
  z.array(z.string().trim().min(1)).transform((elements) => Array.from(new Set(elements)));

const buildModeOrderSchema = () => {
  const sequenceSchema = createDeduplicatedSequenceSchema();
  return z.object({
    categoryOrder: sequenceSchema.optional(),
    pluginOrder: z.record(z.string(), sequenceSchema).optional(),
  });
};

const internalModeOrderSchema = buildModeOrderSchema();

const rootStoreOrderSchema = z.object({
  code: internalModeOrderSchema.optional().catch(undefined),
  work: internalModeOrderSchema.optional().catch(undefined),
});

export type PluginStoreModeOrder = z.infer<typeof internalModeOrderSchema>;
export type PluginStoreOrder = z.infer<typeof rootStoreOrderSchema>;

/**
 * 解析用户端或服务端返回的插件商店排序结构。
 * 若顶层数据格式非法返回 null；单模式解析异常自动安全回退为 undefined。
 */
export function parsePluginStoreOrder(value: unknown): PluginStoreOrder | null {
  const parseResult = rootStoreOrderSchema.safeParse(value);
  if (!parseResult.success) {
    return null;
  }
  return parseResult.data;
}
