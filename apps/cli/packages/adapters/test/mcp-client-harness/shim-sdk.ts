// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const sdkSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const retainedKey = Symbol.for("knorvia.mcp.independent.retained-exports");
const seams = () => {
  const value = globalThis[key];
  if (!value) throw new Error("MCP test seams are not installed");
  return value;
};
const retained = globalThis[retainedKey] ??= {};

export class ProtocolError extends Error {
  constructor(message = "protocol error", code = -32000) {
    super(message);
    this.code = code;
  }
}

export class UnsupportedProtocolVersionError extends ProtocolError {
  static isInstance(value) {
    return value instanceof UnsupportedProtocolVersionError;
  }
}

export const SdkErrorCode = { EraNegotiationFailed: "ERA_NEGOTIATION_FAILED" };

export class SdkError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
  static isInstance(value) {
    return value instanceof SdkError;
  }
}

export class ClientCredentialsProvider {
  constructor(options) {
    this.options = options;
    seams().invoke("sdk.clientCredentials.construct", this, [options]);
  }
}

class BaseTransport {
  constructor(kind, url, options) {
    this.kind = kind;
    this.url = url;
    this.options = options;
  }
  close() {
    return Promise.resolve(seams().invoke("sdk.transport.close", this, []));
  }
}

export class SSEClientTransport extends BaseTransport {
  constructor(url, options) {
    super("sse", url, options);
    seams().invoke("sdk.sse.construct", this, [url, options]);
  }
}

export class StreamableHTTPClientTransport extends BaseTransport {
  constructor(url, options) {
    super("http", url, options);
    seams().invoke("sdk.http.construct", this, [url, options]);
  }
}

export class Client {
  constructor(info, options) {
    this.info = info;
    this.options = options;
    seams().invoke("sdk.client.construct", this, [info, options]);
  }
  connect(...args) {
    return Promise.resolve(seams().invoke("sdk.client.connect", this, args));
  }
  listTools(...args) {
    return Promise.resolve(seams().invoke("sdk.client.listTools", this, args, { tools: [] }));
  }
  callTool(...args) {
    return Promise.resolve(seams().invoke("sdk.client.callTool", this, args, { content: [] }));
  }
  ping(...args) {
    return Promise.resolve(seams().invoke("sdk.client.ping", this, args, {}));
  }
  close(...args) {
    return Promise.resolve(seams().invoke("sdk.client.close", this, args));
  }
  getProtocolEra() {
    return seams().invoke("sdk.client.getProtocolEra", this, [], seams().getValue("sdk.protocolEra", "legacy"));
  }
  getNegotiatedProtocolVersion() {
    return seams().invoke(
      "sdk.client.getNegotiatedProtocolVersion",
      this,
      [],
      seams().getValue("sdk.protocolVersion", "2025-06-18"),
    );
  }
}

export function computeScopeUnion(...scopes) {
  return seams().invoke(
    "sdk.computeScopeUnion",
    undefined,
    scopes,
    () => [...new Set(scopes.flatMap((scope) => (scope ? scope.split(/\s+/) : [])))].join(" ") || undefined,
  );
}

retained.ProtocolError = ProtocolError;
retained.UnsupportedProtocolVersionError = UnsupportedProtocolVersionError;
retained.SdkError = SdkError;
retained.SdkErrorCode = SdkErrorCode;
`;

export const sdkStdioSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const seams = () => {
  const value = globalThis[key];
  if (!value) throw new Error("MCP test seams are not installed");
  return value;
};

export class StdioClientTransport {
  constructor(parameters) {
    this.parameters = parameters;
    this.stderr = seams().getValue("stdio.stderr", null);
    this.pid = seams().getValue("stdio.pid", null);
    seams().invoke("sdk.stdio.construct", this, [parameters]);
  }
  close() {
    return Promise.resolve(seams().invoke("sdk.transport.close", this, []));
  }
}
`;

export const cryptoSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function randomUUID() {
  const seams = globalThis[key];
  if (!seams) throw new Error("MCP test seams are not installed");
  return seams.invoke("crypto.randomUUID", undefined, [], seams.getValue("uuid", "00000000-0000-4000-8000-000000000001"));
}
`;

export const timersSource = String.raw`
export const setTimeout = (...args) => globalThis.setTimeout(...args);
export const clearTimeout = (...args) => globalThis.clearTimeout(...args);
`;
