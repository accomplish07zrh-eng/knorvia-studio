// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// HTTP Client Port —— 网络出站的边界契约
// ════════════════════════════════════════════════════════════
// 业务模块不直接调 fetch，出站请求统一从这个端口走，超时、重定向、体积上限、代理与证书处理都由
// 实现侧集中承担。所以本文件只写请求参数、响应读数与失败形态，不涉及任何传输实现细节。

// 所有权：端口实现决定请求最终怎么出去、经过哪些出口；调用方只表达目的地址与限额，出口事实通过响应
// 里的 egress 读回。失败对象由实现侧抛出，调用方按错误码分流。

// 章节：一 失败语汇 · 二 请求参数 · 三 响应读数 · 四 端口本体

import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";

// ── 一、失败语汇：失败了怎么表达 ─────────────────────────────────────

/** 出站失败的原因分类：调用方按码分流即可，不要拿 message 文本做判断。 */
export type HttpClientErrorCode =
  | "invalid_url"
  | "unsupported_protocol"
  | "timeout"
  | "cancelled"
  | "too_large"
  | "egress_blocked"
  | "network_error"
  | "proxy_error";

/** 构造端口错误所需的素材：url 与 status 能确定时才填。 */
export interface HttpClientErrorDetails {
  code: HttpClientErrorCode;
  url?: string;
  status?: number;
  message: string;
  cause?: unknown;
}

/** 端口错误的统一载体，由实现侧抛出。除 message 外还带稳定错误码、失败地址与（若已有）HTTP 状态码； 判别请用 isHttpClientPortError。 */
export class HttpClientPortError extends Error {
  readonly code: HttpClientErrorCode;
  readonly url?: string;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(details: HttpClientErrorDetails) {
    super(details.message);
    this.name = "HttpClientPortError";
    this.code = details.code;
    this.url = details.url;
    this.status = details.status;
    this.cause = details.cause;
  }
}

/** 判别谓词查表用的构造器形状，仅在本文件内使用。 */
type HttpClientPortErrorConstructor = new (details: HttpClientErrorDetails) => HttpClientPortError;

/** 端口错误的类型表：判别只沿原型链比对表里的构造器，不嗅探 code 或 url 字段，否则形状相近的普通 对象也会被误认成端口错误。 */
const HTTP_CLIENT_PORT_ERROR_TYPES: readonly HttpClientPortErrorConstructor[] = [
  HttpClientPortError,
];

/** 按给定素材构造一个端口错误。 */
export function createHttpClientError(details: HttpClientErrorDetails): HttpClientPortError {
  return new HttpClientPortError(details);
}

/** 判断某个抛出物是否来自本端口。 */
export function isHttpClientPortError(error: unknown): error is HttpClientPortError {
  return HTTP_CLIENT_PORT_ERROR_TYPES.some((ctor) => error instanceof ctor);
}

// ── 二、请求参数：这次请求怎么发 ─────────────────────────────────────

/** 本端口支持的请求方法集合。 */
export type HttpClientMethod = "GET" | "HEAD" | "POST";

/** 重定向处理方式：交给实现自动跟随，还是把跳转原样交回调用方。 */
export type HttpClientRedirectPolicy = "manual" | "follow";

/** 出口策略；当前只定义了公网出口这一档。 */
export type HttpClientEgressPolicy = "public";

/** 一次出站请求的完整入参，由调用方拥有：请求体只接受字节序列、编码问题在调用方一侧解决， 响应体积由 maxResponseBytes 约束。 */
export interface HttpClientRequest {
  url: string;
  method?: HttpClientMethod;
  headers?: Record<string, string>;
  body?: Uint8Array;
  timeoutMs?: number;
  maxResponseBytes?: number;
  redirect?: HttpClientRedirectPolicy;
  egressPolicy?: HttpClientEgressPolicy;
  trace?: TraceContext;
}

// ── 三、响应读数：回来的东西长什么样 ─────────────────────────────────

/** 响应体已经完整读进内存的结果：bytes 与 body.byteLength 是同一份事实的两种读法，durationMs 覆盖 从发起到读完的整段时间。 */
export interface HttpClientResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Uint8Array;
  bytes: number;
  durationMs: number;
  egress?: HttpClientEgressInfo;
}

/** 这次请求实际是怎么出去的。它由实现侧填写，用来解释「为什么走 / 没走代理」以及是否用了自定义 CA， 不参与传输决策。 */
export interface HttpClientEgressInfo {
  proxied: boolean;
  proxySource?: string;
  proxyHost?: string;
  noProxyMatched?: boolean;
  customCa?: boolean;
}

// ── 四、端口本体：调用选项与唯一方法 ─────────────────────────────────

/** 调用侧的运行时开关：取消信号与 trace 上下文，不进入请求本身的语义。 */
export interface HttpClientRunOptions {
  signal?: AbortSignal;
  context?: ExecutionContext;
}

/** 出站请求端口的完整能力面。只有一条方法：调用方交出一份请求，实现负责传输、限额与错误归一化， 最终返回响应或 HttpClientPortError。 */
export interface HttpClientPort {
  request(request: HttpClientRequest, options?: HttpClientRunOptions): Promise<HttpClientResponse>;
}
