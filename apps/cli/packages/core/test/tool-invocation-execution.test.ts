// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  AutomationCreateLimitError,
  CoreErrorType,
  HookEventName,
  SessionEventType,
  createCoreError,
  createRootTraceContext,
  getCurrentModelInvocationContext,
  runWithModelInvocationContext,
  type Model,
  type SkillTelemetryMetadata,
} from "@knorvia/contracts";
import type { ToolExecutionResult } from "../src/tool/types.js";
import { ToolDeadline } from "../src/tool/executor/timeout.js";
import { eventPayload, failure, gate, invocation } from "./tool-invocation-fixture.js";

test("guarded failures use the right stage, original telemetry error and failure contexts", async () => {
  for (const point of ["handler", "output", "serialize", "post", "result", "background"]) {
    const f = invocation();
    const error = new Error(point);
    f.behavior.hook = async (input) => {
      if (input.hookEventName === HookEventName.PostToolUse && point === "post") throw error;
      return { additionalContexts: [input.hookEventName] };
    };
    if (point === "handler")
      f.behavior.handler = async () => {
        throw error;
      };
    if (point === "output") f.entry.outputSchema = { type: "number" };
    if (point === "serialize")
      f.entry.formatModelContent = () => {
        throw error;
      };
    if (point === "result")
      f.behavior.event = async (e) => {
        if (e.type === SessionEventType.ToolCallResult) throw error;
      };
    if (point === "background")
      f.behavior.background = async () => {
        throw error;
      };
    const result = await f.run();
    assert.equal(result.success, false);
    assert.match(String(result.modelContent), new RegExp(HookEventName.PreToolUse));
    assert.match(String(result.modelContent), new RegExp(HookEventName.PostToolUseFailure));
    assert.equal(f.events.at(-1)?.type, SessionEventType.ToolCallError);
    const expected =
      point === "handler" || point === "output"
        ? "handler"
        : point === "serialize"
          ? "serialize"
          : "post_hook";
    assert.equal(f.terminal()[0]?.args[0], expected);
    if (point !== "output") assert.equal(f.terminal()[0]?.args[2], error);
    if (point === "background")
      assert.deepEqual(
        f.events.map((e) => e.type),
        [
          SessionEventType.ToolCallStarted,
          SessionEventType.ToolCallResult,
          SessionEventType.ToolCallError,
        ],
      );
  }
});

test("handler business failure preserves its special model text and automation limits stop the turn", async () => {
  const f = invocation();
  f.behavior.handler = async () => failure;
  const result = await f.run();
  assert.equal(result.success, false);
  assert.match(String(result.modelContent), /fixture refusal/);
  assert.equal(f.timeline.includes(HookEventName.PostToolUseFailure), true);
  const automation = invocation();
  automation.entry.metadata.name = "CronCreate";
  automation.call.name = "CronCreate";
  automation.behavior.handler = async () => {
    throw new AutomationCreateLimitError("fixture limit");
  };
  assert.deepEqual((await automation.run()).turnControl, {
    reason: "automation_create_limit",
    stopTurnAfterResult: true,
  });
});

test("Failure Hook and Error publisher exceptions propagate and still unlink the parent signal", async () => {
  for (const point of ["hook", "event"]) {
    const f = invocation();
    const parent = new AbortController();
    const infrastructure = new Error(point);
    f.behavior.handler = async () => {
      throw new Error("handler failed");
    };
    if (point === "hook")
      f.behavior.hook = async (input) => {
        if (input.hookEventName === HookEventName.PostToolUseFailure) throw infrastructure;
        return { additionalContexts: [] };
      };
    else
      f.behavior.event = async (e) => {
        if (e.type === SessionEventType.ToolCallError) throw infrastructure;
      };
    await assert.rejects(f.run({ signal: parent.signal }), (caught) => caught === infrastructure);
    parent.abort();
    assert.equal(f.observed.contexts[0]!.abortSignal.aborted, false);
    assert.deepEqual(f.terminal().at(-1)?.args, ["unhandled", "unknown", infrastructure]);
  }
});

