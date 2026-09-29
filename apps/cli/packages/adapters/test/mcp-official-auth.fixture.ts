// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import type { Logger, OfficialMcpAuthHeadersResult } from "@knorvia/contracts";
import type * as Shared from "@knorvia/shared";
import type * as Auth from "../src/mcp/official-auth.js";

export const targetUrls = {
  entry: new URL("../src/mcp/official-auth.ts", import.meta.url),
  companions: {
    "./official-auth-response.js": new URL("../src/mcp/official-auth-response.ts", import.meta.url),
  } as Record<string, URL>,
  esbuild: new URL(import.meta.resolve("esbuild")),
};
export type FetchInput = Parameters<typeof Auth.createOfficialMcpAuthFetch>[0];
export type ResponseInfo = Auth.OfficialMcpServerResponseInfo;
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("owned gate expired: " + label)), 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection");
}
export const rpc = (method = "initialize", id: string | number = 0) =>
  JSON.stringify({
    id,
    method,
    params: { name: "owned-tool", _meta: { trace_id: "trace", span_id: "span" } },
  });
export const jsonResponse = (value: unknown, status = 200, headers?: HeadersInit) => {
  const all = new Headers(headers);
  all.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { status, headers: all });
};
export interface ReaderControl {
  reads: number;
  cancels: number;
  releases: number;
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel(): Promise<void>;
  releaseLock(): void;
}
export function ownedResponse(status = 200, headers?: HeadersInit, chunks: Uint8Array[] = []) {
  const trace: string[] = [];
  const reader: ReaderControl = {
    reads: 0,
    cancels: 0,
    releases: 0,
    async read() {
      assert.equal(this, reader);
      trace.push("read");
      const value = chunks[this.reads++];
      return value === undefined ? { done: true, value: undefined } : { done: false, value };
    },
    async cancel() {
      assert.equal(this, reader);
      trace.push("reader.cancel");
      this.cancels++;
    },
    releaseLock() {
      assert.equal(this, reader);
      trace.push("reader.release");
      this.releases++;
    },
  };
  const body = {
    async cancel() {
      assert.equal(this, body);
      trace.push("body.cancel");
    },
  };
  const response = {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body,
    clone() {
      assert.equal(this, response);
      trace.push("clone");
      return {
        body: {
          getReader() {
            trace.push("getReader");
            return reader;
          },
        },
      };
    },
  };
  return { response: response as unknown as Response, reader, body, trace };
}

