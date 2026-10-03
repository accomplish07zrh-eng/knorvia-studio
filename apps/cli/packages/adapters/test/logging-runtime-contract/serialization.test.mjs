// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { subject } from "./subject.mjs";

const api = await subject("serialize");

test("large sparse arrays use bounded traversal memory and retain holes and identities", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--expose-gc",
      "--import",
      "tsx",
      fileURLToPath(new URL("./sparse-array-probe.mjs", import.meta.url)),
    ],
    { windowsHide: true, maxBuffer: 128 * 1024 },
  );
  const result = JSON.parse(stdout);
  assert.ok(result.extraHeap < 32 * 1024 * 1024, `Extra heap: ${result.extraHeap} bytes`);
  assert.deepEqual(
    { ...result, extraHeap: undefined },
    {
      extraHeap: undefined,
      length: 250_000,
      first: { value: "fixture" },
      last: "[Redacted:Circular]",
      keys: ["0", "249999"],
      middlePresent: false,
    },
  );
});

test("array traversal observes inherited slots and getter mutations in depth-first order", () => {
  const events = [];
  const input = new Array(5);
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, 1, {
    get() {
      events.push("inherited");
      return 7;
    },
  });
  Object.setPrototypeOf(input, prototype);
  Object.defineProperty(input, 0, {
    get() {
      events.push("first");
      input[3] = "added";
      delete input[4];
      input[5] = "outside initial length";
      return {
        get nested() {
          events.push("nested");
          return 2;
        },
      };
    },
  });
  input[4] = "removed";
  const output = new api.DefaultLogRedactor().redact(input);
  assert.deepEqual(events, ["first", "nested", "inherited"]);
  assert.equal(output.length, 5);
  assert.deepEqual(Object.keys(output), ["0", "1", "3"]);
  assert.deepEqual(output[0], { nested: 2 });
  assert.equal(output[1], 7);
  assert.equal(output[3], "added");
});

test("redactor keeps primitives and scrubs diagnostic text", () => {
  const r = new api.DefaultLogRedactor();
  for (const value of [undefined, null, false, 0, 12n]) assert.equal(r.redact(value), value);
  const result = r.redact("request password=fixture-password");
  assert.equal(result.includes("fixture-password"), false);
  assert.equal(result.includes("request"), true);
});

test("sensitive keys redact values without modifying the original", () => {
  const input = { API_KEY: { nested: 1 }, Authorization: "fixture", cookies: 0, other: false };
  assert.deepEqual(new api.DefaultLogRedactor().redact(input), {
    API_KEY: "[Redacted]",
    Authorization: "[Redacted]",
    cookies: "[Redacted]",
    other: false,
  });
  assert.deepEqual(input.API_KEY, { nested: 1 });
});

test("one traversal distinguishes repeated identity while each call resets it", () => {
  const child = { value: 1 };
  const r = new api.DefaultLogRedactor();
  assert.deepEqual(r.redact({ a: child, b: child }), { a: { value: 1 }, b: "[Redacted:Circular]" });
  assert.deepEqual(r.redact(child), { value: 1 });
  child.self = child;
  assert.deepEqual(r.redact(child), { value: 1, self: "[Redacted:Circular]" });
});

test("depth limit includes scalar values below level eight", () => {
  let input = "leaf";
  for (let i = 0; i < 9; i++) input = { next: input };
  let result = new api.DefaultLogRedactor().redact(input);
  for (let i = 0; i < 9; i++) result = result.next;
  assert.equal(result, "[Redacted:DepthLimit]");
});

test("sparse arrays, dates, symbols and proto keys retain projection semantics", () => {
  const array = [, { a: 1 }, undefined];
  const result = new api.DefaultLogRedactor().redact(array);
  assert.equal(result.length, 3);
  assert.equal(0 in result, false);
  assert.deepEqual(result[1], { a: 1 });
  const input = JSON.parse('{"__proto__":{"kept":true},"date":null}');
  input.date = new Date(0);
  input[Symbol("hidden")] = 5;
  const output = new api.DefaultLogRedactor().redact(input);
  assert.equal(Object.getPrototypeOf(output), Object.prototype);
  assert.deepEqual(output.__proto__, { kept: true });
  assert.deepEqual(output.date, {});
  assert.equal(Object.getOwnPropertySymbols(output).length, 0);
});

test("enumeration reads getters before nested redaction and propagates getter errors", () => {
  const events = [];
  const input = {
    get child() {
      events.push("child");
      return {
        get value() {
          events.push("nested");
          return 1;
        },
      };
    },
    get token() {
      events.push("token");
      return 2;
    },
  };
  assert.deepEqual(new api.DefaultLogRedactor().redact(input), {
    child: { value: 1 },
    token: "[Redacted]",
  });
  assert.deepEqual(events, ["child", "token", "nested"]);
  const failure = new Error("owned getter");
  assert.throws(
    () =>
      new api.DefaultLogRedactor().redact({
        get a() {
          throw failure;
        },
      }),
    (e) => e === failure,
  );
});

