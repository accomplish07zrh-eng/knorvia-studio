// SPDX-License-Identifier: Apache-2.0
// core-tool-01 contract tests, part 2: executor assembly, events, turn control,
// telemetry, background tracker and projection. Test doubles are in-memory only.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import {
  createToolExecutor,
  ToolExecutorImpl,
} from "../../../../apps/cli/packages/core/src/tool/executor/impl.js";
import {
  emitPermissionDenied,
  emitPermissionRequested,
  emitPermissionResolved,
  emitSkippedToolError,
  emitToolCallError,
  emitToolCallResult,
  emitToolCallStarted,
} from "../../../../apps/cli/packages/core/src/tool/executor/events.js";
import {
  withAutomationCreateLimitTurnStop,
  withPlanExitDeniedTurnStop,
  withTerminalToolTurnStop,
  withWorkflowRefineDeniedFollowUp,
} from "../../../../apps/cli/packages/core/src/tool/executor/turn-control.js";
import { runToolCallWithTelemetry } from "../../../../apps/cli/packages/core/src/tool/executor/telemetry.js";
import {
  createToolModelStatusSink,
  withDefaultToolModelStatusSink,
} from "../../../../apps/cli/packages/core/src/tool/executor/model-status-sink.js";
import { BackgroundTaskTracker } from "../../../../apps/cli/packages/core/src/tool/executor/background-tasks.js";
import {
  emitBackgroundTaskEvent,
  field,
  errorMessage,
  runningSignature,
  snapshotString,
  stringField,
  taskPayload,
  workflowSubject,
} from "../../../../apps/cli/packages/core/src/tool/executor/background-tracker-projection.js";
import { buildWorkflowArtifactsManifestSection } from "../../../../apps/cli/packages/core/src/tool/executor/workflow-published-artifacts.js";
import {
  WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES,
  WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES,
} from "../../../../apps/cli/packages/core/src/tool/executor/workflow-published-artifacts.js";

function eventSink() {
  const events: Record<string, any>[] = [];
  return {
    events,
    deps(extra: Record<string, unknown> = {}) {
      return {
        sessionId: "s1",
        emitEvent: async (event: Record<string, any>) => void events.push(event),
        ...extra,
      } as never;
    },
  };
}

const trace = { traceId: "trace-1", sessionId: "s1" } as never;

test("B5 ToolCallStarted omits optional keys instead of writing undefined", async () => {
  const sink = eventSink();
  await emitToolCallStarted(
    sink.deps(),
    { id: "c1", name: "Read", input: {} } as never,
    trace,
    "turn-1",
    1000,
  );
  const bare = sink.events.at(-1)!;
  assert.equal(Object.hasOwn(bare.payload, "display"), true);
  assert.equal(bare.payload.display, undefined);
  assert.equal(Object.hasOwn(bare.payload, "readOnly"), false);
  assert.equal(bare.payload.toolCallId, "c1");
  assert.equal(bare.type, "tool_call_started");

  await emitToolCallStarted(
    sink.deps(),
    { id: "c2", name: "Write", input: {} } as never,
    trace,
    "turn-1",
    1000,
    { kind: "x" } as never,
    { readOnly: false, sideEffectScope: "workspace" } as never,
  );
  const rich = sink.events.at(-1)!;
  assert.equal(rich.payload.readOnly, false);
  assert.equal(rich.payload.sideEffectScope, "workspace");
  assert.ok(rich.payload.display);
});

