// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import * as http from "node:http";
import * as https from "node:https";
import { Readable } from "node:stream";
import { ProxyAgent } from "proxy-agent";

const NO_BODY_STATUSES = new Set([204, 205, 304]);

interface NodeExchange {
  url: URL;
  method: string;
  headers: Headers;
  body?: Buffer;
  signal: AbortSignal;
  proxyUrl?: string;
  ca?: Buffer;
  lookup?: NonNullable<http.RequestOptions["lookup"]>;
}

function releaseMessage(message: http.IncomingMessage): void {
  // 未交接的消息必须释放；destroy 的晚到错误不能成为全局异常或覆盖转换首因。
  try {
    message.on("error", () => {});
  } catch {
    // 结构化边界故障也不能阻止下一步尽力释放或覆盖首因。
  }
  try {
    message.destroy();
  } catch {
    // 释放失败不替换已经选定的转换结果。
  }
}

export function exchangeWithNode(input: NodeExchange): Promise<Response> {
  const secure = input.url.protocol === "https:";
  const proxy = input.proxyUrl;
  let agent: http.Agent | undefined;
  if (proxy !== undefined) {
    agent = new ProxyAgent({
      ca: input.ca,
      getProxyForUrl: () => proxy,
      httpsAgent: input.ca ? new https.Agent({ ca: input.ca }) : undefined,
    });
  } else if (secure && input.ca) {
    agent = new https.Agent({ ca: input.ca });
  }

  const outgoing: Record<string, string> = {};
  input.headers.forEach((value, key) => {
    outgoing[key] = value;
  });
  const noBodyMethod = input.method.toUpperCase() === "HEAD";
  const send = secure ? https.request : http.request;

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const request = send(
      {
        hostname: input.url.hostname,
        protocol: input.url.protocol,
        port: input.url.port || undefined,
        path: input.url.pathname + input.url.search,
        method: input.method,
        headers: outgoing,
        signal: input.signal,
        agent,
        lookup: proxy === undefined ? input.lookup : undefined,
      },
      (message) => {
        if (settled) {
          releaseMessage(message);
          return;
        }
        try {
          const headers = new Headers();
          for (const [name, value] of Object.entries(message.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) headers.append(name, item);
            } else if (value !== undefined) {
              headers.set(name, String(value));
            }
          }
          const status = message.statusCode ?? 502;
          const noBody = noBodyMethod || NO_BODY_STATUSES.has(status);
          const response = new Response(
            noBody ? null : (Readable.toWeb(message) as ReadableStream<Uint8Array>),
            { status, statusText: message.statusMessage, headers },
          );
          settled = true;
          // 原异步回调中的 Response 异常会逃出 Promise；空状态也不能强塞 stream。
          if (noBody) releaseMessage(message);
          resolve(response);
        } catch (cause) {
          settled = true;
          releaseMessage(message);
          reject(cause);
        }
      },
    );
    request.on("error", (cause) => {
      if (settled) return;
      settled = true;
      reject(cause);
    });
    request.end(input.body);
  });
}
