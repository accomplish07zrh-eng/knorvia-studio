// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import {
  BrowserCommandError,
  base64ToBytes,
  expectOk,
  expectPayload,
} from "../src/browser-client/result.js";

const command: BrowserCommand = { method: "getState" };
const success: BrowserCommandResult = { ok: true, elapsedMs: 37, value: { fixture: true } };

test("successful results and all present payload values preserve identity", () => {
  assert.equal(expectOk(command, success), success);
  for (const value of [null, false, 0, "", {}, []])
    assert.equal(expectPayload(command, success, value, "fixture"), value);
});

test("command failures retain transport details and take precedence over payload validation", () => {
  const failure: BrowserCommandResult = {
    ok: false,
    elapsedMs: 10,
    error: { code: "execution_error", message: "fixture failed" },
  };
  for (const invoke of [
    () => expectOk(command, failure),
    () => expectPayload(command, failure, undefined, "fixture"),
  ]) {
    assert.throws(invoke, (error) => {
      assert.ok(error instanceof BrowserCommandError);
      assert.ok(error instanceof Error);
      assert.equal(error.name, "BrowserCommandError");
      assert.equal(error.message, "fixture failed");
      assert.equal(error.code, "execution_error");
      assert.equal(error.command, command);
      assert.equal(error.result, failure);
      return true;
    });
  }
});

test("missing transport error uses the documented code, message and explicit fallback", () => {
  const failure: BrowserCommandResult = { ok: false, elapsedMs: 0 };
  const explicit = new BrowserCommandError(command, failure, "fallback-fixture");
  assert.equal(explicit.code, "fallback-fixture");
  assert.equal(explicit.message, "Browser command failed: fallback-fixture");
  assert.throws(() => expectOk(command, failure), {
    code: "browser_command_failed",
    message: "Browser command failed: browser_command_failed",
  });
  const empty = new BrowserCommandError(
    command,
    { ok: false, elapsedMs: 0, error: { code: "execution_error", message: "" } },
    "fallback",
  );
  assert.equal(empty.message, "");
});

test("undefined payload creates a separate structured execution error", () => {
  assert.throws(
    () => expectPayload(command, success, undefined, "state"),
    (error) => {
      assert.ok(error instanceof BrowserCommandError);
      assert.equal(error.code, "execution_error");
      assert.equal(error.command, command);
      assert.notEqual(error.result, success);
      assert.deepEqual(error.result, {
        ok: false,
        elapsedMs: 37,
        value: { fixture: true },
        error: { code: "execution_error", message: "Browser result missing state" },
      });
      return true;
    },
  );
  assert.deepEqual(success, { ok: true, elapsedMs: 37, value: { fixture: true } });
});

test("base64 decoding returns ordinary bytes with the existing Node input compatibility", () => {
  for (const [text, bytes] of [
    ["AAEC/w==", [0, 1, 2, 255]],
    ["SGVs\nbG8", [72, 101, 108, 108, 111]],
    ["_-8=", [255, 239]],
    ["@@@", []],
    ["", []],
  ] as const) {
    const result = base64ToBytes(text);
    assert.equal(Object.getPrototypeOf(result), Uint8Array.prototype);
    assert.deepEqual([...result], [...bytes]);
  }
});