test("reserved context keys are stripped without dropping falsy extra data", () => {
  const context = {
    durationMs: 1,
    event: "e",
    module: "m",
    parentSpanId: "p",
    sessionId: "s",
    spanId: "i",
    status: "started",
    toolCallId: "t",
    traceId: "r",
    turnId: "n",
    extra: 0,
    empty: "",
  };
  assert.deepEqual(api.stripReservedContext(context), { extra: 0, empty: "" });
  delete context.extra;
  delete context.empty;
  assert.equal(api.stripReservedContext(context), undefined);
  assert.equal(context.traceId, "r");
});

test("status accepts exactly the five public states", () => {
  for (const s of ["started", "waiting", "completed", "failed", "cancelled"])
    assert.equal(api.isLogStatus(s), true);
  for (const s of [undefined, null, "running", "", 1]) assert.equal(api.isLogStatus(s), false);
});

test("JSONL projection preserves ordered fields and redactor receiver/call order", () => {
  const calls = [];
  const redactor = {
    redact(value) {
      assert.equal(this, redactor);
      calls.push(value);
      return value;
    },
  };
  const entry = {
    timestamp: new Date("2026-01-02T03:04:05Z"),
    level: 1,
    levelName: "INFO",
    event: "e",
    module: "m",
    message: "message",
    traceId: "r",
    spanId: "i",
    parentSpanId: "p",
    sessionId: "s",
    turnId: "t",
    toolCallId: "c",
    durationMs: 0,
    status: "completed",
    context: { x: 0 },
    error: null,
  };
  const result = api.toSerializableEntry(entry, redactor);
  assert.deepEqual(Object.keys(result), [
    "timestamp",
    "level",
    "event",
    "module",
    "message",
    "traceId",
    "spanId",
    "parentSpanId",
    "sessionId",
    "turnId",
    "toolCallId",
    "durationMs",
    "status",
    "context",
    "error",
  ]);
  assert.deepEqual(calls, ["message", entry.context, null]);
  assert.equal(result.timestamp, "2026-01-02T03:04:05.000Z");
  assert.equal(result.level, "info");
  assert.equal(result.durationMs, 0);
  assert.equal(result.error, null);
});

test("undefined omission follows custom redactor and invalid dates reject", () => {
  const entry = { timestamp: new Date(0), levelName: "WARN", message: "m" };
  assert.deepEqual(api.toSerializableEntry(entry, { redact: () => undefined }), {
    timestamp: "1970-01-01T00:00:00.000Z",
    level: "warn",
  });
  assert.throws(
    () => api.toSerializableEntry({ ...entry, timestamp: new Date(NaN) }, { redact: (v) => v }),
    RangeError,
  );
});

test("console line keeps exact framing, truthy trace/event and default redaction", () => {
  assert.equal(
    api.formatConsoleLine({
      levelName: "WARN",
      module: "",
      traceId: "abcdefghijk",
      event: "tick",
      message: "ready",
    }),
    "warn [] trace=abcdefgh event=tick ready",
  );
  assert.equal(
    api.formatConsoleLine({ levelName: "INFO", message: "ready", traceId: "", event: "" }),
    "info [log] ready",
  );
  assert.equal(
    api
      .formatConsoleLine({ levelName: "ERROR", message: "password=fixture-password" })
      .includes("fixture-password"),
    false,
  );
});

test("error projection keeps supported fields and explicit stack policy", () => {
  const context = Object.assign(Object.create(null), { detail: 1 });
  const error = Object.assign(new Error("failure"), {
    code: "EOWNED",
    type: "local",
    context,
    cause: "leaf",
  });
  const result = api.serializeLogError(error, false);
  assert.deepEqual(result, {
    name: "Error",
    message: "failure",
    code: "EOWNED",
    type: "local",
    context,
    cause: { name: "UnknownError", message: "leaf" },
  });
  assert.equal(result.context, context);
  assert.equal(api.serializeLogError(error, true).stack, error.stack);
});

test("error projection rejects unsupported optional field types and contexts", () => {
  for (const context of [[], new Date(0), new (class Context {})()]) {
    const result = api.serializeLogError(
      { name: 1, message: 2, code: "", type: 1, stack: 4, context },
      true,
    );
    assert.deepEqual(result, { name: "Error", message: "[object Object]" });
  }
  assert.deepEqual(api.serializeLogError(null, false), { name: "UnknownError", message: "null" });
});

test("error cause cycle, external seen set and depth boundary are stable", () => {
  const error = new Error("loop");
  error.cause = error;
  assert.equal(api.serializeLogError(error, false).cause.name, "ErrorCauseCircularReference");
  const seen = new WeakSet([error]);
  assert.equal(api.serializeLogError(error, false, seen).name, "ErrorCauseCircularReference");
  assert.equal(api.serializeLogError(null, false, new WeakSet(), 9).name, "ErrorCauseDepthLimit");
  let chain = new Error("leaf");
  for (let i = 0; i < 9; i++) chain = new Error("branch", { cause: chain });
  let result = api.serializeLogError(chain, false);
  for (let i = 0; i < 9; i++) result = result.cause;
  assert.equal(result.name, "ErrorCauseDepthLimit");
});
