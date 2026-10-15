// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

// 请求生命周期（实现侧说明，便于接手排障）：
// 一、解析 URL：非 URL 文本抛 invalid_url，非 http(s) 抛 unsupported_protocol；两者都带原始输入。
// 二、确定预算：单次请求的 timeoutMs / maxResponseBytes 优先，其次适配器默认，最后内置常量。
// 三、选代理解析器：capturedUserProxyEnvFallback 打开时用工具透传环境版本，否则用产品配置版本。
// 四、出口策略：egressPolicy === "public" 时启用 DNS 预检；代理 + public 组合直接拒绝，
//     因为代理侧解析结果无法验证，会绕过出口校验。
// 五、自定义 CA：首次需要时加载并缓存，避免每次请求读盘；未配置时为 undefined。
// 六、取消联动：父 signal 已取消则立即取消；否则挂一次性监听，调用方取消会透传到子请求。
// 七、超时：预算大于 0 才设定时器，触发时用带毫秒数的错误取消，便于与用户取消区分。
// 八、请求字段在出口预检之后才读取：预检可能等待，提前冻结会拿到过期正文与头。
// 九、trace：请求带 trace.traceId 时补 x-knorvia-trace-id 头，已存在则不覆盖。
// 十、响应：无正文状态码（204/205/304）不读体；超限抛 too_large；调用方取消抛 cancelled。
// 十一、错误归一化：底层错误统一转成带 code/url 的 HttpClientPortError，保留 cause 链。
// 十二、egress 元信息随响应返回：是否走代理、代理来源与主机、是否命中 no_proxy、是否自定义 CA。

// 错误码归属（供调用方分支，不要用错误文本判断）：
// invalid_url / unsupported_protocol：请求本身不合法，重试无意义。
// egress_blocked：出口策略拒绝（含 public + 代理组合）。
// too_large：响应体超过上限，调用方可提高 maxResponseBytes 后重试。
// cancelled：调用方取消或超时，超时原因保留在 cause 中。
// 其余网络错误原样上抛，由上层决定重试策略。
// 响应组装与资源清理：
// 一、exchangeWithNode 返回原生 Response，随后按状态码与是否读取正文决定后续动作。
// 二、body 为 null（无正文状态码）时直接给空字节，不创建 reader。
// 三、读取正文超限即中断并在错误里带上上限值，避免调用方只看到「太大」而不知上限。
// 四、成功路径最后清理父 signal 监听与超时定时器，防止长生命周期调用方泄漏监听器。
// 五、失败路径同样清理，再抛出归一化错误；两条路径共用同一段清理逻辑。
// 平台与运行环境差异：
// 六、Windows 下 CA 与环境变量大小写不敏感的处理在下层网络模块完成，本层不重复判断。
// 七、HTTP/2 与 HTTP/1.1 的差异由 node http/https 模块吸收，本层只依赖统一 Response 形态。
// 八、代理相关错误不做平台特判：不同代理实现的错误文本各异，统一按网络错误上抛。
// 测试注入点（均为可选字段，生产不设置）：
// 九、dnsLookup：替换出口预检的解析器，用于固定解析结果。
// 十、env：注入环境变量快照，避免测试读取真实环境。
// 十一、timeoutMs 与 maxResponseBytes：把边界压到毫秒/字节级，避免长测试。
// 十二、capturedUserProxyEnvFallback：切换代理解析器，覆盖工具透传环境回退路径。
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10_485_760;

export type { NodeHttpClientAdapterOptions } from "./client-options-types.js";

import type { NodeHttpClientAdapterOptions } from "./client-options-types.js";

function proxyHost(proxyTarget: string | undefined): string | undefined {
  if (proxyTarget === undefined) return undefined;
  try {
    const url = new URL(proxyTarget);
    return url.hostname + (url.port ? `:${url.port}` : "");
  } catch {
    return undefined;
  }
}

function normalizeFailure(
  cause: unknown,
  url: string,
  signal: AbortSignal,
  expired: boolean,
  viaProxy: boolean,
): unknown {
  if (isHttpClientPortError(cause)) return cause;
  let code: HttpClientErrorCode;
  let message: string;
  if (expired) {
    code = "timeout";
    message = cause instanceof Error ? cause.message : "HTTP request timed out";
  } else if (signal.aborted) {
    code = "cancelled";
    message = cause instanceof Error ? cause.message : "HTTP request was cancelled";
  } else if (cause instanceof DOMException && cause.name === "AbortError") {
    code = "cancelled";
    message = "HTTP request was cancelled";
  } else {
    code = viaProxy ? "proxy_error" : "network_error";
    message = cause instanceof Error ? cause.message : "HTTP request failed";
  }
  return createHttpClientError({ code, url, message, cause });
}

export class NodeHttpClientAdapter implements HttpClientPort {
  readonly #settings: NodeHttpClientAdapterOptions;
  #caLoaded = false;
  #ca: Buffer | undefined;