test("B6/B7 ToolCallResult and error payloads keep references and order", async () => {
  const sink = eventSink();
  const serialization = {
    content: "c",
    truncated: false,
    originalBytes: 1,
    returnedBytes: 1,
    budgetStrategy: "none",
    artifactPath: "a",
  };
  await emitToolCallResult(
    sink.deps(),
    { id: "c1", name: "Read", input: {} } as never,
    trace,
    undefined,
    serialization as never,
    5,
    undefined,
    undefined,
    undefined,
  );
  const result = sink.events.at(-1)!;
  assert.equal(result.payload.result.success, true);
  assert.equal(result.payload.result.content, "c");
  assert.equal(result.payload.duration, 5);
  assert.equal(Object.hasOwn(result.payload, "skillMetadata"), false);

  const logs: string[] = [];
  const deps = sink.deps({ logger: { warn: (m: string) => logs.push(m) } });
  await emitSkippedToolError(
    deps,
    { toolCallId: "c9", toolName: "Bash", error: { type: "x" } } as never,
    trace,
  );
  assert.equal(sink.events.at(-1)!.payload.error.type, "x");
  assert.equal(logs.length, 1);

  await emitToolCallError(deps, "c10", trace, undefined, { type: "y" } as never);
  assert.equal(sink.events.at(-1)!.payload.error.type, "y");
});

test("B8/B9 permission events carry defaults, capability bit and modifiedInput", async () => {
  const sink = eventSink();
  await emitPermissionRequested(
    sink.deps({ sessionModePort: { supportsPermissionFullAccess: () => false } }),
    { id: "c1", name: "Bash", input: { command: "x" } } as never,
    { command: "x" },
    "perm-1",
    "high" as never,
    undefined,
    [],
    trace,
  );
  const requested = sink.events.at(-1)!;
  assert.equal(requested.payload.reason, "Tool Bash requires approval");
  assert.equal(Object.hasOwn(requested.payload, "fullAccessSupported"), false);
  assert.equal(Object.hasOwn(requested.payload, "display"), false);

  await emitPermissionRequested(
    sink.deps({ sessionModePort: { supportsPermissionFullAccess: () => true } }),
    { id: "c1", name: "Bash", input: {} } as never,
    {},
    "perm-2",
    "low" as never,
    "custom",
    [],
    trace,
  );
  assert.equal(sink.events.at(-1)!.payload.fullAccessSupported, true);
  assert.equal(sink.events.at(-1)!.payload.reason, "custom");

  await emitPermissionResolved(
    sink.deps(),
    { id: "c1", name: "Bash", input: {} } as never,
    "perm-1",
    { decision: "allow", reason: "ok" } as never,
    trace,
  );
  const resolved = sink.events.at(-1)!;
  assert.equal(resolved.payload.decision, "allow");
  assert.equal(Object.hasOwn(resolved.payload, "modifiedInput"), true);
  assert.equal(resolved.payload.modifiedInput, undefined);

  await emitPermissionDenied(
    sink.deps(),
    { id: "c1", name: "Bash", input: { command: "x", n: 2 } } as never,
    undefined,
    trace,
  );
  const denied = sink.events.at(-1)!;
  assert.equal(denied.payload.reason, "Permission denied for Bash");
  assert.deepEqual(denied.payload.inputSummary.keys, ["command", "n"]);
});

test("B10 automation create limit stops the turn only for CronCreate failures", () => {
  const limit = { code: "AUTOMATION_CREATE_LIMIT_REACHED", message: "limit" };
  const failure = { success: false, modelContent: "old", error: { type: "x" } } as never;
  const other = { success: false, error: { type: "other" } } as never;
  assert.equal(
    withAutomationCreateLimitTurnStop(other, { error: { type: "other" }, toolName: "CronCreate" }),
    other,
  );
  const success = { success: true } as never;
  assert.equal(
    withAutomationCreateLimitTurnStop(success, { error: limit, toolName: "CronCreate" }),
    success,
  );
  assert.equal(
    withAutomationCreateLimitTurnStop(failure, { error: limit, toolName: "Read" }),
    failure,
  );
  const stopped = withAutomationCreateLimitTurnStop(failure, {
    error: limit,
    toolName: "CronCreate",
  });
  assert.equal(stopped.turnControl?.stopTurnAfterResult, true);
  assert.equal(stopped.turnControl?.reason, "automation_create_limit");
  assert.ok(String(stopped.modelContent).includes("global retained-task limit of 20"));
});

