// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// Node 上的 HTTP 客户端适配器：把一次请求拆成三段落 —— 定预算、备连接、发请求与结算。
//
// 关键约束（排障时按这个顺序看）：
// 一、URL 先解析：不是合法 URL 抛 invalid_url，协议不是 http(s) 抛 unsupported_protocol，
//     两者都带上调用方给的原始输入，便于直接回显。
// 二、预算优先级：请求自带的 timeoutMs / maxResponseBytes → 适配器设置 → 内置常量。
// 三、代理与出口策略互斥：egressPolicy 为 public 时要走 DNS 预检；而代理侧的解析结果
//     无法验证，所以「代理 + public」直接按 egress_blocked 拒绝，不走网络。
// 四、请求的正文与头要等出口预检结束再读：预检可能等待，提前读会拿到过期内容。
// 五、取消与超时：父 signal 已取消则立即取消；否则挂一次性监听透传。超时用带毫秒数的
//     原因取消，便于和用户主动取消区分（两者错误码不同）。
// 六、传输方式按需选择：走代理、要预检、或 https 且配了自定义 CA 时用 node 的 http(s)；
//     其余情况用全局 fetch。两条路径都统一成 Response 形态再往下走。
// 七、无正文状态码不读体；正文超限抛 too_large 并带上上限；父监听与定时器在两条路径上
//     都要清理，避免长生命周期调用方泄漏。
// 八、错误归一化：底层错误统一包成带 code 与 url 的端口错误，保留 cause 链。
//
// 响应里的 egress 元信息记录「是否走代理、代理来源与主机、是否命中 no_proxy、是否自定义 CA」。

import {
  createHttpClientError,
  isHttpClientPortError,
  type HttpClientEgressInfo,
  type HttpClientErrorCode,
  type HttpClientPort,
  type HttpClientRequest,
  type HttpClientResponse,
  type HttpClientRunOptions,
} from "@knorvia/contracts";
import {
  loadTlsCaCertificates,
  resolveProxyForRequest,
  resolveWebFetchProxyForRequest,
} from "../network/http-config.js";
import {
  assertPublicEgressDestination,
  createPublicEgressLookup,
  defaultPublicDnsLookup,
  type DnsLookup,
} from "./public-egress-policy.js";
import { readResponseBody } from "./response-body.js";
import { exchangeWithNode } from "./node-exchange.js";
import type { NodeHttpClientAdapterOptions } from "./client-options-types.js";

export type { NodeHttpClientAdapterOptions } from "./client-options-types.js";

/** 未配置时的兜底：三分钟超时、十兆响应上限。 */
const FALLBACK_TIMEOUT_MS = 180_000;
const FALLBACK_RESPONSE_BYTES = 10_485_760;

/** 允许的协议：只有这两种能发出去。 */
const ALLOWED_PROTOCOLS = ["http:", "https:"];

/** 追踪头：请求带 traceId 且尚未设置时补上。 */
const TRACE_HEADER = "x-knorvia-trace-id";

/** 从代理地址里取「主机:端口」；解析失败就不报主机。 */
function proxyLabel(proxyTarget: string | undefined): string | undefined {
  if (proxyTarget === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(proxyTarget);
  } catch {
    return undefined;
  }
  return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
}

/** 把底层失败归一化成端口错误：已经是端口错误就原样返回。 */
function toPortError(
  cause: unknown,
  url: string,
  signal: AbortSignal,
  timedOut: boolean,
  viaProxy: boolean,
): unknown {
  if (isHttpClientPortError(cause)) return cause;

  const messageOf = (fallback: string): string =>
    cause instanceof Error ? cause.message : fallback;
  let code: HttpClientErrorCode;
  let message: string;
  if (timedOut) {
    code = "timeout";
    message = messageOf("HTTP request timed out");
  } else if (signal.aborted) {
    code = "cancelled";
    message = messageOf("HTTP request was cancelled");
  } else if (cause instanceof DOMException && cause.name === "AbortError") {
    code = "cancelled";
    message = "HTTP request was cancelled";
  } else {
    code = viaProxy ? "proxy_error" : "network_error";
    message = messageOf("HTTP request failed");
  }
  return createHttpClientError({ code, url, message, cause });
}

/** 本次请求的预算：超时、正文上限、是否走工具透传环境的代理回退。 */
type Budget = {
  timeoutMs: number;
  responseBytes: number;
  capturedFallback: boolean;
};

/** 一次请求的准备工作：规范化后的 URL、预算、代理目标、解析器与 CA。 */
type Prepared = {
  url: URL;
  finalUrl: string;
  budget: Budget;
  proxyUrl: string | undefined;
  proxySource: string | undefined;
  noProxyMatched: boolean;
  resolver: DnsLookup | undefined;
  ca: Buffer | undefined;
};

