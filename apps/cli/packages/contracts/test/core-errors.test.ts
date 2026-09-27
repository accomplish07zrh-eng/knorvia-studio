// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as api from "../src/errors/index.js";

test("public error kinds retain ordered names and wire values without freezing", () => {
  const groups = [
    ["Session", "NotFound", "AlreadyExists", "Corrupted"],
    ["Turn", "NotFound", "InProgress"],
    ["", "InvalidTurnPhase"],
    ["Turn", "Cancelled"],
    ["Model", "Error", "Timeout", "RateLimited", "ContextExceeded"],
    ["Tool", "NotFound", "ExecutionFailed", "Timeout", "Cancelled", "MaxCalls"],
    ["", "InvalidInput"],
    ["Permission", "Denied", "Escalation", "Timeout"],
    [
      "",
      "InvalidStateTransition",
      "EventOutOfOrder",
      "ProjectionCorrupted",
      "StorageError",
      "ConfigurationError",
      "Cancelled",
      "UnknownError",
    ],
  ];
  const names = groups.flatMap(([prefix, ...suffixes]) =>
    suffixes.map((suffix) => prefix + suffix),
  );
  assert.equal(names.length, 27);
  assert.deepEqual(Object.keys(api.CoreErrorType), names);
  assert.deepEqual(
    Object.values(api.CoreErrorType),
    names.map((name) =>
      name.replace(
        /[A-Z]/g,
        (letter, offset: number) => (offset ? "_" : "") + letter.toLowerCase(),
      ),
    ),
  );
  assert.equal(Object.isFrozen(api.CoreErrorType), false);
});

test("generic errors are plain mutable Error objects with ordered own metadata", () => {
  const before = Date.now();
  const error = api.createCoreError(api.CoreErrorType.UnknownError, "  original\nmessage  ");
  assert.equal(Object.getPrototypeOf(error), Error.prototype);
  assert.equal(error.name, "Error");
  assert.equal(error.message, "  original\nmessage  ");
  assert.equal(typeof error.stack, "string");
  assert.deepEqual(Object.keys(error), [
    "type",
    "code",
    "cause",
    "context",
    "recoverable",
    "retryable",
    "timestamp",
  ]);
  for (const key of Object.keys(error)) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key)!;
    assert.equal(descriptor.writable, true);
    assert.equal(descriptor.configurable, true);
    assert.equal(descriptor.enumerable, true);
  }
  assert.equal(error.code, "UNKNOWN_ERROR");
  assert.equal(error.cause, undefined);
  assert.equal(error.context, undefined);
  assert.equal(error.recoverable, false);
  assert.equal(error.retryable, false);
  assert.ok(error.timestamp instanceof Date && error.timestamp.getTime() >= before);
  error.recoverable = true;
  assert.equal(api.isRecoverable(error), true);
});

test("options retain reference identity, nullish defaults and ordered reads", () => {
  const events: string[] = [];
  const cause = new Error("cause");
  const context = { retained: true };
  const error = api.createCoreError(api.CoreErrorType.ModelError, "m", {
    get cause() {
      events.push("cause");
      return cause;
    },
    get context() {
      events.push("context");
      return context;
    },
    get recoverable() {
      events.push("recoverable");
      return true;
    },
    get retryable() {
      events.push("retryable");
      return false;
    },
  });
  assert.deepEqual(events, ["cause", "context", "recoverable", "retryable"]);
  assert.equal(error.cause, cause);
  assert.equal(error.context, context);
  assert.equal(api.isRetryable(error), false);
  assert.equal(api.isRecoverable(error), true);
  const defaults = api.createCoreError(api.CoreErrorType.Cancelled, "x", {
    recoverable: null,
    retryable: null,
  } as unknown as Parameters<typeof api.createCoreError>[2]);
  assert.equal(defaults.recoverable, false);
  assert.equal(defaults.retryable, false);
  assert.notEqual(defaults.timestamp, error.timestamp);
});

test("named factories preserve context keys, flags, causes and caller arrays", () => {
  const expected = ["ready"];
  const cause = new Error("driver");
  const fixtures = [
    [
      api.sessionNotFound("s"),
      "session_not_found",
      "Session not found: s",
      { sessionId: "s" },
      true,
      false,
    ],
    [
      api.invalidTurnPhase("busy", expected),
      "invalid_turn_phase",
      "Invalid turn phase: busy",
      { current: "busy", expected },
      true,
      false,
    ],
    [api.toolNotFound("t"), "tool_not_found", "Tool not found: t", { toolName: "t" }, false, false],
    [
      api.toolExecutionFailed("t", cause),
      "tool_execution_failed",
      "Tool execution failed: t",
      { toolName: "t" },
      true,
      true,
    ],
    [
      api.permissionDenied("t"),
      "permission_denied",
      "Permission denied: t",
      { toolName: "t", reason: undefined },
      true,
      false,
    ],
  ] as const;
  for (const [error, type, message, context, recoverable, retryable] of fixtures) {
    assert.equal(error.type, type);
    assert.equal(error.message, message);
    assert.deepEqual(error.context, context);
    assert.equal(error.recoverable, recoverable);
    assert.equal(error.retryable, retryable);
  }
  assert.equal(fixtures[1][0].context!.expected, expected);
  assert.equal(fixtures[3][0].cause, cause);
  assert.deepEqual(api.permissionDenied("t", "\nfeedback\n").context, {
    toolName: "t",
    reason: "\nfeedback\n",
  });
});

test("recognition retains Error realm and property-presence semantics", () => {
  for (const candidate of [
    null,
    undefined,
    {},
    { type: "x", code: "X" },
    new Error("plain"),
    runInNewContext("Object.assign(new Error('foreign'), {type:'x',code:'X'})"),
  ])
    assert.equal(api.isCoreError(candidate), false);
  const error = Object.assign(new Error("metadata"), { type: undefined, code: null });
  assert.equal(api.isCoreError(error), true);
  const inherited = Object.create(Object.assign(new Error("base"), { type: "x", code: "X" }));
  assert.equal(api.isCoreError(inherited), true);
});