test("B11 plan exit denial splits feedback from stop-turn", () => {
  const denied = (message: string) =>
    ({
      success: false,
      error: {
        type: "permission_denied" as never,
        reasonSource: "plan_approval_feedback",
        message,
      },
    }) as never;
  const gate = { mode: "plan" as never, toolName: "ExitPlanMode" };
  assert.equal(withPlanExitDeniedTurnStop({ success: true } as never, gate).success, true);
  const stop = withPlanExitDeniedTurnStop(denied("Permission denied for ExitPlanMode"), gate);
  assert.equal(stop.turnControl?.reason, "plan_exit_denied");
  const blank = withPlanExitDeniedTurnStop(denied("   "), gate);
  assert.equal(blank.turnControl?.reason, "plan_exit_denied");
  const follow = withPlanExitDeniedTurnStop(denied("user wants changes"), gate);
  assert.equal(follow.followUpUserInput?.input, "user wants changes");
  assert.equal(follow.turnControl, undefined);
  const notPlan = withPlanExitDeniedTurnStop(denied("user wants changes"), {
    mode: "build" as never,
    toolName: "ExitPlanMode",
  });
  assert.equal(notPlan.turnControl, undefined);
});

test("B12 workflow refine denial only adds follow-up input", () => {
  const result = {
    success: false,
    error: {
      type: "permission_denied",
      reasonSource: "workflow_refine_feedback",
      message: "fix it",
    },
  } as never;
  const refined = withWorkflowRefineDeniedFollowUp(result, { toolName: "CreateWorkflow" });
  assert.equal(refined.followUpUserInput?.input, "fix it");
  assert.equal(Object.hasOwn(refined.turnControl ?? {}, "reason"), false);
  assert.equal(withWorkflowRefineDeniedFollowUp(result, { toolName: "Read" }), result);
  const sameSource = {
    success: false,
    error: { type: "permission_denied", reasonSource: "plan_approval_feedback", message: "x" },
  } as never;
  assert.equal(
    withWorkflowRefineDeniedFollowUp(sameSource, { toolName: "AmendWorkflow" }),
    sameSource,
  );
});

test("B13 terminal tool stop requires a strict metadata flag", () => {
  const entry = (stopTurnOnSuccess: unknown) => ({ metadata: { stopTurnOnSuccess } }) as never;
  const success = { success: true } as never;
  assert.equal(
    withTerminalToolTurnStop({ success: false } as never, { entry: entry(true) }).success,
    false,
  );
  assert.equal(withTerminalToolTurnStop(success, { entry: entry(1) }), success);
  assert.equal(withTerminalToolTurnStop(success, { entry: entry(undefined) }), success);
  assert.equal(
    withTerminalToolTurnStop(success, { entry: entry(true) }).turnControl?.reason,
    "subagent_terminal",
  );
});

test("B14 telemetry wrapper finishes the span on the right outcome", async () => {
  const calls: string[] = [];
  const scope = {
    run: (fn: () => Promise<unknown>) => fn(),
    finishCancelled: (reason: string) => calls.push(`cancelled:${reason}`),
    finishFailed: (a: string, b: string, error: unknown) =>
      calls.push(`failed:${a}:${b}:${(error as Error).message}`),
  };
  const deps = { agentTelemetry: { startTool: () => scope } } as never;
  const boom = new Error("boom");
  await assert.rejects(
    runToolCallWithTelemetry(
      deps,
      { id: "c1", name: "Read", input: {} } as never,
      { signal: { aborted: true } } as never,
      async () => {
        throw boom;
      },
    ),
    (error) => error === boom,
  );
  assert.deepEqual(calls, ["cancelled:abort_signal"]);

  calls.length = 0;
  await assert.rejects(
    runToolCallWithTelemetry(
      deps,
      { id: "c1", name: "Read", input: {} } as never,
      undefined,
      async () => {
        throw boom;
      },
    ),
    (error) => error === boom,
  );
  assert.deepEqual(calls, ["failed:unhandled:unknown:boom"]);

  calls.length = 0;
  const seen: unknown[] = [];
  await runToolCallWithTelemetry(
    deps,
    { id: "c1", name: "Read", input: {} } as never,
    undefined,
    async (telemetry) => {
      seen.push(telemetry);
      return { success: true } as never;
    },
  );
  assert.equal(seen[0], scope);

  await runToolCallWithTelemetry(
    { agentTelemetry: { startTool: () => undefined } } as never,
    { id: "c1", name: "Read", input: {} } as never,
    undefined,
    async (telemetry) => {
      seen.push(telemetry);
      return { success: true } as never;
    },
  );
  assert.equal(seen[1], undefined);
});

