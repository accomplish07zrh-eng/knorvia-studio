// SPDX-License-Identifier: Apache-2.0
// core-tool-01 contract tests, part 4: executor dependency defaults (B2) and the
// background tracker timers (B64 poll signature dedup, B66 subagent Bash max runtime).
// Timers are driven by node:test mock timers, so nothing here sleeps or waits on wall time.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { BackgroundTaskTracker } from "../../../../apps/cli/packages/core/src/tool/executor/background-tasks.js";
import { createToolExecutor } from "../../../../apps/cli/packages/core/src/tool/executor/impl.js";

const trace = { traceId: "trace-1", sessionId: "s1" } as never;
const bashCall = { id: "c1", name: "Bash", input: { command: "x" } } as never;
const backgrounded = { status: "backgrounded", backgroundTaskId: "t1" };

// 执行器把 options 归一化进私有 deps；契约只要求这些派生值可观察。
function depsOf(options: Record<string, unknown>): Record<string, any> {
  const executor = createToolExecutor({
    registry: {} as never,
    permissionService: {} as never,
    emitEvent: async () => {},
    sessionId: "s1",
    ...options,
  } as never);
  return (executor as unknown as { deps: Record<string, any> }).deps;
}

function loggingSink() {
  const warnings: unknown[][] = [];
  const infos: unknown[][] = [];
  const debug: unknown[][] = [];
  return {
    warnings,
    infos,
    debug,
    logger: {
      warn: (...args: unknown[]) => void warnings.push(args),
      info: (...args: unknown[]) => void infos.push(args),
      debug: (...args: unknown[]) => void debug.push(args),
    },
  };
}

function eventSink() {
  const events: Record<string, any>[] = [];
  return {
    events,
    types: () => events.map((event) => event.type),
    emitEvent: async (event: Record<string, any>) => void events.push(event),
  };
}

// 假定时器只驱动定时器；微任务用真实的 setImmediate 冲干净。
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("B2 executor deps resolve the documented default fallback chain", () => {
  const bare = depsOf({});
  assert.equal(bare.getWorkingDirectory(), ".");
  assert.equal(bare.getWorkspaceRoot(), ".");
  assert.equal(bare.getMode(), "build");
  assert.equal(bare.runtimeScope, "main");
  assert.equal(bare.maxConcurrency, 10);
  assert.equal(bare.defaultTimeoutMs, 300000);
  assert.ok(bare.readFileState instanceof Map);

  // workingDirectory 字面量同时喂给 cwd 与 workspace root 的回退链。
  const literal = depsOf({ workingDirectory: "/tmp/x" });
  assert.equal(literal.getWorkingDirectory(), "/tmp/x");
  assert.equal(literal.getWorkspaceRoot(), "/tmp/x");

  // workspaceRoot 优先于 getter，getter 优先于 workingDirectory。
  const rooted = depsOf({
    workspaceRoot: "/w",
    workingDirectory: "/b",
    getWorkingDirectory: () => "/a",
  });
  assert.equal(rooted.getWorkspaceRoot(), "/w");
  assert.equal(
    depsOf({ workingDirectory: "/b", getWorkingDirectory: () => "/a" }).getWorkspaceRoot(),
    "/a",
  );

  // 显式值覆盖默认值；调用方给的 Map 按引用使用。
  const explicit = depsOf({
    mode: "plan",
    runtimeScope: "subagent",
    maxConcurrency: 3,
    defaultTimeoutMs: 1000,
  });
  assert.equal(explicit.getMode(), "plan");
  assert.equal(explicit.runtimeScope, "subagent");
  assert.equal(explicit.maxConcurrency, 3);
  assert.equal(explicit.defaultTimeoutMs, 1000);
  const shared = new Map<string, unknown>();
  assert.equal(depsOf({ readFileState: shared }).readFileState, shared);

  // getter 的异常在调用时传播，不在构造时；回退链每次调用重新求值。
  let calls = 0;
  const throwing = depsOf({
    getWorkingDirectory: () => {
      calls += 1;
      throw new Error("cwd down");
    },
  });
  assert.equal(calls, 0);
  assert.throws(() => throwing.getWorkspaceRoot(), /cwd down/);
  assert.throws(() => throwing.getWorkspaceRoot(), /cwd down/);
  assert.equal(calls, 2);
});

