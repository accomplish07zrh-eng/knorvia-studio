// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHttpClientError } from "./http-error.mjs";
import { makeError, record, takeScript } from "./state.mjs";

function bodyFromScript(script) {
  if (script.bodyBase64 !== undefined) {
    return Uint8Array.from(Buffer.from(script.bodyBase64, "base64"));
  }
  if (script.bodyText !== undefined) {
    return Uint8Array.from(Buffer.from(script.bodyText, "utf8"));
  }
  if (Array.isArray(script.bodyBytes)) {
    return Uint8Array.from(script.bodyBytes);
  }
  return new Uint8Array();
}

class OwnedHttpPort {
  async request(request, options = {}) {
    record("http.request", {
      request: {
        ...request,
        body: request.body ? { bytes: request.body.byteLength } : undefined,
      },
      signalAborted: options.signal?.aborted === true,
    });
    if (options.signal?.aborted) {
      throw createHttpClientError({ code: "cancelled", message: "Synthetic HTTP cancellation" });
    }
    const script = takeScript("http");
    if (script.error) {
      if (script.error.httpPortCode) {
        throw createHttpClientError({
          code: script.error.httpPortCode,
          message: script.error.message ?? `Synthetic ${script.error.httpPortCode}`,
        });
      }
      throw makeError(script.error, "Synthetic HTTP error");
    }
    const body = bodyFromScript(script);
    return {
      url: script.url ?? request.url,
      status: script.status ?? 200,
      statusText: script.statusText ?? "Synthetic",
      headers: Object.fromEntries(
        Object.entries(script.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          String(value),
        ]),
      ),
      body,
      bytes: script.bytes ?? body.byteLength,
      durationMs: script.durationMs ?? 0,
      egress: script.egress,
    };
  }
}

export class NodeHttpClientAdapter extends OwnedHttpPort {
  constructor(options = {}) {
    super();
    this.options = options;
    record("http.adapter.construct", { options });
  }
}

export function createNodeHttpClientAdapter(options = {}) {
  record("http.createNodeAdapter", { options });
  return new NodeHttpClientAdapter(options);
}

export function createNodeWebFetchHttpClientAdapter(options = {}) {
  record("http.createWebFetchAdapter", { options });
  return new NodeHttpClientAdapter(options);
}