test("B15 default model status sink never overrides a caller sink", async () => {
  const published: unknown[] = [];
  const deps = {
    sessionId: "s1",
    turnId: "t1",
    traceId: "tr1",
    emitEvent: async (event: unknown) => void published.push(event),
  };
  const sink = createToolModelStatusSink(deps as never);
  assert.ok(sink);
  await sink!.publish({ kind: "model_request_queued" } as never);
  assert.equal(published.length, 1);
  assert.equal((published[0] as { payload: unknown }).payload.kind, "model_request_queued");
  assert.equal(
    createToolModelStatusSink({ sessionId: "s1", emitEvent: undefined } as never),
    undefined,
  );
  assert.equal(withDefaultToolModelStatusSink(undefined, sink), undefined);
});

test("B79 hasSnapshotProvider/hasDirectWaiter resolve per tool name", async () => {
  const mod =
    await import("../../../../apps/cli/packages/core/src/tool/executor/background-tracker-projection.js");
  const deps = {
    subagentPort: { getTask: async () => ({ status: "running" }) },
    executionPort: {
      getBackgroundTask: async () => ({ status: "running" }),
      waitForBackgroundTask: async () => undefined,
    },
  } as never;
  assert.equal(mod.hasSnapshotProvider(deps, "Agent"), true);
  assert.equal(mod.hasSnapshotProvider(deps, "Task"), true);
  assert.equal(mod.hasSnapshotProvider(deps, "Bash"), true);
  assert.equal(mod.hasSnapshotProvider(deps, "Unknown"), true);
  assert.equal(mod.hasSnapshotProvider({} as never, "Unknown"), false);
  assert.equal(mod.hasDirectWaiter(deps, "Bash"), true);
  assert.equal(mod.hasDirectWaiter(deps, "Agent"), false);
  assert.equal(await mod.readTaskSnapshot({} as never, "Bash", "t"), undefined);
  assert.equal(await mod.waitForTaskSnapshot({} as never, "Bash", "t"), undefined);
});

test("B80/B81/B82 projection helpers keep the documented semantics", () => {
  assert.equal(field({ a: undefined }, "a"), undefined);
  assert.equal(typeof field({}, "toString"), "function");
  assert.equal(stringField({ a: 1 }, "a"), undefined);
  assert.equal(snapshotString({ a: "x" }, "a"), "x");
  assert.equal(snapshotString({ a: 1 }, "a"), undefined);

  const call = { id: "c", name: "Workflow", input: { description: "from input" } } as never;
  assert.equal(workflowSubject(call, "task-1", { name: "snapshot" } as never), "from input");
  assert.equal(
    workflowSubject({ id: "c", name: "Workflow", input: null } as never, "task-1"),
    "task-1",
  );

  assert.equal(errorMessage("x"), "x");
  assert.equal(errorMessage(new Error("y")), "y");
  const a = {
    pid: 1,
    stdoutBytes: 2,
    stderrBytes: 3,
    stdoutTail: "a",
    stderrTail: "b",
    description: "d1",
  };
  const b = { ...a, description: "d2" };
  assert.equal(runningSignature(a as never), runningSignature(b as never));
  assert.notEqual(
    runningSignature(a as never),
    runningSignature({ ...a, stdoutBytes: 9 } as never),
  );
});

