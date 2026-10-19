// SPDX-License-Identifier: Apache-2.0
import { parse as parseLegacyUrl } from "node:url";

/**
 * 归因头登记表：键名 + 取值。元组顺序即最终写出的顺序；
 * 键名与取值都只在这里出现一次，导出对象由它投影。
 */
const ATTRIBUTION_PAIRS = [
  ["X-OpenRouter-Title", "Knorvia Studio"],
  ["X-OpenRouter-Categories", "programming-app"],
] as const;

type AttributionHeaderName = (typeof ATTRIBUTION_PAIRS)[number][0];
type AttributionHeaderValue = (typeof ATTRIBUTION_PAIRS)[number][1];
type AttributionHeaders = Readonly<Record<AttributionHeaderName, AttributionHeaderValue>>;

const APEX_HOSTNAME = "openrouter.ai";
const REQUIRED_PROTOCOL = "https:";
const SUBDOMAIN_SUFFIX = `.${APEX_HOSTNAME}`;

const ATTRIBUTION_HEADERS = Object.fromEntries(ATTRIBUTION_PAIRS) as AttributionHeaders;

/** OpenRouter 官方归因头；读写同一份只读对象。 */
export const OPENROUTER_ATTRIBUTION_HEADERS: AttributionHeaders = ATTRIBUTION_HEADERS;

export function isOpenRouterBaseUrl(baseUrl: string | undefined): boolean {
  const raw = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (raw === "") return false;

  const endpoint = parseLegacyUrl(raw);
  if (endpoint.protocol !== REQUIRED_PROTOCOL) return false;

  const host = (endpoint.hostname ?? "").toLowerCase();
  if (host === APEX_HOSTNAME) return true;
  return host.endsWith(SUBDOMAIN_SUFFIX);
}

/**
 * 给发往 OpenRouter 的请求补上归因头。
 *
 * 非 OpenRouter 端点原样返回传入对象；OpenRouter 端点返回新对象，
 * 归因头放在最后，已有同名头以官方值为准（后者覆盖前者）。
 */
export function withOpenRouterAttributionHeaders(
  headers: Record<string, string>,
  baseUrl: string | undefined,
): Record<string, string> {
  if (!isOpenRouterBaseUrl(baseUrl)) return headers;
  return { ...headers, ...ATTRIBUTION_HEADERS };
}
