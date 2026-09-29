// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFileSync } from "node:fs";
import {
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  readKnorviaToolEnvPassthroughEnv,
} from "@knorvia/shared/runtime-env";

interface NetworkProxyOptions {
  env?: Record<string, string | undefined>;
  httpProxy?: string;
  noProxy?: string;
}

interface NetworkTlsOptions {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
}

interface NetworkProxyResolution {
  noProxyMatched: boolean;
  proxySource?: string;
  proxyUrl?: string;
}

interface BypassRule {
  host: string;
  port?: string;
}

const DEFAULT_PORT_SCHEMES = new Set(["http:", "https:", "ws:", "wss:", "ftp:"]);
const CAPTURED_PROXY_KEYS = [
  "https_proxy",
  "HTTPS_PROXY",
  "http_proxy",
  "HTTP_PROXY",
  "all_proxy",
  "ALL_PROXY",
];

function nonblank(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function requestTarget(input: string | URL): URL | undefined {
  let url: URL;
  if (typeof input === "string") {
    try {
      url = new URL(input);
    } catch {
      return undefined;
    }
  } else {
    url = input;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

function normalizedHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function urlRule(token: string): BypassRule | undefined {
  try {
    const url = new URL(token);
    let port = url.port;
    if (!port && DEFAULT_PORT_SCHEMES.has(url.protocol)) {
      // native URL 会隐藏显式默认端口；换另一 special scheme 只恢复端口存在性。
      // authority/control/slash 的解析仍交原生 URL，避免把 path/userinfo 的冒号当端口。
      const scheme = url.protocol === "https:" || url.protocol === "wss:" ? "http:" : "https:";
      port = new URL(scheme + token.slice(token.indexOf(":") + 1)).port;
    }
    return { host: normalizedHost(url.hostname), port: port || undefined };
  } catch {
    return undefined;
  }
}

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

function bypasses(url: URL, list: string | undefined): boolean {
  if (!list) return false;
  const host = normalizedHost(url.hostname);
  if (!host) return false;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  for (const entry of list.split(",")) {
    const token = entry.trim().toLowerCase();
    if (!token) continue;
    const rule = token.includes("://") ? urlRule(token) : bareRule(token);
    if (!rule?.host) continue;
    // 端口约束必须先于 wildcard，否则 *:443 会错误放行其他端口。
    if (rule.port !== undefined && rule.port !== port) continue;
    if (rule.host === "*") return true;
    const pattern = rule.host.startsWith("*.")
      ? rule.host.slice(2)
      : rule.host.startsWith(".")
        ? rule.host.slice(1)
        : rule.host;
    if (host === pattern || host.endsWith(`.${pattern}`)) return true;
  }
  return false;
}

function normalizedProxy(value: string | undefined): string | undefined {
  const text = nonblank(value);
  if (!text) return undefined;
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`).href;
  } catch {
    return undefined;
  }
}

function productSelection(url: URL, options: NetworkProxyOptions): NetworkProxyResolution {
  const list = nonblank(options.noProxy) ?? nonblank(options.env?.[KNORVIA_NO_PROXY_ENV_KEY]);
  if (bypasses(url, list)) return { noProxyMatched: true };
  const explicit = normalizedProxy(options.httpProxy);
  if (explicit !== undefined) {
    return { noProxyMatched: false, proxySource: "network.httpProxy", proxyUrl: explicit };
  }
  const environment = normalizedProxy(options.env?.[KNORVIA_HTTP_PROXY_ENV_KEY]);
  if (environment !== undefined) {
    return {
      noProxyMatched: false,
      proxySource: `env:${KNORVIA_HTTP_PROXY_ENV_KEY}`,
      proxyUrl: environment,
    };
  }
  return { noProxyMatched: false };
}

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
  return url ? productSelection(url, options) : { noProxyMatched: false };
}

export function resolveWebFetchProxyForRequest(
  requestUrl: string | URL,
  options: NetworkProxyOptions,
): NetworkProxyResolution {
  const url = requestTarget(requestUrl);
  if (!url) return { noProxyMatched: false };
  const selected = productSelection(url, options);
  if (selected.noProxyMatched || selected.proxyUrl !== undefined) return selected;
  const captured = readKnorviaToolEnvPassthroughEnv(options.env ?? {});
  const list = nonblank(captured.no_proxy) ?? nonblank(captured.NO_PROXY);
  if (bypasses(url, list)) return { noProxyMatched: true };
  for (const key of CAPTURED_PROXY_KEYS) {
    const proxyUrl = normalizedProxy(captured[key]);
    if (proxyUrl !== undefined) {
      return {
        noProxyMatched: false,
        proxySource: `env:${KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY}.${key}`,
        proxyUrl,
      };
    }
  }
  return { noProxyMatched: false };
}

export function resolveTlsCaCertFile(options: NetworkTlsOptions): string | undefined {
  return nonblank(options.caCertFile) ?? nonblank(options.env?.[KNORVIA_AGENT_CA_CERT_ENV_KEY]);
}

export function loadTlsCaCertificates(options: NetworkTlsOptions): Buffer | undefined {
  const path = resolveTlsCaCertFile(options);
  return path === undefined ? undefined : readFileSync(path);
}
