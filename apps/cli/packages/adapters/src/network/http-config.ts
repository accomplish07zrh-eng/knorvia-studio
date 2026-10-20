// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// HTTP 代理与 TLS 配置解析：显式配置优先于环境变量，工具透传环境再兜底。
// 形状声明见 http-config-types.ts（仅内部使用，不改变本文件导出面）。
//
// 解析顺序（一次请求）：
// 一、no_proxy / KNORVIA_NO_PROXY 命中则直连（noProxyMatched）；
// 二、显式 httpProxy；
// 三、KNORVIA_HTTP_PROXY 环境变量；
// 四、以上都没有时，resolveWebFetchProxyForRequest 再读工具透传环境里的
//     https_proxy/http_proxy/all_proxy（大写优先于小写之外的顺序见 CAPTURED_PROXY_KEYS）。
//
// 端口与通配规则：端口约束必须先于通配判断，`*.example.com` 同时匹配裸域与子域。

import { readFileSync } from "node:fs";
import {
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  readKnorviaToolEnvPassthroughEnv,
} from "@knorvia/shared/runtime-env";
import type {
  BypassRule,
  NetworkProxyOptions,
  NetworkProxyResolution,
  NetworkTlsOptions,
} from "./http-config-types.js";

const DEFAULT_PORT_SCHEMES = new Set(["http:", "https:", "ws:", "wss:", "ftp:"]);

/**
 * 工具透传环境里按序尝试的代理变量名（大写在前，小写随后）。
 * 空格分隔的字面量再拆分属压行写法，这里按组声明；运行时顺序不变。
 */
const CAPTURED_HTTPS_KEYS = ["https_proxy", "HTTPS_PROXY"] as const;
const CAPTURED_HTTP_KEYS = ["http_proxy", "HTTP_PROXY"] as const;
const CAPTURED_ALL_KEYS = ["all_proxy", "ALL_PROXY"] as const;
const CAPTURED_PROXY_KEYS: readonly string[] = [
  ...CAPTURED_HTTPS_KEYS,
  ...CAPTURED_HTTP_KEYS,
  ...CAPTURED_ALL_KEYS,
];

function nonblank(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/** 目标 URL：非 string/URL 或非 http(s) 协议一律视为不可代理。 */
function requestTarget(input: string | URL): URL | undefined {
  // URL.parse 不抛异常，非法输入直接返回 null，省掉 try/catch 这一层。
  const url = typeof input === "string" ? URL.parse(input) : input;
  if (url === null) return undefined;
  if (url.protocol === "http:" || url.protocol === "https:") return url;
  return undefined;
}

/** 主机名规范化：去空白、小写、剥掉 IPv6 方括号与结尾的点。 */
function normalizedHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

/** 带 scheme 的 no_proxy 条目：解析成 host + 端口。解析不了就跳过该条。 */
function urlRule(token: string): BypassRule | undefined {
  // URL.parse 返回 null 而非抛错，省掉外层 try/catch。
  const url = URL.parse(token);
  if (url === null) return undefined;

  const explicitPort = url.port;
  if (explicitPort || !DEFAULT_PORT_SCHEMES.has(url.protocol)) {
    return { host: normalizedHost(url.hostname), port: explicitPort || undefined };
  }
  // native URL 会隐藏显式默认端口；换另一个 special scheme 只恢复端口存在性。
  // authority/control/slash 的解析仍交原生 URL，避免把 path/userinfo 的冒号当端口。
  const scheme = url.protocol === "https:" || url.protocol === "wss:" ? "http:" : "https:";
  const recovered = URL.parse(scheme + token.slice(token.indexOf(":") + 1));
  return { host: normalizedHost(url.hostname), port: recovered?.port || undefined };
}

/** 不带 scheme 的条目：支持 [v6]:port、host:port 与裸主机。 */
function bareRule(token: string): BypassRule | undefined {
  let host = token;
  let port: string | undefined;
  if (token.startsWith("[")) {
    const close = token.indexOf("]");
    if (close < 0) return undefined;
    host = token.slice(1, close);
    const suffix = token.slice(close + 1);
    // 不完整括号或坏后缀必须整体跳过，不能截短成另一个可绕过的 hostname。
    if (!host || /[[\]]/.test(host) || (suffix && !suffix.startsWith(":"))) return undefined;
    if (/[[\]:]/.test(suffix.slice(1))) return undefined;
    port = suffix.slice(1) || undefined;
  } else {
    if (/[[\]]/.test(token)) return undefined;
    const colon = token.indexOf(":");
    if (colon > 0 && colon === token.lastIndexOf(":")) {
      host = token.slice(0, colon);
      port = token.slice(colon + 1) || undefined;
    }
  }
  return { host: normalizedHost(host), port };
}

/** 单条 no_proxy 条目是否命中目标：端口约束先于通配，命中即绕过代理。 */
function ruleMatches(rule: BypassRule, host: string, port: string): boolean {
  if (!rule.host) return false;
  // 端口约束必须先于 wildcard，否则 *:443 会错误放行其他端口。
  if (rule.port !== undefined && rule.port !== port) return false;
  if (rule.host === "*") return true;
  const pattern = rule.host.startsWith("*.")
    ? rule.host.slice(2)
    : rule.host.startsWith(".")
      ? rule.host.slice(1)
      : rule.host;
  return host === pattern || host.endsWith(`.${pattern}`);
}

function bypasses(url: URL, list: string | undefined): boolean {
  if (!list) return false;
  const host = normalizedHost(url.hostname);
  if (!host) return false;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  for (const entry of list.split(",")) {
    const token = entry.trim().toLowerCase();
    if (!token) continue;
    const rule = token.includes("://") ? urlRule(token) : bareRule(token);
    if (rule && ruleMatches(rule, host, port)) return true;
  }
  return false;
}

/** 代理 URL 规范化：缺 scheme 时补 http://，解析失败返回 undefined。 */
function normalizedProxy(value: string | undefined): string | undefined {
  const text = nonblank(value);
  if (!text) return undefined;
  // 缺 scheme 时补 http://，再交给 URL.parse（不抛异常，失败返回 null）。
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text);
  const parsed = URL.parse(hasScheme ? text : `http://${text}`);
  return parsed?.href;
}