test("B83 taskPayload projects kind, cancellable and terminalId", () => {
  const deps = { executionPort: { cancelBackgroundTask: async () => undefined } } as never;
  const bash = { id: "call-1", name: "Bash", input: { command: "sleep" } } as never;
  const running = taskPayload(deps, bash, "t1", "running", {}, undefined);
  assert.equal(running.taskKind, "bash");
  assert.equal(running.cancellable, true);
  assert.equal(running.terminalId, "t1");
  assert.equal(running.command, "sleep");
  assert.equal(taskPayload(deps, bash, "t1", "completed", {}, undefined).cancellable, false);
  const workflow = taskPayload(
    deps,
    { id: "call-2", name: "CreateWorkflow", input: { description: "wf" } } as never,
    "t2",
    "running",
    {},
    undefined,
  );
  assert.equal(workflow.taskKind, "workflow");
  assert.equal(workflow.description, "wf");
  const subagent = taskPayload(
    deps,
    { id: "call-3", name: "Agent", input: {} } as never,
    "t3",
    "running",
    {},
    undefined,
  );
  assert.equal(subagent.taskKind, "subagent");
});

test("B84 emitBackgroundTaskEvent forwards type, payload reference and trace", async () => {
  const sink = eventSink();
  const payload = { taskId: "t1" };
  await emitBackgroundTaskEvent(
    sink.deps(),
    "background_task_started" as never,
    payload,
    trace,
    "turn-1",
  );
  const event = sink.events.at(-1)!;
  assert.equal(event.type, "background_task_started");
  assert.equal(event.payload, payload);
  assert.equal(event.sequenceNumber, 0);
  assert.equal(event.traceId, "trace-1");
  assert.equal(event.turnId, "turn-1");
});

test("B60/B61 tracker filters and dedupes task ids", async () => {
  const sink = eventSink();
  const deps = sink.deps({ runtimeTaskRegistry: undefined });
  const tracker = new BackgroundTaskTracker(deps);
  const call = { id: "c1", name: "Bash", input: { command: "x" } } as never;
  await tracker.trackBackgroundTask(call, null, trace, undefined);
  await tracker.trackBackgroundTask(call, [], trace, undefined);
  await tracker.trackBackgroundTask(call, { status: "async_launched" }, trace, undefined);
  assert.equal(sink.events.length, 0);
  await tracker.trackBackgroundTask(call, { status: "backgrounded" }, trace, undefined);
  assert.equal(sink.events.length, 0);
  await tracker.trackBackgroundTask(
    call,
    { status: "backgrounded", backgroundTaskId: "t1" },
    trace,
    undefined,
  );
  assert.equal(sink.events.length, 2);
  assert.equal(sink.events[0]!.type, "background_task_started");
  assert.equal(sink.events[1]!.type, "background_task_completed");
  assert.equal(sink.events[1]!.payload.status, "lost");
  // lost 路径在收口时把 id 从 trackedTaskIds 删除，所以同 id 再调用会重新走一遍（B63）。
  await tracker.trackBackgroundTask(
    call,
    { status: "backgrounded", backgroundTaskId: "t1" },
    trace,
    undefined,
  );
  assert.equal(sink.events.length, 4);
});

