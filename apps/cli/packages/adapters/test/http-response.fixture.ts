// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { HttpClientPortError } from "@knorvia/contracts";

type ReaderModule = typeof import("../src/http/response-body.js");
export const { readResponseBody } = (await import("../src/http/response-body.js")) as ReaderModule;
export const url = "https://fixture.invalid/response";
export const status = 206;
export const signal = () => new AbortController().signal;
export { setImmediate as turn };

export type Outcome = { ok: true; bytes: Uint8Array } | { ok: false; error: unknown };
export function observe(pending: Promise<Uint8Array>) {
  const state: { settled: boolean; outcome?: Outcome } = { settled: false };
  const done = pending.then(
    (bytes) => {
      state.outcome = { ok: true, bytes };
      state.settled = true;
    },
    (error) => {
      state.outcome = { ok: false, error };
      state.settled = true;
    },
  );
  return { state, done };
}
export async function rejection(pending: Promise<Uint8Array>) {
  const observation = observe(pending);
  await observation.done;
  const outcome = observation.state.outcome;
  assert.ok(outcome && !outcome.ok, "expected a rejection, including a possible undefined value");
  return outcome.error;
}
export function portError(error: unknown, code: "too_large" | "cancelled", message: string) {
  assert.ok(error instanceof HttpClientPortError, "retained public error identity");
  assert.equal(error.name, "HttpClientPortError");
  assert.equal(error.code, code);
  assert.equal(error.message, message);
  assert.equal(error.url, url);
  assert.equal(error.status, status);
  assert.equal(error.cause, undefined);
}
export function response(body: ReadableStream<Uint8Array> | null, contentLength?: string) {
  return new Response(body, {
    status,
    headers: contentLength === undefined ? {} : { "content-length": contentLength },
  });
}
export function closed(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
export function open(cancel: (reason: unknown) => void | Promise<void> = () => undefined) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const entered = Promise.withResolvers<void>();
  const calls: unknown[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    pull() {
      entered.resolve();
    },
    cancel(reason) {
      calls.push(reason);
      return cancel(reason);
    },
  });
  return { body, calls, entered: entered.promise, controller };
}

// 仅用于标准原生 API 不能主动制造的同步 reader 清理异常等边界。
export function scripted(options: {
  read?: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel?: () => Promise<void>;
  release?: () => void;
}) {
  const state = { reads: 0, cancels: 0, releases: 0, locked: false, reasons: [] as unknown[][] };
  const reader = {
    read() {
      state.reads++;
      return options.read?.() ?? Promise.resolve({ done: true, value: undefined });
    },
    cancel(...reason: unknown[]) {
      state.cancels++;
      state.reasons.push(reason);
      return options.cancel?.() ?? Promise.resolve();
    },
    releaseLock() {
      state.releases++;
      state.locked = false;
      options.release?.();
    },
  };
  const body = {
    get locked() {
      return state.locked;
    },
    getReader() {
      state.locked = true;
      return reader;
    },
    cancel(...reason: unknown[]) {
      return reader.cancel(...reason);
    },
  } as unknown as ReadableStream<Uint8Array>;
  const value = response(null);
  Object.defineProperty(value, "body", { value: body });
  return { response: value, state };
}
