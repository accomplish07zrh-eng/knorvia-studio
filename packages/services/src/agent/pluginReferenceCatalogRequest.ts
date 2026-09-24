import {
  knorviaProtocolMethods,
  knorviaPluginsReferenceCatalogResultSchema,
  type KnorviaPluginsReferenceCatalogParams,
} from "@knorvia/shared";
import type { KnorviaProtocolClient } from "#src/agent/protocolClient.js";

/** 旧协议严格校验响应；新展示字段走独立入口，只有 -32601 能证明旧 Agent 不支持。 */
export async function requestPluginReferenceCatalog(
  client: Pick<KnorviaProtocolClient, "request">,
  params: KnorviaPluginsReferenceCatalogParams,
) {
  try {
    return await client.request(
      knorviaProtocolMethods.pluginsReferenceCatalogWithCategory,
      params,
      knorviaPluginsReferenceCatalogResultSchema,
    );
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === -32601))
      throw error;
    return client.request(
      knorviaProtocolMethods.pluginsReferenceCatalog,
      params,
      knorviaPluginsReferenceCatalogResultSchema,
    );
  }
}