  constructor(settings: NodeHttpClientAdapterOptions = {}) {
    this.#settings = settings;
  }

  #certificates(): Buffer | undefined {
    if (!this.#caLoaded) {
      const ca = loadTlsCaCertificates({
        caCertFile: this.#settings.caCertFile,
        env: this.#settings.env,
      });
      this.#ca = ca;
      this.#caLoaded = true;
    }
    return this.#ca;
  }

  async request(
    request: HttpClientRequest,
    settings: HttpClientRunOptions = {},
  ): Promise<HttpClientResponse> {
    const start = Date.now();
    const inputUrl = request.url;
    let url: URL;
    try {
      url = new URL(inputUrl);
    } catch (cause) {
      throw createHttpClientError({
        code: "invalid_url",
        url: inputUrl,
        message: `Invalid URL: ${inputUrl}`,
        cause,
      });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw createHttpClientError({
        code: "unsupported_protocol",
        url: inputUrl,
        message: `Unsupported URL protocol for HTTP request: ${url.protocol}`,
      });
    }

    const budgetMs = request.timeoutMs ?? this.#settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const byteLimit =
      request.maxResponseBytes ?? this.#settings.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const pickResolver = this.#settings.capturedUserProxyEnvFallback
      ? resolveWebFetchProxyForRequest
      : resolveProxyForRequest;
    const proxyTarget = pickResolver(url, {
      env: this.#settings.env,
      httpProxy: this.#settings.proxyUrl,
      noProxy: this.#settings.noProxy,
    });
    const resolver =
      request.egressPolicy === "public"
        ? (this.#settings.dnsLookup ?? defaultPublicDnsLookup())
        : undefined;
    const ca = this.#certificates();
    const viaProxy = proxyTarget.proxyUrl !== undefined;
    const egressInfo: HttpClientEgressInfo = {
      proxied: viaProxy,
      proxySource: proxyTarget.proxySource,
      proxyHost: proxyHost(proxyTarget.proxyUrl),
      noProxyMatched: proxyTarget.noProxyMatched || undefined,
      customCa: ca !== undefined,
    };
    const finalUrl = url.toString();
    const abortGate = new AbortController();
    const upstreamSignal = settings.signal;
    const abortFromParent = () => abortGate.abort(upstreamSignal?.reason);
    let linkedListener = false;
    if (upstreamSignal?.aborted) abortFromParent();
    else if (upstreamSignal) {
      upstreamSignal.addEventListener("abort", abortFromParent, { once: true });
      linkedListener = true;
    }
    let expired = false;
    const deadlineTimer =
      budgetMs > 0
        ? setTimeout(() => {
            expired = true;
            abortGate.abort(new Error(`HTTP request timed out after ${budgetMs}ms`));
          }, budgetMs)
        : undefined;

    try {
      if (resolver) {
        if (viaProxy) {
          throw createHttpClientError({
            code: "egress_blocked",
            url: finalUrl,
            message:
              "HTTP public egress cannot use a proxy because proxy-side DNS resolution cannot be verified",
          });
        }
        await assertPublicEgressDestination(url, resolver, { signal: abortGate.signal });
      }

      // public 预检可能等待；请求正文和头等字段必须在此后读取，不能提前冻结。
      const headers = new Headers(request.headers);
      const traceId = request.trace?.traceId;
      if (traceId && !headers.has("x-knorvia-trace-id")) headers.set("x-knorvia-trace-id", traceId);
      const body = request.body ? Buffer.from(request.body) : undefined;
      const method = request.method ?? "GET";
      const useNode =
        viaProxy || resolver !== undefined || (url.protocol === "https:" && ca !== undefined);
      const reply = useNode
        ? await exchangeWithNode({
            url,
            method,
            headers,
            body,
            signal: abortGate.signal,
            proxyUrl: proxyTarget.proxyUrl,
            ca,
            lookup: resolver
              ? createPublicEgressLookup(finalUrl, resolver, { signal: abortGate.signal })
              : undefined,
          })
        : await fetch(finalUrl, {
            method,
            headers,
            body,
            redirect: request.redirect ?? "manual",
            signal: abortGate.signal,
          });
      const responseUrl = reply.url || finalUrl;
      const bytes = await readResponseBody(reply, byteLimit, abortGate.signal, responseUrl);
      const responseHeaders: Record<string, string> = {};
      reply.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        url: responseUrl,
        status: reply.status,
        statusText: reply.statusText,
        headers: responseHeaders,
        body: bytes,
        bytes: bytes.byteLength,
        durationMs: Math.max(0, Date.now() - start),
        egress: egressInfo,
      };
    } catch (cause) {
      throw normalizeFailure(cause, finalUrl, abortGate.signal, expired, viaProxy);
    } finally {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (linkedListener) upstreamSignal?.removeEventListener("abort", abortFromParent);
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