test("B62 tracker rolls back when the started event fails", async () => {
  let fail = true;
  const events: unknown[] = [];
  const registered: string[] = [];
  const removed: string[] = [];
  const deps = {
    sessionId: "s1",
    runtimeTaskRegistry: {
      get: () => undefined,
      register: (entry: { taskId: string }) => void registered.push(entry.taskId),
      update: () => undefined,
      remove: (id: string) => void removed.push(id),
    },
    emitEvent: async (event: unknown) => {
      if (fail) {
        fail = false;
        throw new Error("emit down");
      }
      events.push(event);
    },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  } as never;
  const tracker = new BackgroundTaskTracker(deps);
  const call = { id: "c1", name: "Bash", input: {} } as never;
  await assert.rejects(
    tracker.trackBackgroundTask(
      call,
      { status: "backgrounded", backgroundTaskId: "t9" },
      trace,
      undefined,
    ),
    /emit down/,
  );
  assert.deepEqual(registered, ["t9"]);
  assert.deepEqual(removed, ["t9"]);
  await tracker.trackBackgroundTask(
    call,
    { status: "backgrounded", backgroundTaskId: "t9" },
    trace,
    undefined,
  );
  assert.ok(events.length >= 1);
});

test("B63/B65 tracker reaches a terminal state through the snapshot poll", async () => {
  const sink = eventSink();
  const snapshots: unknown[] = [{ status: "completed", pid: 7 }];
  const deps = sink.deps({
    executionPort: { getBackgroundTask: async () => snapshots.shift() ?? { status: "completed" } },
    runtimeTaskRegistry: undefined,
  });
  const tracker = new BackgroundTaskTracker(deps);
  await tracker.trackBackgroundTask(
    { id: "c1", name: "Bash", input: {} } as never,
    { status: "backgrounded", backgroundTaskId: "t1" },
    trace,
    undefined,
  );
  assert.deepEqual(
    sink.events.map((event) => event.type),
    ["background_task_started", "background_task_completed"],
  );
  assert.equal(sink.events[1]!.payload.status, "completed");
});

test("B67 tracker keeps polling when the waiter rejects but a snapshot source exists", async () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const sink = eventSink();
    const warnings: unknown[][] = [];
    let snapshot: Record<string, unknown> = { status: "running", pid: 1 };
    const deps = sink.deps({
      executionPort: {
        getBackgroundTask: async () => snapshot,
        waitForBackgroundTask: async () => {
          throw new Error("wait down");
        },
      },
      runtimeTaskRegistry: undefined,
      logger: {
        warn: (...args: unknown[]) => void warnings.push(args),
        info: () => undefined,
        debug: () => undefined,
      },
    });
    const tracker = new BackgroundTaskTracker(deps);
    await tracker.trackBackgroundTask(
      { id: "c1", name: "Bash", input: {} } as never,
      { status: "backgrounded", backgroundTaskId: "t1" },
      trace,
      undefined,
    );
    await new Promise((resolve) => setImmediate(resolve));
    // 等待者被拒绝 → 写 warn；有快照来源时追踪不停止。
    assert.ok(warnings.some((entry) => String(entry[0]).includes("Background task wait failed")));
    assert.equal(
      sink.events.filter((event) => event.type === "background_task_completed").length,
      0,
    );

    // 时钟推进两轮：仍在轮询（快照一直是 running），没有终态事件。
    mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      sink.events.filter((event) => event.type === "background_task_completed").length,
      0,
    );

    // 快照变终态后，同一条追踪仍能收口：证明它没有在等待者失败时被停掉。
    snapshot = { status: "completed", pid: 1 };
    mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      sink.events.filter((event) => event.type === "background_task_completed").length,
      1,
    );
    assert.equal(
      sink.events.filter((event) => event.type === "background_task_completed")[0]!.payload.status,
      "completed",
    );
  } finally {
    mock.timers.reset();
  }
});

