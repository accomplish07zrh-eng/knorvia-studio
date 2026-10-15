// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createNodeWebFetchHttpClientAdapter } from "../http/index.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { redactSourceReference } from "./source-redaction.js";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
/* 会带出凭据的头部一律拒绝转发 */
const sensitiveZipHeaders = new Set(
  "authorization cookie proxy-authorization set-cookie".split(" "),
);
export const SOURCE_DOWNLOAD_TIMEOUT = 180_000;

export function assertZipDownloadUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const parts = hostname.split(".");
  const ipv4Loopback =
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d+$/u.test(part) && Number(part) <= 255);
  const loopback =
    hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || ipv4Loopback;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Plugin ZIP downloads require HTTPS or an HTTP loopback URL");
  }
  return url;
}

export function assertZipDownloadHeaders(headers?: Record<string, string>): void {
  if (headers === undefined) return;
  if (headers === null || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("Plugin ZIP headers must be a string map");
  }
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value !== "string" || sensitiveZipHeaders.has(name.toLowerCase())) {
      throw new Error(`Unsupported plugin ZIP header: ${name}`);
    }
  }
}

export async function downloadSource(input: {
  /* 下载地址 */ url: string;
  maxBytes: number;
  /* 附加请求头 */ headers?: Record<string, string>;
  /* 取消信号 */ signal?: AbortSignal;
  zip: boolean;
}) {
  assertAtomicNotAborted(input.signal);
  if (input.zip) assertZipDownloadHeaders(input.headers);
  const client = /* 统一 HTTP 出口：超时与字节上限内置 */ createNodeWebFetchHttpClientAdapter({
    env: /* 透传代理等进程环境 */ process.env,
    timeoutMs: SOURCE_DOWNLOAD_TIMEOUT,
    maxResponseBytes: input.maxBytes,
  });
  let current = input.url;
  let headers = input.headers;
  for (let redirects = 0; ; redirects += 1) {
    assertAtomicNotAborted(input.signal);
    const url = input.zip ? assertZipDownloadUrl(current) : new URL(current);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Plugin marketplace downloads require HTTP or HTTPS");
    }
    const response = /* 手动跟随，逐跳校验落点 */ await client.request(
      {
        url: current,
        method: /* 只读获取 */ "GET",
        ...(headers !== undefined ? { headers } : {}),
        redirect: /* 重定向由本函数接管 */ "manual",
        timeoutMs: SOURCE_DOWNLOAD_TIMEOUT,
        maxResponseBytes: input.maxBytes,
      },
      input.signal ? { signal: input.signal } : undefined,
    );
    assertAtomicNotAborted(input.signal);
    if (response.body.byteLength > input.maxBytes || response.bytes > input.maxBytes) {
      throw new Error("Plugin source download exceeds its byte limit");
    }
    if (!redirectStatuses.has(response.status)) return { response, url: current };
    if (redirects === 5) throw new Error("Plugin source download exceeded 5 redirects");
    const location = Object.entries(response.headers).find(
      ([key]) => key.toLowerCase() === "location",
    )?.[1];
    if (!location) throw new Error("Plugin source redirect is missing Location");
    const next = new URL(location, url);
    if (next.origin !== url.origin) headers = undefined;
    current = next.href;
  }
}

export class /* ZIP 下载失败：携带状态码与脱敏后的请求地址 */ PluginZipDownloadError extends Error {
  readonly status?: /* HTTP 状态码 */ number;
  readonly url: /* 脱敏后的请求地址 */ string;

  constructor(/* 原始错误文案 */ text: string, url: string, httpStatus?: number) {
    super(text);
    this.name = /* 稳定错误名（调用方按名匹配） */ "PluginZipDownloadError";
    // 错误字段要保留无凭据 URL 的原始拼写；通用来源诊断的规范化会额外补尾斜杠。
    this.url = redactDownloadUrl(url);
    if (httpStatus !== undefined) this.status = httpStatus;
  }
}

function redactDownloadUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.username || parsed.password ? redactSourceReference(value) : value;
  } catch {
    return redactSourceReference(value);
  }
}
