// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 代理 fetch 工厂：把「代理选择 + 自定义 CA」注入到一次 fetch 调用里。
// 形状声明见 proxy-fetch-types.ts，本文件原样再导出。
//
// 行为要点：
// 一、四个可选字段全空时返回底层 fetch 本身，不做包装（零开销直通）。
// 二、非 http(s) 协议与 URL 解析失败一律回退底层 fetch，不改变错误形态。
// 三、既没有代理也没有自定义 CA 时同样直通，避免无谓的规范化。
// 四、自定义 CA 只在首次需要时加载并缓存，之后复用同一份 Buffer。

import {
  loadTlsCaCertificates,
  resolveProxyUrlForRequest,
  resolveTlsCaCertFile,
} from "./http-config.js";
import { openProxyResponse } from "./proxy-fetch-exchange.js";
import type { FetchLike, ProxyFetchOptionSet } from "./proxy-fetch-types.js";

/** 一次调用的规范化结果：URL、方法、头、信号与可选请求体。 */
interface NormalizedCall {
  body: Buffer | undefined;
  headers: Headers;
  method: string;
  signal: AbortSignal;
  url: URL;
}

async function normalizeCall(
  input: Parameters<FetchLike>[0],
  init: Parameters<FetchLike>[1],
): Promise<NormalizedCall> {
  const outgoing = new Request(input, init);
  const method = outgoing.method.toUpperCase();
  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const bytes = await outgoing.arrayBuffer();
    if (bytes.byteLength) body = Buffer.from(bytes);
  }
  // 修复代理请求取消偶发失效（停止后响应体读取永久挂起）：Request.signal 只经弱引用跟随
  // 调用方的 signal，临时 Request 被垃圾回收后取消不再传到这里，高负载下 GC 频繁时尤其明显。
  // 优先使用调用方原始 signal；没有时才用 Request 自身的（它只会因输入 Request 而取消）。
  const signal = init?.signal ?? (input instanceof Request ? input.signal : outgoing.signal);
  return { body, headers: outgoing.headers, method, signal, url: new URL(outgoing.url) };
}

function requestUrl(input: Parameters<FetchLike>[0]): URL | undefined {
  if (input instanceof URL) return input;
  try {
    return new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return undefined;
  }
}

export function createNetworkProxyFetch(options: ProxyFetchOptionSet): FetchLike {
  const directFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const bare = !options.caCertFile && !options.env && !options.httpProxy && !options.noProxy;
  if (bare) return directFetch;

  let caLoaded = false;
  let cachedCa: Buffer | undefined;
  return async (input, init) => {
    const url = requestUrl(input);
    if (url === undefined) return directFetch(input, init);
    const supported = url.protocol === "http:" || url.protocol === "https:";
    if (!supported) return directFetch(input, init);

    const proxyUrl = resolveProxyUrlForRequest(url, options);
    const selectedCaPath = resolveTlsCaCertFile(options);
    if (!proxyUrl && !selectedCaPath) return directFetch(input, init);

    // GET/HEAD 也须等待完整规范化完成，随后才从实时 options 读取 CA，避免同步前缀抢读。
    const prepared = await normalizeCall(input, init);
    let ca: Buffer | undefined;
    if (selectedCaPath) {
      if (!caLoaded) {
        cachedCa = loadTlsCaCertificates(options);
        caLoaded = true;
      }
      ca = cachedCa;
    }
    return openProxyResponse({ ...prepared, ca, proxyUrl });
  };
}