test("B87 workflow manifest bounds result, error and duration", async () => {
  const { enqueueTerminalNotification } =
    await import("../../../../apps/cli/packages/core/src/tool/executor/background-tracker-notification.js");
  const queued: { originMeta?: { workflowNotification?: Record<string, unknown> } }[] = [];
  const registry = new Map<string, Record<string, unknown>>();
  const deps = {
    sessionId: "s1",
    runtimeScope: "main",
    runtimeTaskRegistry: {
      get: (id: string) => registry.get(id),
      register: (entry: Record<string, unknown>) => void registry.set(String(entry.taskId), entry),
      update: (id: string, fn: (current: Record<string, unknown>) => Record<string, unknown>) => {
        const current = registry.get(id);
        if (!current) return undefined;
        const next = fn(current);
        registry.set(id, next);
        return next;
      },
      remove: (id: string) => void registry.delete(id),
    },
    enqueueBackgroundTaskNotification: (notification: never) => void queued.push(notification),
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined },
  } as never;
  registry.set("t1", { notified: false });
  enqueueTerminalNotification(
    deps,
    { id: "c1", name: "CreateWorkflow", input: { description: "wf" } } as never,
    "t1",
    "completed",
    trace,
    {
      status: "completed",
      output: { answer: 42 },
      error: "boom",
      startedAt: new Date(0),
      completedAt: new Date(5),
      reports: ["a"],
      artifacts: [{ id: "a1", kind: "file", version: 1 }],
    } as never,
    {},
  );
  assert.equal(queued.length, 1);
  const manifest = queued[0]!.originMeta?.workflowNotification;
  assert.ok(manifest);
  assert.equal(manifest!.kind, "terminal");
  assert.equal(manifest!.status, "completed");
  assert.equal(manifest!.summary, "wf");
  assert.equal(manifest!.durationMs, 5);
  assert.equal(manifest!.resultTruncated, undefined);
  assert.equal(manifest!.resultForm, "json");
  assert.equal(manifest!.error, "boom");

  registry.set("t2", { notified: false });
  enqueueTerminalNotification(
    deps,
    { id: "c2", name: "CreateWorkflow", input: { description: "wf" } } as never,
    "t2",
    "running",
    trace,
    { status: "running" } as never,
    {},
  );
  const noManifest = queued.at(-1)!.originMeta?.workflowNotification;
  assert.equal(noManifest, undefined);
});

test("B88 interface.md export names match the source, and stubs mirror them", async () => {
  const { readFileSync } = await import("node:fs");
  const contractRoot = new URL("../", import.meta.url);
  const repoRoot = new URL("../../../../", import.meta.url);
  const interfaceText = readFileSync(new URL("interface.md", contractRoot), "utf8");
  const files = [...interfaceText.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]!);
  assert.equal(files.length, 32);
  const missing: string[] = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, repoRoot), "utf8");
    const names = new Set(
      [
        ...source.matchAll(
          /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z0-9_$]+)/gm,
        ),
      ].map((match) => match[1]!),
    );
    const stub = readFileSync(new URL(`stubs/${file}`, contractRoot), "utf8");
    const stubNames = new Set(
      [
        ...stub.matchAll(
          /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z0-9_$]+)/gm,
        ),
      ].map((match) => match[1]!),
    );
    for (const name of names) if (!stubNames.has(name)) missing.push(`${file}:${name}`);
  }
  assert.deepEqual(missing, []);
});

test("B1/B3 createToolExecutor builds an executor that exposes the four entry points", async () => {
  const executor = createToolExecutor({
    registry: {} as never,
    permissionService: {} as never,
    emitEvent: async () => {},
    sessionId: "s1",
  } as never);
  assert.ok(executor instanceof ToolExecutorImpl);
  assert.equal(typeof executor.execute, "function");
  assert.equal(typeof executor.executeBatch, "function");
  assert.equal(typeof executor.executeSchedule, "function");
  assert.equal(typeof executor.trackExternalBackgroundTask, "function");
  const batch = Promise.resolve(executor.executeBatch([] as never));
  assert.ok(batch instanceof Promise);
  await batch;
});

test("B70/B71 constants stay at the documented bounds", () => {
  assert.equal(WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES, 8);
  assert.equal(WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES, 32);
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, kind: "file", version: 1 }));
  assert.equal(buildWorkflowArtifactsManifestSection(ten as never)?.artifacts.length, 8);
  assert.equal(buildWorkflowArtifactsManifestSection(ten as never)?.artifactsTruncated, true);
});
