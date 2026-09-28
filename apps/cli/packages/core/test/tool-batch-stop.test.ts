// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  createRootTraceContext,
  SessionEventType,
  type TurnId,
} from "@knorvia/contracts";
import { executeToolBatch, executeToolSchedule } from "../src/tool/executor/batch-runner.js";
import { calls, drain, gate, invocation, plan, result } from "./tool-batch-fixture.js";

test("turn stop completes every wave in its group, then serially emits tail cancellations", async () => {
  const { deps, events, observed, behavior } = invocation();
  const input = calls(5);
  const seen: string[] = [];
  const firstEvent = gate();
  const allowEvent = gate();
  behavior.event = async () => {
    if (events.length === 1) {
      firstEvent.resolve();
      await allowEvent.promise;
    }
  };
  const execute: Parameters<typeof executeToolBatch>[1] = async (call) => {
    seen.push(call.id);
    return {
      ...result(call),
      turnControl: { reason: "subagent_terminal", stopTurnAfterResult: call.id === "call-0" },
    };
  };
  const generator = executeToolSchedule(
    deps,
    (group, options) => executeToolBatch(deps, execute, group, options),
    input,
    plan(["call-0", "call-1"], ["call-2", "missing", "call-2"], ["call-4"]),
    { maxConcurrency: 1 },
  );
  await generator.next();
  await generator.next();
  assert.deepEqual(seen, ["call-0", "call-1"]);
  const ending = generator.next();
  await firstEvent.promise;
  assert.equal(events.length, 1);
  assert.equal(observed.logs.length, 0);
  allowEvent.resolve();
  const final = await ending;
  assert.equal(final.done, true);
  if (final.done) {
    assert.deepEqual(
      final.value.map((item) => item.toolCallId),
      ["call-0", "call-1", "call-2", "call-2", "call-4"],
    );
    for (const cancelled of final.value.slice(2)) {
      assert.equal(cancelled.success, false);
      assert.equal(cancelled.output, null);
      assert.equal(cancelled.durationMs, 0);
      assert.equal(cancelled.error?.type, CoreErrorType.ToolCancelled);
      assert.equal(
        cancelled.error?.message,
        "Tool cancelled because a previous tool result requested a turn stop.",
      );
    }
  }
  assert.equal(events.length, 3);
  assert.ok(events.every((event) => event.type === SessionEventType.ToolCallError));
  assert.equal(observed.logs.length, 3);
});

test("stop requires strict true independently of success; pre-aborted signals still reach dispatch", async () => {
  const controller = new AbortController();
  controller.abort("fixture");
  for (const stop of [undefined, false, 1, true]) {
    const { deps, events } = invocation();
    const seen: string[] = [];
    const final = await drain(
      executeToolSchedule(
        deps,
        async (group, options) => {
          assert.equal(options?.signal, controller.signal);
          seen.push(group[0].id);
          return [
            {
              ...result(group[0]),
              success: false,
              turnControl: { reason: "subagent_terminal", stopTurnAfterResult: stop as boolean },
            },
          ];
        },
        calls(2),
        plan(["call-0"], ["call-1"]),
        { signal: controller.signal },
      ),
    );
    assert.equal(seen.length, stop === true ? 1 : 2);
    assert.equal(events.length, stop === true ? 1 : 0);
    assert.equal(final.results.length, 2);
  }
});

test("tail trace chooses option, dependency or root and keeps turn fallback in events and logs", async () => {
  for (const source of ["option", "dependency", "root"]) {
    const { deps, events, observed } = invocation();
    const optionTrace = createRootTraceContext({ sessionId: deps.sessionId });
    const dependencyTrace = createRootTraceContext({
      sessionId: deps.sessionId,
      turnId: "trace-turn" as TurnId,
    });
    deps.traceContext = source === "root" ? undefined : dependencyTrace;
    await drain(
      executeToolSchedule(
        deps,
        async (group) => [
          {
            ...result(group[0]),
            turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
          },
        ],
        calls(2),
        plan(["call-0"], ["call-1"]),
        { traceContext: source === "option" ? optionTrace : undefined },
      ),
    );
    assert.equal(events.length, 1);
    const expected =
      source === "option" ? optionTrace : source === "dependency" ? dependencyTrace : undefined;
    if (expected) assert.equal(events[0].traceId, expected.traceId);
    assert.equal(events[0].turnId, expected?.turnId ?? deps.turnId);
    assert.equal(observed.logs[0][0], "warn");
    assert.equal(observed.logs[0][1], "Tool call cancelled after turn stop");
    const data = observed.logs[0][2] as Record<string, unknown>;
    assert.equal(data.traceId, events[0].traceId);
    assert.equal(data.event, "tool.call.cancelled_after_turn_stop");
    assert.equal(data.module, "core.tool.executor");
    assert.equal(data.status, "cancelled");
    assert.equal(data.toolCallId, "call-1");
  }
});

test("event rejection and logger throw abort tail processing without swallowing the original value", async () => {
  for (const fault of ["event", "logger"]) {
    const { deps, behavior, events, observed } = invocation();
    const failure = { fault };
    if (fault === "event")
      behavior.event = async () => {
        throw failure;
      };
    else
      deps.logger!.warn = () => {
        throw failure;
      };
    const running = drain(
      executeToolSchedule(
        deps,
        async (group) => [
          {
            ...result(group[0]),
            turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
          },
        ],
        calls(3),
        plan(["call-0"], ["call-1", "call-2"]),
      ),
    );
    await assert.rejects(running, (error) => error === failure);
    assert.equal(events.length, 1);
    assert.equal(observed.logs.length, 0);
  }
});