/** 取消联动：把父 signal 接到内部 abort 闸门上，并记住是否需要摘监听。 */
type Cancellation = {
  gate: AbortController;
  parent: AbortSignal | undefined;
  linked: boolean;
  detach(): void;
};

/** 解析并校验请求 URL；不合法时直接抛出带 code 的端口错误。 */
function parseRequestUrl(inputUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch (cause) {
    throw createHttpClientError({
      code: "invalid_url",
      url: inputUrl,
      message: `Invalid URL: ${inputUrl}`,
      cause,
    });
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw createHttpClientError({
      code: "unsupported_protocol",
      url: inputUrl,
      message: `Unsupported URL protocol for HTTP request: ${parsed.protocol}`,
    });
  }
  return parsed;
}

/** 定预算：请求侧优先，其次适配器设置，最后兜底常量。 */
function makeBudget(request: HttpClientRequest, settings: NodeHttpClientAdapterOptions): Budget {
  const budget = {} as Budget;
  budget.timeoutMs = request.timeoutMs ?? settings.timeoutMs ?? FALLBACK_TIMEOUT_MS;
  budget.responseBytes =
    request.maxResponseBytes ?? settings.maxResponseBytes ?? FALLBACK_RESPONSE_BYTES;
  budget.capturedFallback = settings.capturedUserProxyEnvFallback === true;
  return budget;
}

/** 建立取消联动：父 signal 已取消则立刻取消，否则挂一次性监听。 */
function linkCancellation(parent: AbortSignal | undefined): Cancellation {
  const gate = new AbortController();
  const forward = (): void => gate.abort(parent?.reason);
  let linked = false;
  if (parent?.aborted) forward();
  else if (parent !== undefined) {
    parent.addEventListener("abort", forward, { once: true });
    linked = true;
  }
  return {
    gate,
    parent,
    linked,
    detach(): void {
      if (linked) parent?.removeEventListener("abort", forward);
    },
  };
}

/**
 * 超时闸门：只有「预算确实大于 0」才设定时器。
 * 注意这里判的是 `> 0` 的正向条件而不是 `<= 0` 的取反 —— NaN 两种比较都为 false，
 * 用 `<= 0` 会把 NaN 当成「正预算」而设出一个立刻生效的定时器。
 */
function armDeadline(
  budgetMs: number,
  gate: AbortController,
  markTimedOut: () => void,
): NodeJS.Timeout | undefined {
  if (!(budgetMs > 0)) return undefined;
  return setTimeout(() => {
    markTimedOut();
    gate.abort(new Error(`HTTP request timed out after ${budgetMs}ms`));
  }, budgetMs);
}

/**
 * 出口预检的同步部分：public 策略下不允许配代理，直接抛。
 * 单独拆出来是为了让「不需要预检」的请求不经过任何 await —— 否则会多出一个微任务边界，
 * 调用方紧接着的取消操作就会落在 fetch 之后。
 */
function assertEgressNotProxied(prepared: Prepared): void {
  if (prepared.resolver === undefined) return;
  if (prepared.proxyUrl === undefined) return;
  throw createHttpClientError({
    code: "egress_blocked",
    url: prepared.finalUrl,
    message:
      "HTTP public egress cannot use a proxy because proxy-side DNS resolution cannot be verified",
  });
}

/** 组装发出去用的头：复制请求头，必要时补追踪头。 */
function buildHeaders(request: HttpClientRequest): Headers {
  const headers = new Headers(request.headers);
  const traceId = request.trace?.traceId;
  if (traceId && !headers.has(TRACE_HEADER)) headers.set(TRACE_HEADER, traceId);
  return headers;
}

/** 发请求：按需在 node http(s) 与全局 fetch 之间选择，统一返回 Response。 */
function dispatch(
  prepared: Prepared,
  request: HttpClientRequest,
  headers: Headers,
  body: Buffer | undefined,
  gate: AbortController,
): Promise<Response> {
  const method = request.method ?? "GET";
  const needsNode =
    prepared.proxyUrl !== undefined ||
    prepared.resolver !== undefined ||
    (prepared.url.protocol === "https:" && prepared.ca !== undefined);

  if (needsNode) {
    return exchangeWithNode({
      url: prepared.url,
      method,
      headers,
      body,
      signal: gate.signal,
      proxyUrl: prepared.proxyUrl,
      ca: prepared.ca,
      lookup:
        prepared.resolver === undefined
          ? undefined
          : createPublicEgressLookup(prepared.finalUrl, prepared.resolver, { signal: gate.signal }),
    });
  }
  return fetch(prepared.finalUrl, {
    method,
    headers,
    // Node 的 fetch 接受 Buffer；类型层面的 BodyInit 不含它，这里按运行时约定直接传。
    body: body as unknown as BodyInit | null | undefined,
    redirect: request.redirect ?? "manual",
    signal: gate.signal,
  });
}

