// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { executeToolSchedule } from "../src/tool/executor/batch-runner.js";
import { ToolExecutorImpl } from "../src/tool/executor/impl.js";
import type { ToolBatchExecuteOptions } from "../src/tool/executor/types.js";
import { calls, drain, invocation, plan, result } from "./tool-batch-fixture.js";

test("generator is lazy and start yield precedes dispatch; original group and result identities survive", async () => {
  const { deps } = invocation();
  const input = calls(2);
  const shadow = { ...input[0], input: { value: "last" } };
  const schedule = plan(["missing"], ["call-0", "missing", "call-1", "call-0"]);
  const output = [result(shadow)];
  let widths = 0;
  let invoked = 0;
  const generator = executeToolSchedule(
    deps,
    function (this: unknown, group) {
      assert.equal(this, undefined);
      assert.deepEqual(group, [shadow, input[1], shadow]);
      invoked++;
      return Promise.resolve(output);
    },
    [...input, shadow],
    schedule,
    {
      get maxConcurrency() {
        widths++;
        return 2;
      },
    },
  );
  assert.equal(widths, 0);
  const start = await generator.next();
  assert.equal(widths, 1);
  assert.equal(invoked, 0);
  assert.equal(start.done, false);
  assert.deepEqual(start.value, {
    type: "batch_start",
    parallelGroupIndex: 1,
    toolCallIds: schedule.parallelGroups[1],
  });
  if (!start.done && start.value.type === "batch_start")
    assert.equal(start.value.toolCallIds, schedule.parallelGroups[1]);
  const completed = await generator.next();
  assert.equal(invoked, 1);
  assert.equal(completed.done, false);
  if (!completed.done && completed.value.type === "batch_complete")
    assert.equal(completed.value.results, output);
  assert.deepEqual(await generator.next(), { done: true, value: output });
});

test("return after start never dispatches; return after complete never cancels pending groups", async () => {
  for (const stopAt of ["start", "complete"]) {
    const { deps, events, observed } = invocation();
    let invoked = 0;
    const input = calls(2);
    const generator = executeToolSchedule(
      deps,
      async (group) => {
        invoked++;
        return [
          {
            ...result(group[0]),
            turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
          },
        ];
      },
      input,
      plan(["call-0"], ["call-1"]),
    );
    await generator.next();
    if (stopAt === "complete") await generator.next();
    const replacement: ReturnType<typeof result>[] = [];
    assert.deepEqual(await generator.return(replacement), { done: true, value: replacement });
    assert.equal(invoked, stopAt === "complete" ? 1 : 0);
    assert.deepEqual(events, []);
    assert.deepEqual(observed.logs, []);
  }
});

test("options are read after start; width stays captured and ordinary failed results continue", async () => {
  const { deps } = invocation();
  const input = calls(2);
  const options: ToolBatchExecuteOptions = { maxConcurrency: 1, automationTurn: false };
  const observed: (ToolBatchExecuteOptions | undefined)[] = [];
  const generator = executeToolSchedule(
    deps,
    async (group, actual) => {
      observed.push(actual);
      return group.map((call) => ({ ...result(call), success: false }));
    },
    input,
    plan(["call-0"], ["call-1"]),
    options,
  );
  await generator.next();
  options.maxConcurrency = 5;
  options.automationTurn = true;
  const finished = await drain(generator);
  assert.equal(finished.results.length, 2);
  assert.deepEqual(
    observed.map((value) => [value?.maxConcurrency, value?.automationTurn]),
    [
      [1, true],
      [1, true],
    ],
  );
});

test("stop inspection resumes after complete yield and reads the exposed result array", async () => {
  const { deps, events } = invocation();
  const input = calls(2);
  const output = [result(input[0])];
  let invocations = 0;
  const generator = executeToolSchedule(
    deps,
    async () => {
      invocations++;
      return output;
    },
    input,
    plan(["call-0"], ["call-1"]),
  );
  await generator.next();
  await generator.next();
  assert.equal(events.length, 0);
  output.push({
    ...result(input[0]),
    turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
  });
  const final = await generator.next();
  assert.equal(final.done, true);
  assert.equal(invocations, 1);
  if (final.done) {
    assert.equal(final.value.length, 2);
    assert.equal(final.value[0], output[0]);
    assert.equal(final.value[1].toolCallId, "call-1");
  }
  assert.equal(events.length, 1);
});

test("batch rejection preserves its value without synthetic completion or tail cancellation", async () => {
  const { deps, events } = invocation();
  const failure = { rejected: true };
  const generator = executeToolSchedule(
    deps,
    () => Promise.reject(failure),
    calls(2),
    plan(["call-0"], ["call-1"]),
  );
  await generator.next();
  await assert.rejects(generator.next(), (error) => error === failure);
  assert.deepEqual(events, []);
  assert.deepEqual(await generator.next(), { done: true, value: undefined });
});

test("future schedule groups stay live, while call lookup is captured at first next", async () => {
  const { deps } = invocation();
  const input = calls(2);
  const schedule = plan(["call-0"]);
  const seen: string[] = [];
  const generator = executeToolSchedule(
    deps,
    async (group) => {
      seen.push(...group.map((call) => call.id));
      return group.map(result);
    },
    input,
    schedule,
  );
  await generator.next();
  input.push(calls(3)[2]);
  schedule.parallelGroups.push(...plan(["call-1", "call-2"]).parallelGroups);
  const final = await drain(generator);
  assert.deepEqual(seen, ["call-0", "call-1"]);
  assert.equal(final.results.length, 2);
});

test("dispatch and cancellation use each resumed next's async context", async () => {
  const { deps, behavior } = invocation();
  const local = new AsyncLocalStorage<string>();
  const seen: (string | undefined)[] = [];
  behavior.event = async () => {
    seen.push(local.getStore());
  };
  const generator = local.run("creation", () =>
    executeToolSchedule(
      deps,
      async (group) => {
        seen.push(local.getStore());
        return [
          {
            ...result(group[0]),
            turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
          },
        ];
      },
      calls(2),
      plan(["call-0"], ["call-1"]),
    ),
  );
  await local.run("start", () => generator.next());
  await local.run("dispatch", () => generator.next());
  await local.run("cancel", () => generator.next());
  assert.deepEqual(seen, ["dispatch", "cancel"]);
});

test("real executor forwards offPeakTurn through schedules, small batches and multiple waves", async () => {
  for (const offPeakTurn of [true, false, undefined]) {
    for (const count of [1, 3]) {
      const { deps, observed } = invocation();
      const executor = new ToolExecutorImpl(deps);
      const input = calls(count);
      const finished = await drain(
        executor.executeSchedule(input, plan(input.map((call) => call.id)), {
          maxConcurrency: 1,
          offPeakTurn,
        }),
      );
      assert.equal(finished.results.length, count);
      assert.equal(observed.contexts.length, count);
      assert.ok(finished.results.every((item) => item.success));
      for (const context of observed.contexts) assert.equal(context.offPeakTurn, offPeakTurn);
    }
  }
});
