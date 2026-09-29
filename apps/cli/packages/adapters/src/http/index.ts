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

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10_485_760;

export interface NodeHttpClientAdapterOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  proxyUrl?: string;
  noProxy?: string;
  caCertFile?: string;
  dnsLookup?: DnsLookup;
  capturedUserProxyEnvFallback?: boolean;
}

function proxyHost(proxy: string | undefined): string | undefined {
  if (proxy === undefined) return undefined;
  try {
    const url = new URL(proxy);
    return url.hostname + (url.port ? `:${url.port}` : "");
  } catch {
    return undefined;
  }
}

function normalizeFailure(
  cause: unknown,
  url: string,
  signal: AbortSignal,
  timedOut: boolean,
  proxied: boolean,
): unknown {
  if (isHttpClientPortError(cause)) return cause;
  let code: HttpClientErrorCode;
  let message: string;
  if (timedOut) {
    code = "timeout";
    message = cause instanceof Error ? cause.message : "HTTP request timed out";
  } else if (signal.aborted) {
    code = "cancelled";
    message = cause instanceof Error ? cause.message : "HTTP request was cancelled";
  } else if (cause instanceof DOMException && cause.name === "AbortError") {
    code = "cancelled";
    message = "HTTP request was cancelled";
  } else {
    code = proxied ? "proxy_error" : "network_error";
    message = cause instanceof Error ? cause.message : "HTTP request failed";
  }
  return createHttpClientError({ code, url, message, cause });
}

export class NodeHttpClientAdapter implements HttpClientPort {
  readonly #options: NodeHttpClientAdapterOptions;
  #caLoaded = false;
  #ca: Buffer | undefined;

  constructor(options: NodeHttpClientAdapterOptions = {}) {
    this.#options = options;
  }

  #certificates(): Buffer | undefined {
    if (!this.#caLoaded) {
      const ca = loadTlsCaCertificates({
        caCertFile: this.#options.caCertFile,
        env: this.#options.env,
      });
      this.#ca = ca;
      this.#caLoaded = true;
    }
    return this.#ca;
  }

  async request(
    request: HttpClientRequest,
    options: HttpClientRunOptions = {},
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

    const timeout = request.timeoutMs ?? this.#options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes =
      request.maxResponseBytes ?? this.#options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const resolveProxy = this.#options.capturedUserProxyEnvFallback
      ? resolveWebFetchProxyForRequest
      : resolveProxyForRequest;
    const proxy = resolveProxy(url, {
      env: this.#options.env,
      httpProxy: this.#options.proxyUrl,
      noProxy: this.#options.noProxy,
    });
    const dns =
      request.egressPolicy === "public"
        ? (this.#options.dnsLookup ?? defaultPublicDnsLookup())
        : undefined;
    const ca = this.#certificates();
    const proxied = proxy.proxyUrl !== undefined;
    const egress: HttpClientEgressInfo = {
      proxied,
      proxySource: proxy.proxySource,
      proxyHost: proxyHost(proxy.proxyUrl),
      noProxyMatched: proxy.noProxyMatched || undefined,
      customCa: ca !== undefined,
    };
    const normalizedUrl = url.toString();
    const controller = new AbortController();
    const parent = options.signal;
    const abortFromParent = () => controller.abort(parent?.reason);
    let linked = false;
    if (parent?.aborted) abortFromParent();
    else if (parent) {
      parent.addEventListener("abort", abortFromParent, { once: true });
      linked = true;
    }
    let timedOut = false;
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort(new Error(`HTTP request timed out after ${timeout}ms`));
          }, timeout)
        : undefined;

    try {
      if (dns) {
        if (proxied) {
          throw createHttpClientError({
            code: "egress_blocked",
            url: normalizedUrl,
            message:
              "HTTP public egress cannot use a proxy because proxy-side DNS resolution cannot be verified",
          });
        }
        await assertPublicEgressDestination(url, dns, { signal: controller.signal });
      }

      // public 预检可能等待；请求正文和头等字段必须在此后读取，不能提前冻结。
      const headers = new Headers(request.headers);
      const traceId = request.trace?.traceId;
      if (traceId && !headers.has("x-knorvia-trace-id")) headers.set("x-knorvia-trace-id", traceId);
      const body = request.body ? Buffer.from(request.body) : undefined;
      const method = request.method ?? "GET";
      const useNode =
        proxied || dns !== undefined || (url.protocol === "https:" && ca !== undefined);
      const response = useNode
        ? await exchangeWithNode({
            url,
            method,
            headers,
            body,
            signal: controller.signal,
            proxyUrl: proxy.proxyUrl,
            ca,
            lookup: dns
              ? createPublicEgressLookup(normalizedUrl, dns, { signal: controller.signal })
              : undefined,
          })
        : await fetch(normalizedUrl, {
            method,
            headers,
            body,
            redirect: request.redirect ?? "manual",
            signal: controller.signal,
          });
      const responseUrl = response.url || normalizedUrl;
      const bytes = await readResponseBody(response, maxBytes, controller.signal, responseUrl);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        url: responseUrl,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: bytes,
        bytes: bytes.byteLength,
        durationMs: Math.max(0, Date.now() - start),
        egress,
      };
    } catch (cause) {
      throw normalizeFailure(cause, normalizedUrl, controller.signal, timedOut, proxied);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (linked) parent?.removeEventListener("abort", abortFromParent);
    }
  }
}

export function createNodeHttpClientAdapter(
  options: NodeHttpClientAdapterOptions = {},
): HttpClientPort {
  return new NodeHttpClientAdapter(options);
}

export function createNodeWebFetchHttpClientAdapter(
  options: NodeHttpClientAdapterOptions = {},
): HttpClientPort {
  return new NodeHttpClientAdapter({ ...options, capturedUserProxyEnvFallback: true });
}