export async function fixture() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
  };
  const responses: Response[] = [new Response(null, { status: 200 })];
  let authResult: OfficialMcpAuthHeadersResult = {
    ok: true,
    headers: { Authorization: "owned-token" },
  };
  let time = 1000;
  const clock = {
    now() {
      record("clock");
      const value = time;
      time += 7;
      return value;
    },
  };
  class OwnedDate extends Date {
    static override now() {
      return clock.now();
    }
  }
  const reserved = new Set(["x-owned-reserved", "mcp-session-id", "mcp-protocol-version"]);
  const reservedMatches = ["owned-result"];
  const identity = { credentialPresent: true } as Record<string, unknown>;
  const shared: Pick<
    typeof Shared,
    | "findOfficialMcpReservedHeaders"
    | "isOfficialMcpReservedHeaderName"
    | "summarizeOfficialMcpIdentityHeaders"
  > = {
    findOfficialMcpReservedHeaders(headers) {
      record("shared.find", headers);
      return reservedMatches;
    },
    isOfficialMcpReservedHeaderName(name) {
      record("shared.reserved", name);
      return reserved.has(name);
    },
    summarizeOfficialMcpIdentityHeaders(headers) {
      record("shared.summary", headers);
      return identity;
    },
  };
  const logger: Logger = {
    debug(message, context) {
      assert.equal(this, logger);
      record("debug", message, context);
    },
    info(message, context) {
      assert.equal(this, logger);
      record("info", message, context);
    },
    warn(message, context) {
      assert.equal(this, logger);
      record("warn", message, context);
    },
    error(message, error, context) {
      assert.equal(this, logger);
      record("error", message, error, context);
    },
    child() {
      assert.fail("official auth must not create a child logger");
    },
  };
  const registry: FetchInput["trustedOrigins"] = {
    async isTrusted(value) {
      assert.equal(this, registry);
      record("trust", value);
      return { trusted: true };
    },
  };
  const port: NonNullable<FetchInput["authHeadersPort"]> = {
    async resolveHeaders(value) {
      assert.equal(this, port);
      record("resolve", value);
      return authResult;
    },
  };
  const input: FetchInput = {
    authHeadersPort: port,
    async baseFetch(resource, init) {
      assert.equal(this, input);
      record("fetch", resource, init);
      const response = responses.shift();
      assert.ok(response, "only the explicitly supplied response attempts may be sent");
      return response;
    },
    logger,
    onAuthFailure(kind) {
      assert.equal(this, input);
      record("authFailure", kind);
    },
    onServerResponse(info) {
      assert.equal(this, input);
      record("serverResponse", info);
    },
    official: { source: "plugin", pluginId: "owned.plugin", mcpKey: "owned-key" },
    serverName: "owned-server",
    trustedOrigins: registry,
    url: "https://owned.example/mcp",
  };
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const code = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  for (const [specifier, url] of [
    ["$entry", targetUrls.entry] as const,
    ...Object.entries(targetUrls.companions),
  ]) {
    const source = await readFile(url, "utf8");
    code.set(
      specifier,
      (
        await transform(source, {
          loader: "ts",
          format: "cjs",
          target: "node24",
          sourcefile: fileURLToPath(url),
        })
      ).code,
    );
  }
  const requireOwned = (specifier: string): unknown => {
    if (specifier === "@knorvia/shared") return shared;
    if (specifier === "node:buffer") return { Buffer };
    const cached = modules.get(specifier);
    if (cached) return cached.exports;
    const body = code.get(specifier);
    assert.ok(body, "unapproved dependency " + specifier);
    const module = { exports: {} as Record<string, unknown> };
    modules.set(specifier, module);
    const forbidden = () => {
      throw new Error("unexpected product timer or fetch");
    };
    const globals = Object.freeze({
      URL,
      Request,
      Headers,
      Response,
      TextDecoder,
      Buffer,
      Date: OwnedDate,
      Uint8Array,
      AbortSignal,
      fetch: forbidden,
      setTimeout: forbidden,
      clearTimeout: forbidden,
      process: Object.freeze({}),
    });
    new Function(
      "require",
      "module",
      "exports",
      "Date",
      "Buffer",
      "URL",
      "Request",
      "Headers",
      "Response",
      "TextDecoder",
      "Uint8Array",
      "fetch",
      "setTimeout",
      "clearTimeout",
      "process",
      "globalThis",
      "global",
      body,
    )(
      requireOwned,
      module,
      module.exports,
      OwnedDate,
      Buffer,
      URL,
      Request,
      Headers,
      Response,
      TextDecoder,
      Uint8Array,
      forbidden,
      forbidden,
      forbidden,
      globals.process,
      globals,
      globals,
    );
    return module.exports;
  };
  const api = requireOwned("$entry") as typeof Auth;
  return {
    api,
    input,
    port,
    registry,
    shared,
    logger,
    reserved,
    reservedMatches,
    identity,
    calls,
    record,
    clock,
    create: () => api.createOfficialMcpAuthFetch(input),
    respond(...values: Response[]) {
      responses.splice(0, responses.length, ...values);
    },
    get authResult() {
      return authResult;
    },
    set authResult(value: OfficialMcpAuthHeadersResult) {
      authResult = value;
    },
    count: (name: string) => calls.filter((call) => call.name === name).length,
    names: () => calls.map((call) => call.name),
    event(name: string, occurrence = 0) {
      const event = calls.filter((call) => call.name === name)[occurrence];
      assert.ok(event, name + " #" + occurrence + " exists");
      return event.args;
    },
    log(message: string, occurrence = 0) {
      const event = calls.filter((call) => call.args[0] === message)[occurrence];
      assert.ok(event, "log exists: " + message);
      return event.args[1] as Record<string, unknown>;
    },
    sent(occurrence = 0) {
      const event = calls.filter((call) => call.name === "fetch")[occurrence];
      assert.ok(event, "fetch exists");
      return { resource: event.args[0], init: event.args[1] as RequestInit };
    },
  };
}