/** 把响应头摊成普通对象（Headere.forEach 的键已小写）。 */
function plainHeaders(reply: Response): Record<string, string> {
  const collected: Record<string, string> = {};
  reply.headers.forEach((value, key) => {
    collected[key] = value;
  });
  return collected;
}

export class NodeHttpClientAdapter implements HttpClientPort {
  readonly #settings: NodeHttpClientAdapterOptions;
  #caLoaded = false;
  #ca: Buffer | undefined;

  constructor(settings: NodeHttpClientAdapterOptions = {}) {
    this.#settings = settings;
  }

  /** 自定义 CA：首次需要时读一次并缓存，避免每请求读盘。 */
  #certificates(): Buffer | undefined {
    if (this.#caLoaded) return this.#ca;
    this.#ca = loadTlsCaCertificates({
      caCertFile: this.#settings.caCertFile,
      env: this.#settings.env,
    });
    this.#caLoaded = true;
    return this.#ca;
  }

  /** 准备阶段：URL、预算、代理、预检解析器、CA 一次定齐。 */
  #prepare(request: HttpClientRequest): Prepared {
    const url = parseRequestUrl(request.url);
    const budget = makeBudget(request, this.#settings);
    const pickProxy = budget.capturedFallback
      ? resolveWebFetchProxyForRequest
      : resolveProxyForRequest;
    const proxy = pickProxy(url, {
      env: this.#settings.env,
      httpProxy: this.#settings.proxyUrl,
      noProxy: this.#settings.noProxy,
    });
    const prepared = {} as Prepared;
    prepared.url = url;
    prepared.finalUrl = url.toString();
    prepared.budget = budget;
    prepared.proxyUrl = proxy.proxyUrl;
    prepared.proxySource = proxy.proxySource;
    prepared.noProxyMatched = proxy.noProxyMatched;
    prepared.resolver =
      request.egressPolicy === "public"
        ? (this.#settings.dnsLookup ?? defaultPublicDnsLookup())
        : undefined;
    prepared.ca = this.#certificates();
    return prepared;
  }

  async request(
    request: HttpClientRequest,
    settings: HttpClientRunOptions = {},
  ): Promise<HttpClientResponse> {
    const startedAt = Date.now();
    const prepared = this.#prepare(request);
    const cancellation = linkCancellation(settings.signal);
    let timedOut = false;
    const deadline = armDeadline(prepared.budget.timeoutMs, cancellation.gate, () => {
      timedOut = true;
    });

    try {
      // 先做同步部分的出口检查（不产生 await 边界），再按需等待 DNS 预检。
      assertEgressNotProxied(prepared);
      // 只有真的启用 public 预检时才等待；否则请求直接同步往下走。
      if (prepared.resolver !== undefined) {
        await assertPublicEgressDestination(prepared.url, prepared.resolver, {
          signal: cancellation.gate.signal,
        });
      }

      // 预检可能等待，正文与头必须在此之后才读。
      const headers = buildHeaders(request);
      const body = request.body ? Buffer.from(request.body) : undefined;
      const reply = await dispatch(prepared, request, headers, body, cancellation.gate);

      const responseUrl = reply.url || prepared.finalUrl;
      const bytes = await readResponseBody(
        reply,
        prepared.budget.responseBytes,
        cancellation.gate.signal,
        responseUrl,
      );
      const egress: HttpClientEgressInfo = {
        proxied: prepared.proxyUrl !== undefined,
        proxySource: prepared.proxySource,
        proxyHost: proxyLabel(prepared.proxyUrl),
        noProxyMatched: prepared.noProxyMatched || undefined,
        customCa: prepared.ca !== undefined,
      };
      return {
        url: responseUrl,
        status: reply.status,
        statusText: reply.statusText,
        headers: plainHeaders(reply),
        body: bytes,
        bytes: bytes.byteLength,
        durationMs: Math.max(0, Date.now() - startedAt),
        egress,
      };
    } catch (cause) {
      throw toPortError(
        cause,
        prepared.finalUrl,
        cancellation.gate.signal,
        timedOut,
        prepared.proxyUrl !== undefined,
      );
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      cancellation.detach();
    }
  }
}

export function createNodeHttpClientAdapter(
  settings: NodeHttpClientAdapterOptions = {},
): HttpClientPort {
  return new NodeHttpClientAdapter(settings);
}

export function createNodeWebFetchHttpClientAdapter(
  settings: NodeHttpClientAdapterOptions = {},
): HttpClientPort {
  return new NodeHttpClientAdapter({ ...settings, capturedUserProxyEnvFallback: true });
}
