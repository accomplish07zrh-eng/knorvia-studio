// SPDX-License-Identifier: Apache-2.0
// Provider 端点身份：把任意 base URL 折成「origin + 已清洗路由」两段，供低基数标签使用。
//
// 路由里的身份线索（邮箱、UUID、长数字、长十六进制、token 形态）逐段替换；
// 其余段按长度截断，整条路由也有上限。缓存按 LRU 逐出，命中会刷新顺序。
import type { ProviderEndpointIdentity } from "@knorvia/contracts/telemetry";

/** 端点身份的语义版本；字段形状变化时随之递增。 */
export const PROVIDER_ENDPOINT_SANITIZER_VERSION = "1";

/** 三道长度闸门。 */
const MAX_INPUT = 4_096;
const MAX_ROUTE = 1_024;
const MAX_SEGMENT = 128;

/** 默认缓存容量。 */
const DEFAULT_LIMIT = 256;

/**
 * 段级判定表。顺序即优先级：先认邮箱（含 `@`），再认 UUID、长数字、长哈希，
 * 最后才是 token 形态；都没命中的段按长度截断。
 */
const SEGMENT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/u, "{email}"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu, "{uuid}"],
  [/^\d{7,}$/u, "{id}"],
  [/^[0-9a-f]{16,}$/iu, "{hash}"],
  [/^(?=.{20,}$)(?=.*[a-z])(?=.*[A-Z0-9])[-._~+/A-Za-z0-9]+=*$/u, "{token}"],
];

/** 解码失败时按原串处理：残缺转义不该让整条路由崩掉。 */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** 单段：命中判定表则整体替换，否则截断。 */
function sanitizedSegment(rawSegment: string): string {
  const segment = decoded(rawSegment);
  for (const [pattern, placeholder] of SEGMENT_RULES) {
    if (pattern.test(segment)) return placeholder;
  }
  return segment.slice(0, MAX_SEGMENT);
}

/** 路由：逐段清洗后拼回；空路径统一成 `/`。 */
function sanitizedRoute(pathname: string): string {
  const pieces = pathname.split("/").map(sanitizedSegment);
  return pieces.join("/") || "/";
}

/** 默认端口省掉：`https:443` 与 `http:80` 不写进 identity。 */
function stripDefaultPort(parsed: URL): void {
  const defaultPort =
    parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "";
  if (parsed.port === defaultPort) parsed.port = "";
}

/**
 * base URL → 端点身份。
 * 只接受 http(s)；凭据、query 与 fragment 一律丢弃。
 */
export function sanitizeProviderEndpoint(baseURL: string): ProviderEndpointIdentity | undefined {
  const parsed = parseHttpUrl(baseURL);
  if (parsed === undefined) return undefined;
  // URL 的五个可写片段：身份信息全部清空，只留协议、主机与路径。
  for (const fragment of ["username", "password", "search", "hash"] as const) parsed[fragment] = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  stripDefaultPort(parsed);
  return {
    origin: parsed.origin,
    route: sanitizedRoute(parsed.pathname).slice(0, MAX_ROUTE),
    sanitizerVersion: PROVIDER_ENDPOINT_SANITIZER_VERSION,
  };
}

/** 长度闸门 + http(s) 判定 + 解析：三道都过才给 URL 对象。 */
function parseHttpUrl(value: string): URL | undefined {
  if (value.length > MAX_INPUT) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  return isHttp(parsed.protocol) ? parsed : undefined;
}

function isHttp(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

/**
 * 端点身份缓存：键是「provider 种类 + 原始 base URL」，值是身份或「无身份」。
 * 命中刷新 LRU 顺序；超容量逐出最久未用的项；空 baseURL 不读写缓存。
 */
export class ProviderEndpointIdentityCache {
  readonly #entries = new Map<string, ProviderEndpointIdentity | null>();
  readonly #limit: number;

  constructor(limit = DEFAULT_LIMIT) {
    this.#limit = limit;
  }

  /** 端点身份的唯一入口：命中缓存或解析一次并把结果（含「无身份」）留在表里。 */
  resolve(
    providerKind: string | undefined,
    baseURL: string | undefined,
  ): ProviderEndpointIdentity | undefined {
    const trimmed = baseURL?.trim();
    if (!trimmed) return undefined;
    const cacheKey = `${providerKind ?? "unknown"}\u0000${trimmed}`;
    const remembered = this.#entries.get(cacheKey);
    if (remembered !== undefined) {
      // 命中即刷新：删掉再插，Map 的插入序就变成 LRU 序。
      this.#entries.delete(cacheKey);
      this.#entries.set(cacheKey, remembered);
      return remembered ?? undefined;
    }
    const resolved = sanitizeProviderEndpoint(trimmed) ?? null;
    this.#entries.set(cacheKey, resolved);
    this.#evict();
    return resolved ?? undefined;
  }

  get size(): number {
    return this.#entries.size;
  }

  #evict(): void {
    while (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) return;
      this.#entries.delete(oldest.value);
    }
  }
}
