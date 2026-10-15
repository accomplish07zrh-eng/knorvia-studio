// SPDX-License-Identifier: Apache-2.0
// HTTP 调用的错误类型与客户端接口面（B12）。

/** 单次请求的超时预算，由执行层消费。 */
export type ApiRequestInit = RequestInit & {
  timeoutMs?: /* 超时预算毫秒 */ number;
};

/** 各环境 HTTP 执行层的最小接口。 */
export type ApiClient = {
  request(
    target: /* 字符串或 URL 形式的目标 */ string | URL,
    init?: /* 请求扩展；超时预算在这里 */ ApiRequestInit,
  ): Promise<Response>;
};

/** 构造 ApiError 的上下文：消息、URL、方法、状态、响应头与底层原因。 */
export type ApiErrorOptions = {
  message: /* 已按调用方语义组织好的可读消息 */ string;
  url: /* 请求目标 URL 原文 */ string;
  method?: /* HTTP 方法；缺席按 GET 处理 */ string;
  status?: /* HTTP 状态码；网络层失败时缺席 */ number;
  responseHeaders?: /* 响应头快照 */ Record<string, string>;
  cause?: /* 底层原因对象，透传给 Error 的 cause */ unknown;
};

export class ApiError extends Error {
  readonly url!: string;
  readonly method!: string;
  readonly status?: /* HTTP 状态码；网络层失败时缺席 */ number;
  readonly responseHeaders?: /* 响应头快照 */ Record<string, string>;

  constructor(details: ApiErrorOptions) {
    const causeOption = details.cause === undefined ? undefined : { cause: details.cause };
    super(details.message, causeOption);
    const { url, method, status, responseHeaders } = details;
    Object.assign(this, {
      name: "ApiError",
      url,
      method: (method ?? "GET").toUpperCase(),
      status,
      responseHeaders,
    });
  }
}
