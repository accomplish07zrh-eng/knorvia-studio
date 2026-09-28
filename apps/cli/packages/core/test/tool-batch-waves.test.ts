// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { executeToolBatch } from "../src/tool/executor/batch-runner.js";
import type { ToolExecuteOptions } from "../src/tool/executor/types.js";
import type { ToolExecutionResult } from "../src/tool/types.js";
import { calls, gate, invocation, optionKeys, result } from "./tool-batch-fixture.js";

test("empty batch dispatches nothing; small batches preserve options identity and plain receiver", async () => {
  const { deps } = invocation();
  const input = calls(2);
  const options = { maxConcurrency: 2, offPeakTurn: false };
  const seen: string[] = [];
  const execute: Parameters<typeof executeToolBatch>[1] = function (this: unknown, call, actual) {
    assert.equal(this, undefined);
    assert.equal(actual, options);
    seen.push(call.id);
    return Promise.resolve(result(call));
  };
  assert.deepEqual(await executeToolBatch(deps, execute, [], options), []);
  assert.deepEqual(seen, []);
  const running = executeToolBatch(deps, execute, input, options);
  assert.deepEqual(
    seen,
    input.map((call) => call.id),
  );
  assert.deepEqual(
    (await running).map((item) => item.toolCallId),
    seen,
  );
});

test("whole-wave barrier preserves input order even when a later member finishes first", async () => {
  const { deps } = invocation();
  const input = calls(5);
  const waits = input.map(() => gate<ToolExecutionResult>());
  const started = input.map(() => gate());
  const seen: string[] = [];
  const received: ToolExecuteOptions[] = [];
  const options = { maxConcurrency: 2, offPeakTurn: true };
  const running = executeToolBatch(
    deps,
    (call, actual) => {
      const i = input.indexOf(call);
      seen.push(call.id);
      received.push(actual!);
      started[i].resolve();
      return waits[i].promise;
    },
    input,
    options,
  );
  assert.deepEqual(seen, ["call-0", "call-1"]);
  waits[1].resolve(result(input[1]));
  await waits[1].promise;
  assert.deepEqual(seen, ["call-0", "call-1"]);
  waits[0].resolve(result(input[0]));
  await started[2].promise;
  assert.deepEqual(seen, ["call-0", "call-1", "call-2", "call-3"]);
  waits[3].resolve(result(input[3]));
  waits[2].resolve(result(input[2]));
  await started[4].promise;
  waits[4].resolve(result(input[4]));
  assert.deepEqual(
    (await running).map((item) => item.toolCallId),
    input.map((call) => call.id),
  );
  assert.equal(new Set(received).size, 5);
  for (const actual of received) {
    assert.notEqual(actual, options);
    assert.deepEqual(Object.keys(actual), optionKeys);
    assert.equal(actual.offPeakTurn, true);
  }
});

test("async rejection starts its whole wave but no next wave, without cancelling siblings", async () => {
  const { deps } = invocation();
  const failure = { rejection: "fixture" };
  const sibling = gate<ToolExecutionResult>();
  const controller = new AbortController();
  const input = calls(4);
  const seen: string[] = [];
  const running = executeToolBatch(
    deps,
    (call) => {
      seen.push(call.id);
      return call === input[0] ? Promise.reject(failure) : sibling.promise;
    },
    input,
    { maxConcurrency: 2, signal: controller.signal },
  );
  assert.deepEqual(seen, ["call-0", "call-1"]);
  await assert.rejects(running, (error) => error === failure);
  sibling.resolve(result(input[1]));
  await sibling.promise;
  assert.deepEqual(seen, ["call-0", "call-1"]);
  assert.equal(controller.signal.aborted, false);
});

test("synchronous callback failure prevents subsequent callbacks in the same wave", async () => {
  const { deps } = invocation();
  const failure = { throw: "fixture" };
  for (const count of [2, 4]) {
    const seen: string[] = [];
    const running = executeToolBatch(
      deps,
      (call) => {
        seen.push(call.id);
        throw failure;
      },
      calls(count),
      { maxConcurrency: 2 },
    );
    await assert.rejects(running, (error) => error === failure);
    assert.deepEqual(seen, ["call-0"]);
  }
});

test("wave options are read per invocation in field order; width is captured once", async () => {
  const { deps } = invocation();
  const input = calls(3);
  const reads: string[] = [];
  let flag = false;
  const options = Object.fromEntries(optionKeys.map((key) => [key, undefined]));
  Object.defineProperties(options, {
    maxConcurrency: {
      get() {
        reads.push("width");
        return 1;
      },
    },
    ...Object.fromEntries(
      optionKeys.map((key) => [
        key,
        {
          get() {
            reads.push(key);
            return key === "offPeakTurn" ? flag : undefined;
          },
        },
      ]),
    ),
  });
  const flags: unknown[] = [];
  await executeToolBatch(
    deps,
    (call, actual) => {
      flags.push(actual?.offPeakTurn);
      flag = !flag;
      return Promise.resolve(result(call));
    },
    input,
    options,
  );
  assert.deepEqual(flags, [false, true, false]);
  assert.deepEqual(reads, ["width", ...optionKeys, ...optionKeys, ...optionKeys]);
});

test("pre-aborted signal and ordinary failed result do not short-circuit batch dispatch", async () => {
  const { deps } = invocation();
  const controller = new AbortController();
  controller.abort("fixture");
  const seen: string[] = [];
  const results = await executeToolBatch(
    deps,
    async (call, actual) => {
      assert.equal(actual?.signal, controller.signal);
      seen.push(call.id);
      return { ...result(call), success: false };
    },
    calls(3),
    { maxConcurrency: 1, signal: controller.signal },
  );
  assert.equal(seen.length, 3);
  assert.equal(results.length, 3);
});

test("later waves read the live input array without re-reading the width", async () => {
  const { deps } = invocation();
  const input = calls(2);
  const extra = calls(3)[2];
  const seen: string[] = [];
  const results = await executeToolBatch(
    deps,
    async (call) => {
      seen.push(call.id);
      if (seen.length === 1) input.push(extra);
      return result(call);
    },
    input,
    { maxConcurrency: 1 },
  );
  assert.deepEqual(seen, ["call-0", "call-1", "call-2"]);
  assert.equal(results.length, 3);
});
