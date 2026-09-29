// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import * as http from "node:http";
import * as https from "node:https";
import { Readable } from "node:stream";
import { ProxyAgent } from "proxy-agent";

interface PreparedFetch {
  url: URL;
  method: string;
  headers: Headers;
  signal: AbortSignal;
  body?: Buffer;
  proxyUrl?: string;
  ca?: Buffer;
}

const NO_BODY_STATUSES = new Set([204, 205, 304]);

// 被动晚错误监听不能闭包捕获活动owner或signal，handle关闭后仍可安全保留。
function absorbError(): void {}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    /* 清理故障不覆盖已经选定的结果或首因。 */
  }
}

function discardMessage(message: http.IncomingMessage): void {
  attemptCleanup(() => {
    message.on("error", absorbError);
  });
  attemptCleanup(() => {
    message.destroy();
  });
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function openProxyResponse(input: PreparedFetch): Promise<Response> {
  const signal = input.signal;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise<Response>((resolve, reject) => {
    let request: http.ClientRequest | undefined;
    let message: http.IncomingMessage | undefined;
    let pending = true;
    let active = true;
    let listening = false;
    let selectedAbort: Error | undefined;

    function detach(): void {
      active = false;
      if (listening) attemptCleanup(() => signal.removeEventListener("abort", onAbort));
      listening = false;
      const ownedRequest = request;
      if (ownedRequest) {
        attemptCleanup(() => {
          ownedRequest.off("error", onRequestError);
        });
        attemptCleanup(() => {
          ownedRequest.off("response", onResponse);
        });
        attemptCleanup(() => {
          ownedRequest.on("error", absorbError);
        });
        attemptCleanup(() => {
          ownedRequest.on("response", discardMessage);
        });
      }
      const ownedMessage = message;
      if (ownedMessage) {
        attemptCleanup(() => {
          ownedMessage.off("error", onMessageError);
        });
        attemptCleanup(() => {
          ownedMessage.off("close", onMessageClose);
        });
        attemptCleanup(() => {
          ownedMessage.on("error", absorbError);
        });
      }
    }

    function destroyOwned(error?: Error): void {
      const ownedMessage = message;
      const ownedRequest = request;
      message = undefined;
      request = undefined;
      // signal Error 必须先送进已交接的message，再终止request，避免原生包装错误抢先。
      if (ownedMessage)
        attemptCleanup(() => {
          ownedMessage.destroy(error);
        });
      if (ownedRequest)
        attemptCleanup(() => {
          ownedRequest.destroy(error);
        });
    }

    function fail(cause: unknown, streamError?: Error): void {
      if (!active) return;
      const rejectPending = pending;
      pending = false;
      detach();
      destroyOwned(streamError);
      if (rejectPending) reject(cause);
    }

    function onAbort(): void {
      if (!active) return;
      selectedAbort = abortReason(signal);
      fail(selectedAbort, selectedAbort);
    }

    function onRequestError(cause: Error): void {
      fail(cause, cause);
    }
    function onMessageError(cause: Error): void {
      fail(cause, cause);
    }

    function onMessageClose(): void {
      if (!active) return;
      detach();
      message = undefined;
      request = undefined;
    }

    function onResponse(incoming: http.IncomingMessage): void {
      if (!active) {
        discardMessage(incoming);
        return;
      }
      message = incoming;
      try {
        incoming.on("error", absorbError);
        incoming.on("error", onMessageError);
        incoming.once("close", onMessageClose);
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, String(value));
          }
        }
        const status = incoming.statusCode ?? 502;
        const noBody = input.method === "HEAD" || NO_BODY_STATUSES.has(status);
        // 异步callback中的转换异常必须reject本次Promise，不能逃出并留下挂起请求。
        const response = new Response(
          noBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
          { status, statusText: incoming.statusMessage, headers },
        );
        if (!active) return;
        pending = false;
        if (noBody) {
          detach();
          destroyOwned();
        }
        resolve(response);
      } catch (cause) {
        fail(cause);
      }
    }

    try {
      // setup/end/注册均可同步throw；这一边界负责解绑此前建立的signal监听。
      listening = true;
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      if (!active) return;

      const secure = input.url.protocol === "https:";
      const proxy = input.proxyUrl;
      const agent = proxy
        ? new ProxyAgent({
            ca: input.ca,
            getProxyForUrl: () => proxy,
            httpsAgent: input.ca ? new https.Agent({ ca: input.ca }) : undefined,
          })
        : secure
          ? new https.Agent({ ca: input.ca })
          : new http.Agent();
      if (!active) return;
      const headers: Record<string, string> = {};
      input.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const send = secure ? https.request : http.request;
      request = send(
        {
          hostname: input.url.hostname,
          protocol: input.url.protocol,
          port: input.url.port || undefined,
          path: input.url.pathname + input.url.search,
          method: input.method,
          headers,
          agent,
        },
        onResponse,
      );
      request.on("error", absorbError);
      if (!active) {
        detach();
        destroyOwned(selectedAbort);
        return;
      }
      request.on("error", onRequestError);
      request.end(input.body);
    } catch (cause) {
      fail(cause);
    }
  });
}
