// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export class HttpClientPortError extends Error {
  constructor(details, options) {
    super(details?.message ?? String(details?.code ?? "HTTP client error"), options);
    this.name = "HttpClientPortError";
    this.code = details?.code;
    this.details = details;
  }
}

export function createHttpClientError(details, options) {
  return new HttpClientPortError(details, options);
}

export function isHttpClientPortError(value) {
  return value instanceof HttpClientPortError;
}