test("success preserves raw output, metadata identity, terminal control and Result before background", async () => {
  const f = invocation();
  const output = { done: true };
  const metadata = {
    schemaVersion: 1,
    tool: "Read",
    path: "fixture",
    content: "a",
    isPartialView: false,
    readAtMs: 1,
    revisionId: "r",
    mtimeMs: 1,
    sizeBytes: 1,
  } as ToolExecutionResult["readFileStateMetadata"];
  const skill = { fixture: "final" } as unknown as SkillTelemetryMetadata;
  f.entry.metadata.stopTurnOnSuccess = true;
  f.entry.formatModelContent = () => "model text";
  f.behavior.handler = async (_input, context) => {
    assert.equal(context.readFileState, f.deps.readFileState);
    context.recordReadFileStateMetadata!({ ...metadata!, content: "first" });
    context.recordReadFileStateMetadata!(metadata!);
    context.recordSkillTelemetryMetadata!({ ...skill, fixture: "first" } as SkillTelemetryMetadata);
    context.recordSkillTelemetryMetadata!(skill);
    return output;
  };
  f.behavior.background = async (_call, raw) => {
    assert.equal(raw, output);
    assert.equal(f.events.at(-1)?.type, SessionEventType.ToolCallResult);
  };
  const result = await f.run({ automationTurn: true, offPeakTurn: true });
  assert.equal(result.output, output);
  assert.equal(result.readFileStateMetadata, metadata);
  assert.equal(eventPayload(f.events.at(-1)!).skillMetadata, skill);
  assert.equal(result.modelContent, "model text");
  assert.deepEqual(result.turnControl, { reason: "subagent_terminal", stopTurnAfterResult: true });
  assert.equal(f.observed.contexts[0]!.automationTurn, true);
  assert.equal(f.observed.contexts[0]!.offPeakTurn, true);
});

test("metadata remains call-local under interleaving, including serialize failure", async () => {
  const f = invocation();
  const entered = gate();
  const release = gate();
  const skillA = { fixture: "a" } as unknown as SkillTelemetryMetadata;
  const skillB = { fixture: "b" } as unknown as SkillTelemetryMetadata;
  f.behavior.handler = async (input, context) => {
    const first = (input as { value: string }).value === "initial";
    context.recordSkillTelemetryMetadata!(first ? skillA : skillB);
    if (first) {
      entered.resolve();
      await release.promise;
    }
    return first ? "a" : "b";
  };
  f.entry.formatModelContent = (output) => {
    if (output === "a") throw new Error("serialize");
    return "b";
  };
  const a = f.run();
  await entered.promise;
  f.call.input = { value: "second" };
  const b = await f.run();
  release.resolve();
  const resultA = await a;
  assert.equal(b.success, true);
  assert.equal(resultA.success, false);
  assert.equal(
    eventPayload(f.events.find((e) => e.type === SessionEventType.ToolCallResult)!).skillMetadata,
    skillB,
  );
  assert.equal(
    eventPayload(f.events.find((e) => e.type === SessionEventType.ToolCallError)!).skillMetadata,
    skillA,
  );
});

test("Hooks use the parent signal; handler uses an unlinked child after completion", async () => {
  const f = invocation();
  const parent = new AbortController();
  const result = await f.run({ signal: parent.signal });
  assert.equal(result.success, true);
  assert.ok(f.observed.hooks.every((h) => h.options?.signal === parent.signal));
  const child = f.observed.contexts[0]!.abortSignal;
  assert.notEqual(child, parent.signal);
  parent.abort("later");
  assert.equal(child.aborted, false);
});

test("failure terminal telemetry unlinks before the next microtask can abort its child", async () => {
  const f = invocation();
  const parent = new AbortController();
  const finish = f.writer.finishFailed;
  f.writer.finishFailed = (...args) => {
    finish(...args);
    queueMicrotask(() => parent.abort("after terminal"));
  };
  f.behavior.handler = async () => {
    throw new Error("failure");
  };
  const result = await f.run({ signal: parent.signal });
  assert.equal(result.success, false);
  assert.equal(parent.signal.aborted, true);
  assert.equal(f.observed.contexts[0]!.abortSignal.aborted, false);
});

