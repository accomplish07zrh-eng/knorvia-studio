// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import http from "node:http";
import https from "node:https";
import { EventEmitter, getEventListeners } from "node:events";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setImmediate } from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import { HttpClientPortError, createHttpClientError } from "@knorvia/contracts";
type Module = typeof import("../src/http/index.js");
export const target = new URL("../src/http/index.js", import.meta.url).href;
assert.ok(target);
// 合成夹具默认拒绝真实网络；同步 Node 的命名导出，让不同合法导入形式经过同一边界。
http.request = () => {
  throw new Error("No owned HTTP fixture installed");
};
https.request = () => {
  throw new Error("No owned HTTPS fixture installed");
};
globalThis.fetch = async () => {
  throw new Error("No owned fetch fixture installed");
};
syncBuiltinESMExports();
export const api = (await import(target)) as Module;
export type Request = Parameters<InstanceType<Module["NodeHttpClientAdapter"]>["request"]>[0];
export const options = { env: {}, timeoutMs: 0 };
export const url = "https://target.invalid/resource";
export const turn = setImmediate;
export { getEventListeners, createHttpClientError };
export async function rejected(promise: Promise<unknown>): Promise<unknown> {
  const outcome = await promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok);
  return outcome.error;
}
export function portError(error: unknown, code: string, expectedUrl = url): HttpClientPortError {
  assert.ok(error instanceof HttpClientPortError);
  assert.equal(error.name, "HttpClientPortError");
  assert.equal(error.code, code);
  assert.equal(error.url, expectedUrl);
  return error;
}
export async function completedBeforeCleanup<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const abort = new AbortController();
  const state: { result?: { ok: true; value: T } | { ok: false; error: unknown } } = {};
  const observed = operation(abort.signal).then(
    (value) => {
      state.result = { ok: true, value };
    },
    (error) => {
      state.result = { ok: false, error };
    },
  );
  await setImmediate();
  const before = state.result;
  // 原生事件已投递后先保存旧版状态，再只解除测试自有等待；不将清理记成产品完成。
  abort.abort(new Error("owned probe cleanup"));
  await observed;
  assert.ok(before, "must complete without waiting for a nonexistent body");
  assert.ok(before.ok, before.ok ? undefined : String(before.error));
  return before.value;
}
export function fetchWith(t: TestContext, implementation: typeof fetch) {
  return t.mock.method(globalThis, "fetch", implementation);
}
export function timers(t: TestContext) {
  const callbacks: Array<() => void> = [],
    delays: unknown[] = [],
    cleared: unknown[] = [];
  t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: unknown) => {
    callbacks.push(callback);
    delays.push(delay);
    return { fixture: callbacks.length };
  }) as unknown as typeof setTimeout);
  t.mock.method(globalThis, "clearTimeout", ((timer: unknown) => {
    cleared.push(timer);
  }) as typeof clearTimeout);
  return { callbacks, delays, cleared };
}
export interface NodeFixtureOptions {
  protocol?: "http" | "https";
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[] | number | undefined>;
  body?: string;
  stall?: boolean;
  beforeResponse?: () => void;
  alterMessage?: (
    message: Readable & {
      headers: Record<string, unknown>;
      statusCode?: number;
      statusMessage?: string;
    },
  ) => void;
  requestError?: unknown;
  hasRequestError?: boolean;
}
export function nodeWith(t: TestContext, config: NodeFixtureOptions = {}) {
  let reads = 0,
    endedBody: unknown,
    destroyCount = 0;
  const escaped: unknown[] = [],
    requests: http.RequestOptions[] = [];
  const message = Object.assign(
    new Readable({
      read() {
        reads++;
        if (!config.stall) {
          this.push(config.body ?? "owned bytes");
          this.push(null);
        }
      },
    }),
    {
      headers: config.headers ?? { "content-type": "text/plain", "x-owned": "yes" },
      statusCode: config.status ?? 200,
      statusMessage: config.statusText ?? "OK",
    },
  );
  config.alterMessage?.(message);
  const nativeDestroy = message.destroy.bind(message);
  t.mock.method(message, "destroy", (error?: Error) => {
    destroyCount++;
    return nativeDestroy(error);
  });
  const module = config.protocol === "https" ? https : http;
  t.mock.method(module, "request", ((
    requestOptions: http.RequestOptions,
    callback: (message: http.IncomingMessage) => void,
  ) => {
    requests.push(requestOptions);
    const request = Object.assign(new EventEmitter(), {
      method: String(requestOptions.method ?? "GET").toUpperCase(),
      end(body: unknown) {
        endedBody = body;
        queueMicrotask(() => {
          if (config.hasRequestError) {
            request.emit("error", config.requestError);
            return;
          }
          config.beforeResponse?.();
          try {
            callback(message as unknown as http.IncomingMessage);
          } catch (error) {
            escaped.push(error);
            nativeDestroy();
            request.emit("error", error);
          }
        });
        return request;
      },
    });
    return request;
  }) as typeof http.request);
  t.after(() => {
    nativeDestroy();
    for (const request of requests)
      if (request.agent && typeof request.agent === "object") request.agent.destroy();
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return {
    message,
    requests,
    escaped,
    get endedBody() {
      return endedBody;
    },
    get reads() {
      return reads;
    },
    get destroyCount() {
      return destroyCount;
    },
  };
}
export async function nativeProbe(mode: string) {
  assert.ok(target);
  const output: Buffer[] = [],
    errors: Buffer[] = [];
  const child = spawn(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("./http-transport-native-child.ts", import.meta.url)),
      target,
      mode,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (bytes) => output.push(bytes));
  child.stderr.on("data", (bytes) => errors.push(bytes));
  const ended = await new Promise<{ code: number | null; signal: string | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    },
  );
  assert.equal(ended.code, 0, Buffer.concat(errors).toString());
  assert.equal(ended.signal, null);
  return JSON.parse(Buffer.concat(output).toString()) as {
    terminal: {
      state: string;
      status?: number;
      bytes?: number;
      code?: string;
      message?: string;
      body?: string;
      headers?: Record<string, string>;
    };
    escaped: Array<{ name: string; message: string }>;
    observed: Array<{ method: string; url: string; trace?: string }>;
  };
}
