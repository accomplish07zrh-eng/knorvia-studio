// SPDX-License-Identifier: Apache-2.0
// WebFetch 预授权判定：整站预授权的域名直接放行；只开放部分路径的域名要落在前缀内。
// 主机表本身在 webfetch-preapproved-data.ts；这里只保留判定逻辑。
//
// 路径前缀匹配前先拒绝编码过的斜杠/反斜杠/点，避免用 %2f、%5c、%2e 绕过前缀判断。
import { PREAPPROVED_HOSTS, PREAPPROVED_PREFIX_ROWS } from "./webfetch-preapproved-data.js";

/** 整站放行主机的查找集（由数据表的逐行清单构建）。 */
const WHOLE_HOST_LOOKUP: ReadonlySet<string> = new Set(PREAPPROVED_HOSTS);

/** 前缀放行主机的查找表：主机名 → 允许的路径前缀。 */
const PREFIXED_HOST_LOOKUP: ReadonlyMap<string, readonly string[]> = new Map(
  PREAPPROVED_PREFIX_ROWS.map((row) => [row.host, row.prefixes] as const),
);

/** 编码过的斜杠、反斜杠与点（允许再编码一层 %25）。 */
const ENCODED_PATH_ESCAPE = /%(25)*(2f|5c|2e)/iu;

/**
 * 前缀边界判定：等于前缀，或以「前缀 + /」开头。
 * 前缀后必须紧跟分隔符，避免把 `/docsx` 误判成落在 `/docs` 内。
 */
function prefixCoversPath(pathname: string, prefix: string): boolean {
  if (pathname.length < prefix.length) return false;
  if (!pathname.startsWith(prefix)) return false;
  return pathname.length === prefix.length || pathname[prefix.length] === "/";
}

export const isWebFetchPreapprovedUrl = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const parsedUrl = URL.parse(value);
  if (parsedUrl === null) return false;

  if (WHOLE_HOST_LOOKUP.has(parsedUrl.hostname)) return true;

  const pathPrefixes = PREFIXED_HOST_LOOKUP.get(parsedUrl.hostname);
  if (pathPrefixes === undefined) return false;
  // 先挡住编码穿越，再逐前缀比对。
  if (ENCODED_PATH_ESCAPE.test(parsedUrl.pathname)) return false;
  return pathPrefixes.some((prefix) => prefixCoversPath(parsedUrl.pathname, prefix));
};