test("failure error normalization precedes reading Hook context arrays", async () => {
  const f = invocation();
  const pre = { additionalContexts: ["early"] };
  let failureHookReturned = false;
  const error = new Error("failure");
  Object.defineProperty(error, "message", {
    get() {
      if (failureHookReturned) pre.additionalContexts = ["late"];
      return "failure";
    },
  });
  f.behavior.hook = async (input) => {
    if (input.hookEventName === HookEventName.PreToolUse) return pre;
    if (input.hookEventName === HookEventName.PostToolUseFailure) failureHookReturned = true;
    return { additionalContexts: [] };
  };
  f.behavior.handler = async () => {
    throw error;
  };
  const result = await f.run();
  assert.match(String(result.modelContent), /#1\nlate$/);
});

test("Started cancellation prevents the handler, while Post Hook cancellation can still return success", async () => {
  const f = invocation();
  const parent = new AbortController();
  f.behavior.event = async (e) => {
    if (e.type === SessionEventType.ToolCallStarted) parent.abort("stopped");
  };
  const cancelled = await f.run({ signal: parent.signal });
  assert.equal(cancelled.error?.type, CoreErrorType.ToolCancelled);
  assert.equal(f.timeline.includes("handler"), false);
  assert.equal(f.terminal()[0]?.name, "finishCancelled");
  const second = invocation();
  const late = new AbortController();
  second.behavior.hook = async (input) => {
    if (input.hookEventName === HookEventName.PostToolUse) late.abort();
    return { additionalContexts: [] };
  };
  assert.equal((await second.run({ signal: late.signal })).success, true);
});

test("duration begins before Started but excludes serialization and Post Hook", async (t) => {
  const f = invocation();
  let now = 100;
  t.mock.method(Date, "now", () => now);
  f.behavior.event = async (e) => {
    if (e.type === SessionEventType.ToolCallStarted) now += 30;
    else now += 90;
  };
  f.behavior.handler = async () => {
    now += 10;
    return "output";
  };
  f.entry.formatModelContent = () => {
    now += 20;
    return "serialized";
  };
  f.behavior.hook = async (input) => {
    if (input.hookEventName === HookEventName.PostToolUse) now += 40;
    return { additionalContexts: [] };
  };
  f.behavior.background = async () => {
    now += 80;
  };
  const result = await f.run();
  assert.equal(result.durationMs, 40);
  assert.equal(result.performance?.totalMs, 100);
  assert.equal(result.startedAt.getTime(), 100);
});

test("model contract uses entry-time model while execution rereads model, shell and workspace", async () => {
  const f = invocation();
  const first = { modelId: "first" } as Model;
  const second = { modelId: "second" } as Model;
  f.deps.model = first;
  f.entry.resolveModelContract = ({ model }) => {
    assert.equal(model, first);
    return {};
  };
  f.behavior.event = async (e) => {
    if (e.type === SessionEventType.ToolCallStarted) {
      f.deps.model = second;
      f.deps.getWorkingDirectory = () => "changed";
    }
  };
  f.deps.getBashShellSelection = () => ({ kind: "fixture" }) as never;
  const parent = createRootTraceContext({ sessionId: f.deps.sessionId });
  await f.run({ traceContext: parent });
  const context = f.observed.contexts[0]!;
  assert.equal(context.model?.modelId, "second");
  assert.equal(context.workingDirectory, "changed");
  assert.equal(context.traceId, parent.traceId);
  assert.equal(context.parentSpanId, parent.spanId);
  assert.deepEqual(context.bashShellSelection, { kind: "fixture" });
});

test("model status goes through the local admission clock before the event port; explicit sinks win", async (t) => {
  const f = invocation();
  const phases: string[] = [];
  t.mock.method(ToolDeadline.prototype, "pause", () => {
    phases.push("pause");
  });
  t.mock.method(ToolDeadline.prototype, "resume", () => {
    phases.push("resume");
  });
  const status = (type: string, toolCallId = f.call.id) => ({ type, toolCallId }) as never;
  f.deps.model = {
    async generateText() {
      await getCurrentModelInvocationContext()?.statusSink?.publish(status("model_request_queued"));
      return {};
    },
  } as unknown as Model;
  f.behavior.event = async (e) => {
    if (e.type === SessionEventType.ModelNetworkStatus) phases.push("event");
  };
  f.behavior.handler = async (_input, context) => {
    await context.model!.generateText({ messages: [] });
    await context.emitEvent!({
      ...f.events[0]!,
      type: SessionEventType.ModelNetworkStatus,
      payload: status("model_request_admitted"),
    });
    await context.emitEvent!({
      ...f.events[0]!,
      type: SessionEventType.ModelNetworkStatus,
      payload: status("model_request_queued", "another"),
    });
    await runWithModelInvocationContext(
      {
        statusSink: {
          publish: () => {
            phases.push("explicit");
          },
        },
      },
      () => context.model!.generateText({ messages: [] }),
    );
    return "ok";
  };
  assert.equal((await f.run()).success, true);
  assert.deepEqual(phases, ["pause", "event", "resume", "event", "event", "explicit"]);
});

test("deadline and cancellation categories are preserved without extending the deadline to hooks", async (t) => {
  const f = invocation();
  f.entry.timeout = { defaultMs: 50, allowCallOverride: false };
  t.mock.method(ToolDeadline.prototype, "start", function (this: ToolDeadline, expire: () => void) {
    queueMicrotask(expire);
  });
  f.behavior.handler = async () => gate().promise;
  const result = await f.run();
  assert.equal(result.error?.type, CoreErrorType.ToolTimeout);
  assert.deepEqual(f.terminal()[0]?.args.slice(0, 2), ["handler", "timeout"]);
  t.mock.restoreAll();
  const other = invocation();
  other.behavior.handler = async () => {
    throw createCoreError(CoreErrorType.ToolCancelled, "stopped");
  };
  assert.equal((await other.run()).error?.type, CoreErrorType.ToolCancelled);
  assert.equal(other.terminal()[0]?.name, "finishCancelled");
});
