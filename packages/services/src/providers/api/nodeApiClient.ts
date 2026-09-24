import { ApiError, type ApiClient, type ApiRequestInit } from "@knorvia/shared";
import { withRequestIdHeader } from "./requestIdHeaders.js";

interface NodeApiClientOptions {
  fetchImpl?: typeof fetch;
}

/** 通用 HTTP 客户端只发送调用方明确指定的请求，不注入产品账号或改写目标地址。 */
export class NodeApiClient implements ApiClient {
  constructor(private readonly options: NodeApiClientOptions = {}) {}

  async request(input: string | URL, init?: ApiRequestInit): Promise<Response> {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const timeoutMs = init?.timeoutMs;
    const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
    let didTimeout = false;
    const timer =
      controller && timeoutMs
        ? setTimeout(() => {
            didTimeout = true;
            controller.abort();
          }, timeoutMs)
        : null;
    try {
      const signal = controller
        ? init?.signal
          ? AbortSignal.any([init.signal, controller.signal])
          : controller.signal
        : init?.signal;
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return await (this.options.fetchImpl ?? globalThis.fetch)(input, {
        ...init,
        headers: withRequestIdHeader(init?.headers),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError({
        message:
          didTimeout && timeoutMs
            ? `Request timed out after ${timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error),
        url,
        method,
        cause: error,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function createNodeApiClient(options: NodeApiClientOptions = {}): ApiClient {
  return new NodeApiClient(options);
}