/**
 * 直连结论（未命中绕过、也没有可用代理）。
 * 每次都要新建对象：调用方可能就地记录或改写，共享同一实例会互相污染。
 */
function directResolution(): NetworkProxyResolution {
  return { noProxyMatched: false };
}

/** 命中 no_proxy 的结论。同样每次新建。 */
function bypassResolution(): NetworkProxyResolution {
  return { noProxyMatched: true };
}

/** 组装「经某个代理出去」的结论。 */
function viaProxy(proxySource: string, proxyUrl: string): NetworkProxyResolution {
  const resolution = {} as NetworkProxyResolution;
  resolution.noProxyMatched = false;
  resolution.proxySource = proxySource;
  resolution.proxyUrl = proxyUrl;
  return resolution;
}

function explicitProxy(settings: NetworkProxyOptions): NetworkProxyResolution | undefined {
  const source = normalizedProxy(settings.httpProxy);
  if (source === undefined) return undefined;
  return viaProxy("network.httpProxy", source);
}

function environmentProxy(settings: NetworkProxyOptions): NetworkProxyResolution | undefined {
  const source = normalizedProxy(settings.env?.[KNORVIA_HTTP_PROXY_ENV_KEY]);
  if (source === undefined) return undefined;
  return viaProxy(`env:${KNORVIA_HTTP_PROXY_ENV_KEY}`, source);
}

/** 产品自身配置的解析：绕过 → 显式 → 环境变量。 */
function productSelection(url: URL, settings: NetworkProxyOptions): NetworkProxyResolution {
  const list = nonblank(settings.noProxy) ?? nonblank(settings.env?.[KNORVIA_NO_PROXY_ENV_KEY]);
  if (bypasses(url, list)) return bypassResolution();
  return explicitProxy(settings) ?? environmentProxy(settings) ?? directResolution();
}

/** 工具透传环境：no_proxy 先判绕过，再按变量顺序取第一个可用代理。 */
function capturedSelection(
  url: URL,
  settings: NetworkProxyOptions,
): NetworkProxyResolution | undefined {
  const captured = readKnorviaToolEnvPassthroughEnv(settings.env ?? {});
  const list = nonblank(captured.no_proxy) ?? nonblank(captured.NO_PROXY);
  if (bypasses(url, list)) return bypassResolution();
  for (const key of CAPTURED_PROXY_KEYS) {
    const source = normalizedProxy(captured[key]);
    if (source !== undefined) {
      return viaProxy(`env:${KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY}.${key}`, source);
    }
  }
  return undefined;
}

// 边界语义（实现侧约定）：
// 一、空白或全空格的 proxy/no_proxy 视为未配置，不产生 proxySource。
// 二、非法 URL 的 proxy 值被忽略，而不是回退成直连以外的行为。
// 三、no_proxy 条目解析失败一律跳过该条，不影响后续条目继续匹配。
export function resolveProxyUrlForRequest(
  requestUrl: string | URL,
  options: NetworkProxyOptions,
): string | undefined {
  return resolveProxyForRequest(requestUrl, options).proxyUrl;
}

export function resolveProxyForRequest(
  requestUrl: string | URL,
  options: NetworkProxyOptions,
): NetworkProxyResolution {
  const url = requestTarget(requestUrl);
  return url === undefined ? directResolution() : productSelection(url, options);
}

export function resolveWebFetchProxyForRequest(
  requestUrl: string | URL,
  options: NetworkProxyOptions,
): NetworkProxyResolution {
  const url = requestTarget(requestUrl);
  if (url === undefined) return directResolution();
  const selected = productSelection(url, options);
  if (selected.noProxyMatched || selected.proxyUrl !== undefined) return selected;
  return capturedSelection(url, options) ?? directResolution();
}

export function resolveTlsCaCertFile(options: NetworkTlsOptions): string | undefined {
  return nonblank(options.caCertFile) ?? nonblank(options.env?.[KNORVIA_AGENT_CA_CERT_ENV_KEY]);
}

export function loadTlsCaCertificates(options: NetworkTlsOptions): Buffer | undefined {
  const path = resolveTlsCaCertFile(options);
  return path === undefined ? undefined : readFileSync(path);
}
