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
    signal: request.signal,
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
