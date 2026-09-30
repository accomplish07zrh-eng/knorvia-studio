// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, subject } from "./subject.mjs";

const api = await subject("index");
const serialization = await subject("serialize");

test("public logging exports match the retained surface", () => {
  assert.deepEqual(
    Object.keys(api).sort(),
    [
      "DefaultLogRedactor",
      "LOG_CLEANUP_STARTUP_DELAY_MS",
      "LOG_RETENTION_DAYS",
      "NodeFileLogger",
      "cleanupLogRetention",
      "createNodeLoggerFactory",
      "formatLocalLogDate",
      "getDefaultLogDir",
      "scheduleLogRetentionCleanup",
    ].sort(),
  );
});

test("minimum-level callback retains the logger receiver", async (context) => {
  const root = await fixture(context);
  let receiver;
  const logger = new api.NodeFileLogger({
    category: "owned",
    logDir: root,
    getMinLevel() {
      receiver = this;
      return 1;
    },
    redactor: new api.DefaultLogRedactor(),
  });
  logger.info("owned");
  assert.equal(receiver, logger);
});

test("array getter mutations retain already admitted index and omit future holes", () => {
  const array = [
    {
      get value() {
        delete array[0];
        delete array[1];
        return 1;
      },
    },
    "gone",
  ];
  const result = new serialization.DefaultLogRedactor().redact(array);
  assert.equal(0 in result, true);
  assert.deepEqual(result[0], { value: 1 });
  assert.equal(1 in result, false);
  assert.equal(result.length, 2);
});

test("reserved context getters and symbol rest follow the retained reading order", () => {
  const reserved = [
    "durationMs",
    "event",
    "module",
    "parentSpanId",
    "sessionId",
    "spanId",
    "status",
    "toolCallId",
    "traceId",
    "turnId",
  ];
  const reads = [];
  const input = {};
  for (const key of [...reserved].reverse())
    Object.defineProperty(input, key, {
      enumerable: true,
      get() {
        reads.push(key);
        return undefined;
      },
    });
  Object.defineProperty(input, "extra", {
    enumerable: true,
    get() {
      reads.push("extra");
      return 0;
    },
  });
  const symbol = Symbol("retained");
  input[symbol] = 1;
  const result = serialization.stripReservedContext(input);
  assert.deepEqual(reads, [...reserved, "extra"]);
  assert.equal(result.extra, 0);
  assert.equal(result[symbol], 1);
  assert.equal(serialization.stripReservedContext({ [symbol]: 1 }), undefined);
});
