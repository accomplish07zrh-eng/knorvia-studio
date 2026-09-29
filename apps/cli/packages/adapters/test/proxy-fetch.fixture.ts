// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { setImmediate } from "node:timers/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TestContext } from "node:test";
type Module = typeof import("../src/network/proxy-fetch.js");
export const target = new URL("../src/network/proxy-fetch.js", import.meta.url).href;
http.request = () => {
  throw new Error("no owned HTTP fixture");
};
https.request = () => {
  throw new Error("no owned HTTPS fixture");
};
globalThis.fetch = async () => {
  throw new Error("no owned direct fetch fixture");
};
syncBuiltinESMExports();
export const api = (await import(target)) as Module;
export const options = { env: {}, httpProxy: "http://proxy.invalid:8080" };
export const url = "http://target.invalid/resource?owned=1";
export { getEventListeners };
export type Outcome<T> =
  | { kind: "pending" }
  | { kind: "fulfilled"; value: T }
  | { kind: "rejected"; error: unknown };
export function watch<T>(promise: Promise<T>): () => Outcome<T> {
  let outcome: Outcome<T> = { kind: "pending" };
  void promise.then(
    (value) => {
      outcome = { kind: "fulfilled", value };
    },
    (error) => {
      outcome = { kind: "rejected", error };
    },
  );
  return () => outcome;
}
export async function turns() {
  await setImmediate();
  await setImmediate();
}
export function fulfilled<T>(outcome: Outcome<T>): T {
  assert.equal(outcome.kind, "fulfilled");
  assert.ok(outcome.kind === "fulfilled");
  return outcome.value;
}
export function rejected<T>(outcome: Outcome<T>): unknown {
  assert.equal(outcome.kind, "rejected");
  assert.ok(outcome.kind === "rejected");
  return outcome.error;
}
export function captureRequests(t: TestContext): Request[] {
  const original = globalThis.Request,
    seen: Request[] = [];
  globalThis.Request = new Proxy(original, {
    construct(target, args) {
      const value = Reflect.construct(target, args) as Request;
      seen.push(value);
      return value;
    },
  });
  t.after(() => {
    globalThis.Request = original;
  });
  return seen;
}
export function lastSignal(seen: Request[]): AbortSignal {
  const request = seen.at(-1);
  assert.ok(request);
  return request.signal;
}
export function message(status = 200, body: Buffer | string | null = "owned") {
  const stream = Object.assign(new PassThrough(), {
    headers: {} as http.IncomingHttpHeaders,
    statusCode: status,
    statusMessage: "Owned",
  });
  if (body !== null) stream.end(body);
  return stream;
}
export interface FixtureOptions {
  secure?: boolean;
  auto?: boolean;
  message?: ReturnType<typeof message>;
  setupError?: unknown;
  endError?: unknown;
}
export function nodeFixture(t: TestContext, config: FixtureOptions = {}) {
  const incoming = config.message ?? message();
  const captured: http.RequestOptions[] = [],
    bodies: unknown[] = [],
    destroyed: unknown[] = [],
    escaped: unknown[] = [];
  const request = new EventEmitter();
  let callback: ((message: http.IncomingMessage) => void) | undefined;
  const emit = (event: string, ...args: unknown[]) => {
    try {
      request.emit(event, ...args);
    } catch (error) {
      escaped.push(error);
    }
  };
  const reply = (value = incoming) => {
    assert.ok(callback);
    try {
      callback(value as unknown as http.IncomingMessage);
    } catch (error) {
      escaped.push(error);
    }
  };
  const client = Object.assign(request, {
    end(body?: Buffer) {
      bodies.push(body);
      if ("endError" in config) throw config.endError;
      if (config.auto !== false) queueMicrotask(() => reply());
      return client;
    },
    destroy(error?: Error) {
      destroyed.push(error);
      queueMicrotask(() => {
        if (error !== undefined) emit("error", error);
        emit("close");
      });
      return client;
    },
  });
  t.mock.method(config.secure ? https : http, "request", ((
    args: http.RequestOptions,
    receive: (message: http.IncomingMessage) => void,
  ) => {
    captured.push(args);
    if ("setupError" in config) throw config.setupError;
    callback = receive;
    return client;
  }) as typeof http.request);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    incoming.destroy();
  });
  return { incoming, request, client, captured, bodies, destroyed, escaped, emit, reply };
}
export async function directory(t: TestContext) {
  const base = resolve(tmpdir()),
    path = await mkdtemp(join(base, "knorvia-proxy-fetch-test-"));
  t.after(async () => {
    const inside = relative(base, resolve(path));
    assert.ok(
      inside.startsWith("knorvia-proxy-fetch-test-") &&
        !inside.startsWith("..") &&
        !isAbsolute(inside),
    );
    await rm(path, { recursive: true, force: true });
  });
  return path;
}
