// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { parsePluginStoreOrder, type PluginStoreOrder } from "./pluginStoreOrder.js";

const INVALID_PUBLIC_CONFIG = "Invalid public client config response";

/** 只允许显式接入的公开字段进入服务快照，不透传账户或 Provider 配置。 */
export type ClientConfigSnapshot = {
  pluginStoreOrder: PluginStoreOrder | null;
};

const readOptionsShape = { forceRefresh: z.boolean().optional() };

export const clientConfigReadOptionsSchema = z.object(readOptionsShape);
export type ClientConfigReadOptions = z.output<typeof clientConfigReadOptionsSchema>;

/** 判断 JSON 值是否是可直接读取字段的普通对象（数组与 null 都不算）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 公开配置响应是窄信封：`code` 必须恰为 0，`data`/`configs` 允许缺省或 null，
 * 其余键一律忽略。手工读取避免把「缺省」与「类型错误」混为一谈。
 */
function readConfigs(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload) || payload.code !== 0) return undefined;
  if (payload.data === undefined || payload.data === null) return {};
  if (!isRecord(payload.data)) return undefined;
  const configs = payload.data.configs;
  if (configs === undefined || configs === null) return {};
  return isRecord(configs) ? configs : undefined;
}

export function parseClientConfigSnapshot(payload: unknown): ClientConfigSnapshot {
  const configs = readConfigs(payload);
  if (configs === undefined) {
    throw new Error(INVALID_PUBLIC_CONFIG);
  }
  return { pluginStoreOrder: parsePluginStoreOrder(configs.pluginStoreOrder) };
}