test("B64 poll publishes running once per signature and survives read errors", async () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const sink = eventSink();
    const logs = loggingSink();
    let snapshot: Record<string, unknown> = { status: "running", pid: 1 };
    let failingReads = 0;
    const deps = {
      sessionId: "s1",
      emitEvent: sink.emitEvent,
      runtimeTaskRegistry: undefined,
      logger: logs.logger,
      executionPort: {
        getBackgroundTask: async () => {
          if (failingReads > 0) {
            failingReads -= 1;
            throw new Error("poll down");
          }
          return snapshot;
        },
      },
    } as never;
    const tracker = new BackgroundTaskTracker(deps);
    await tracker.trackBackgroundTask(bashCall, backgrounded, trace, undefined);
    await flush();
    // 建立追踪时立即跑一次 poll。
    assert.deepEqual(sink.types(), ["background_task_started", "background_task_updated"]);
    assert.equal(sink.events[1]!.payload.status, "running");

    // 相同签名连续两轮：不发第二条「运行中」事件。
    mock.timers.tick(1000);
    await flush();
    mock.timers.tick(1000);
    await flush();
    assert.equal(sink.types().filter((type) => type === "background_task_updated").length, 1);

    // 签名变化（pid 变）：发第二条。
    snapshot = { status: "running", pid: 2 };
    mock.timers.tick(1000);
    await flush();
    assert.equal(sink.types().filter((type) => type === "background_task_updated").length, 2);

    // 读快照抛错：写 warn，追踪继续，不终止。
    failingReads = 1;
    mock.timers.tick(1000);
    await flush();
    assert.ok(
      logs.warnings.some((entry) => String(entry[0]).includes("Background task polling failed")),
    );
    assert.equal(sink.types().includes("background_task_completed"), false);

    // 抛错后的下一轮仍能发布新签名。
    snapshot = { status: "running", pid: 3 };
    mock.timers.tick(1000);
    await flush();
    assert.equal(sink.types().filter((type) => type === "background_task_updated").length, 3);

    // 终态收口后 cleanup 清掉轮询定时器：再走时钟不会再有事件。
    snapshot = { status: "completed", pid: 3 };
    mock.timers.tick(1000);
    await flush();
    assert.equal(sink.types().filter((type) => type === "background_task_completed").length, 1);
    const settled = sink.types().length;
    mock.timers.tick(5000);
    await flush();
    assert.equal(sink.types().length, settled);
  } finally {
    mock.timers.reset();
  }
});

test("B66 subagent background Bash arms and clears the max-runtime cancel", async () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const cancelled: string[] = [];
    const logs = loggingSink();
    // 最长运行定时器与轮询定时器同时建立，所以追踪必须有一个快照来源，
    // 否则 trackBackgroundTask 会在「没有快照也没有等待者」时直接收口返回。
    const running = { getBackgroundTask: async () => ({ status: "running", pid: 1 }) };
    const deps = {
      sessionId: "s1",
      runtimeScope: "subagent",
      subagentBackgroundBashMaxMs: 5000,
      emitEvent: async () => {},
      runtimeTaskRegistry: undefined,
      logger: logs.logger,
      executionPort: {
        ...running,
        cancelBackgroundTask: async (taskId: string) => void cancelled.push(taskId),
      },
    } as never;
    const tracker = new BackgroundTaskTracker(deps);
    await tracker.trackBackgroundTask(bashCall, backgrounded, trace, undefined);
    await flush();

    // 到点前不取消。
    mock.timers.tick(4999);
    await flush();
    assert.deepEqual(cancelled, []);

    // 到点：按 taskId 取消一次，并写 max_runtime_exceeded。
    mock.timers.tick(1);
    await flush();
    assert.deepEqual(cancelled, ["t1"]);
    assert.ok(
      logs.warnings.some(
        (entry) =>
          (entry[1] as { event?: string } | undefined)?.event ===
          "background_task.subagent_bash.max_runtime_exceeded",
      ),
    );

    // 取消失败被吞成 warn（cancel_failed），不向外传播。
    const failing = {
      sessionId: "s1",
      runtimeScope: "subagent",
      subagentBackgroundBashMaxMs: 1000,
      emitEvent: async () => {},
      runtimeTaskRegistry: undefined,
      logger: logs.logger,
      executionPort: {
        ...running,
        cancelBackgroundTask: async () => {
          throw new Error("cancel down");
        },
      },
    } as never;
    await new BackgroundTaskTracker(failing).trackBackgroundTask(
      bashCall,
      backgrounded,
      trace,
      undefined,
    );
    mock.timers.tick(1000);
    await flush();
    assert.ok(
      logs.warnings.some(
        (entry) =>
          (entry[1] as { event?: string } | undefined)?.event ===
          "background_task.subagent_bash.cancel_failed",
      ),
    );

    // 非 subagent 作用域不建立该定时器。
    const mainScope = {
      sessionId: "s1",
      runtimeScope: "main",
      subagentBackgroundBashMaxMs: 1000,
      emitEvent: async () => {},
      runtimeTaskRegistry: undefined,
      logger: logs.logger,
      executionPort: {
        ...running,
        cancelBackgroundTask: async (taskId: string) => void cancelled.push(taskId),
      },
    } as never;
    await new BackgroundTaskTracker(mainScope).trackBackgroundTask(
      bashCall,
      backgrounded,
      trace,
      undefined,
    );
    mock.timers.tick(10000);
    await flush();
    assert.deepEqual(cancelled, ["t1"]);

    // 终态收口时 cleanup 清掉最长运行定时器。
    const terminal = {
      sessionId: "s1",
      runtimeScope: "subagent",
      subagentBackgroundBashMaxMs: 5000,
      emitEvent: async () => {},
      runtimeTaskRegistry: undefined,
      logger: logs.logger,
      executionPort: {
        getBackgroundTask: async () => ({ status: "completed", pid: 9 }),
        cancelBackgroundTask: async (taskId: string) => void cancelled.push(taskId),
      },
    } as never;
    await new BackgroundTaskTracker(terminal).trackBackgroundTask(
      bashCall,
      backgrounded,
      trace,
      undefined,
    );
    await flush();
    mock.timers.tick(20000);
    await flush();
    assert.deepEqual(cancelled, ["t1"]);
  } finally {
    mock.timers.reset();
  }
});
