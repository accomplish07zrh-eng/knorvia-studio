// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  loadTlsCaCertificates,
  resolveProxyUrlForRequest,
  resolveTlsCaCertFile,
} from "./http-config.js";
import { openProxyResponse } from "./proxy-fetch-exchange.js";

type NetworkFetch = typeof globalThis.fetch;

interface NetworkProxyFetchOptions {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
  fetch?: NetworkFetch;
  httpProxy?: string;
  noProxy?: string;
}

async function prepareRequest(
  input: Parameters<NetworkFetch>[0],
  init: Parameters<NetworkFetch>[1],
) {
  const request = new Request(input, init);
  const method = request.method.toUpperCase();
  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength) body = Buffer.from(bytes);
  }
  return {
    url: new URL(request.url),
    method,
    headers: request.headers,
    // 修复代理请求取消偶发失效（停止后响应体读取永久挂起）：Request.signal 只经弱引用跟随
    // 调用方的 signal，临时 Request 被垃圾回收后取消不再传到这里，高负载下 GC 频繁时尤其明显。
    // 优先使用调用方原始 signal；没有时才用 Request 自身的（它只会因输入 Request 而取消）。
    signal: init?.signal ?? (input instanceof Request ? input.signal : request.signal),
    body,
  };
}

export function createNetworkProxyFetch(options: NetworkProxyFetchOptions): NetworkFetch {
  const directFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  if (!options.caCertFile && !options.env && !options.httpProxy && !options.noProxy) {
    return directFetch;
  }

  let caLoaded = false;
  let cachedCa: Buffer | undefined;
  return async (input, init) => {
    let url: URL;
    let supported: boolean;
    try {
      url =
        input instanceof URL
          ? input
          : new URL(input instanceof Request ? input.url : String(input));
      supported = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return directFetch(input, init);
    }
    if (!supported) return directFetch(input, init);

    const proxyUrl = resolveProxyUrlForRequest(url, options);
    const selectedCaPath = resolveTlsCaCertFile(options);
    if (!proxyUrl && !selectedCaPath) return directFetch(input, init);

    // GET/HEAD 也须等待完整规范化完成，随后才从实时 options 读取 CA，避免同步前缀抢读。
    const prepared = await prepareRequest(input, init);
    let ca: Buffer | undefined;
    if (selectedCaPath) {
      if (!caLoaded) {
        cachedCa = loadTlsCaCertificates(options);
        caLoaded = true;
      }
      ca = cachedCa;
    }
    return openProxyResponse({
      ...prepared,
      proxyUrl,
      ca,
    });
  };
}
