// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { parsePluginStoreOrder, type PluginStoreOrder } from "../pluginStoreOrder.js";

/** 只允许显式接入的公开字段进入服务快照，不透传账户或 Provider 配置。 */
export interface ClientConfigSnapshot {
  pluginStoreOrder: PluginStoreOrder | null;
}

export const clientConfigReadOptionsSchema = z.object({
  forceRefresh: z.boolean().optional(),
});
export type ClientConfigReadOptions = z.infer<typeof clientConfigReadOptionsSchema>;

const publicClientConfigEnvelopeSchema = z.object({
  code: z.literal(0),
  data: z
    .object({
      configs: z.object({ pluginStoreOrder: z.unknown().optional() }).nullish(),
    })
    .nullish(),
});

export function parseClientConfigSnapshot(payload: unknown): ClientConfigSnapshot {
  const result = publicClientConfigEnvelopeSchema.safeParse(payload);
  if (!result.success) {
    throw new Error("Invalid public client config response");
  }
  const rawOrder = result.data.data?.configs?.pluginStoreOrder;
  return {
    pluginStoreOrder: parsePluginStoreOrder(rawOrder),
  };
}
