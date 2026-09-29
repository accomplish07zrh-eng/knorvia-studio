// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createNodeWebFetchHttpClientAdapter } from "../http/index.js";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { redactSourceReference } from "./source-redaction.js";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const sensitiveZipHeaders = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
]);
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
  url: string;
  maxBytes: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  zip: boolean;
}) {
  assertAtomicNotAborted(input.signal);
  if (input.zip) assertZipDownloadHeaders(input.headers);
  const client = createNodeWebFetchHttpClientAdapter({
    env: process.env,
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
    const response = await client.request(
      {
        url: current,
        method: "GET",
        ...(headers !== undefined ? { headers } : {}),
        redirect: "manual",
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

export class PluginZipDownloadError extends Error {
  readonly status?: number;
  readonly url: string;

  constructor(message: string, url: string, status?: number) {
    super(message);
    this.name = "PluginZipDownloadError";
    // 错误字段要保留无凭据 URL 的原始拼写；通用来源诊断的规范化会额外补尾斜杠。
    this.url = redactDownloadUrl(url);
    if (status !== undefined) this.status = status;
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
