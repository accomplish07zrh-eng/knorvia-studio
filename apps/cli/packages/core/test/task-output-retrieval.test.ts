// Synthetic tasks and in-memory ports only; never reads user output files.
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { taskOutputToolEntry as source } from "../src/tool/handlers/task-output.js";
import { taskOutputToolEntry as emitted } from "../dist/tool/handlers/task-output.js";
import { InMemoryRuntimeTaskRegistry } from "../src/runtime-task/registry.js";
import type { ToolExecutionContext } from "../src/tool/types.js";
const task = (status = "completed", extra: any = {}) => ({
  taskId: "task",
  type: "local_dynamic_workflow",
  description: "synthetic",
  status,
  resultText: "result",
  ...extra,
});
function fixture(initial: any = task()) {
  let current = initial;
  const calls: any[] = [];
  const controller = new AbortController();
  const registry = {
    get(id: string) {
      calls.push(["get", id]);
      return current;
    },
    update(id: string, patcher: any) {
      calls.push(["update", id]);
      if (current) current = patcher(current);
      return current;
    },
  };
  const events: any[] = [];
  const context = {
    toolCallId: "call",
    traceId: "trace",
    sessionId: "session",
    turnId: "turn",
    abortSignal: controller.signal,
    runtimeTaskRegistry: registry,
    emitEvent: async (event: any) => {
      calls.push(["progress"]);
      events.push(event);
    },
  } as unknown as ToolExecutionContext;
  return {
    context,
    registry,
    controller,
    calls,
    events,
    get current() {
      return current;
    },
    set current(v: any) {
      current = v;
    },
  };
}
const nonblocking = { task_id: "task", block: false };
assert.notEqual(source, emitted);
for (const [surface, entry] of [
  ["source", source],
  ["emitted", emitted],
] as const) {
  for (const input of [
    {},
    null,
    { task_id: 1 },
    { task_id: "task", extra: true },
    { task_id: "task", timeout: -1 },
    { task_id: "task", timeout: 600001 },
  ]) {
    test(`${surface} schema admission ${JSON.stringify(input)}`, async () => {
      const f = fixture();
      await assert.rejects(entry.handler(input, f.context), (e: any) => e.name === "ZodError");
      assert.deepEqual(f.calls, []);
    });
  }
  test(`${surface} empty ID wins over absent registry`, async () => {
    const f = fixture();
    f.context.runtimeTaskRegistry = undefined;
    const expected = { result: false, errorCode: 1, message: "Task ID is required" };
    assert.deepEqual(await entry.handler({ task_id: "" }, f.context), expected);
    assert.deepEqual(entry.validateInput!({ task_id: "" }, {} as any), expected);
  });
  test(`${surface} legal ID without registry gives configuration error`, async () => {
    const f = fixture();
    f.context.runtimeTaskRegistry = undefined;
    assert.deepEqual(entry.validateInput!({ task_id: "task" }, {} as any), { result: true });
    await assert.rejects(entry.handler(nonblocking, f.context), (e: any) => {
      assert.equal(e.type, CoreErrorType.ConfigurationError);
      assert.equal(e.recoverable, false);
      assert.deepEqual(e.context, { toolCallId: "call", toolName: "TaskOutput" });
      return true;
    });
  });
  for (const disappearAt of [1, 2]) {
    test(`${surface} missing task on read ${disappearAt} gives exact failure`, async () => {
      const f = fixture();
      let reads = 0;
      f.registry.get = (id) => {
        f.calls.push(["get", id]);
        return ++reads === disappearAt ? undefined : task();
      };
      assert.deepEqual(await entry.handler(nonblocking, f.context), {
        result: false,
        errorCode: 2,
        message: "No task found with ID: task",
      });
      assert.equal(reads, disappearAt);
      assert.equal(f.events.length, 0);
    });
  }
  for (const status of [
    "running",
    "pending",
    "completed",
    "failed",
    "cancelled",
    "killed",
    "stopped",
    "lost",
    "future_status",
  ]) {
    for (const block of [false, true]) {
      test(`${surface} ${status} block=${block} projects then claims only terminal`, async () => {
        const f = fixture(task(status));
        const result: any = await entry.handler({ task_id: "task", block, timeout: 0 }, f.context);
        const active = status === "running" || status === "pending";
        assert.equal(
          result.retrieval_status,
          active ? (block ? "timeout" : "not_ready") : "success",
        );
        assert.deepEqual(result.task, {
          task_id: "task",
          task_type: "local_dynamic_workflow",
          description: "synthetic",
          status,
          output: "result",
          result: "result",
        });
        assert.equal(f.current.notified, active ? undefined : true);
        assert.deepEqual(f.calls, [
          ["get", "task"],
          ["get", "task"],
          ...(block ? [["progress"], ["get", "task"]] : []),
          ...(!active ? [["update", "task"]] : []),
        ]);
        if (block) {
          const e = f.events[0];
          assert.match(e.id, /^[0-9a-f-]{36}$/);
          assert.ok(e.timestamp instanceof Date);
          assert.equal(e.type, SessionEventType.ToolCallProgress);
          assert.equal(e.traceId, "trace");
          assert.equal(e.sessionId, "session");
          assert.equal(e.turnId, "turn");
          assert.equal(e.sequenceNumber, 0);
          assert.deepEqual(e.payload, { toolCallId: "call", toolName: "TaskOutput", elapsedMs: 0 });
        }
      });
    }
  }
  test(`${surface} progress is awaited and its failure does not claim notification`, async () => {
    const f = fixture();
    const failure = new Error("synthetic progress");
    let reject!: (e: Error) => void;
    f.context.emitEvent = () =>
      new Promise((_, r) => {
        reject = r;
      });
    const pending = entry.handler({ task_id: "task", timeout: 0 }, f.context);
    await Promise.resolve();
    assert.deepEqual(f.calls, [
      ["get", "task"],
      ["get", "task"],
    ]);
    reject(failure);
    await assert.rejects(pending, (e) => e === failure);
    assert.equal(f.current.notified, undefined);
  });
  test(`${surface} task disappearance after waiting progress returns timeout/null`, async () => {
    const f = fixture();
    f.context.emitEvent = async () => {
      f.current = undefined;
    };
    assert.deepEqual(await entry.handler({ task_id: "task", timeout: 0 }, f.context), {
      retrieval_status: "timeout",
      task: null,
    });
    assert.equal(f.calls.filter((c) => c[0] === "update").length, 0);
  });
  test(`${surface} owner reference is reread after asynchronous progress`, async () => {
    const f = fixture();
    const next = fixture(task("completed", { resultText: "new owner" }));
    f.context.emitEvent = async () => {
      f.context.runtimeTaskRegistry = next.registry as any;
    };
    const result: any = await entry.handler({ task_id: "task", timeout: 0 }, f.context);
    assert.equal(result.task.output, "new owner");
    assert.equal(next.current.notified, true);
    assert.equal(f.current.notified, undefined);
  });
  test(`${surface} cancelled terminal projection never claims delivery`, async () => {
    const f = fixture(task("completed", { type: "local_bash", resultText: undefined }));
    let finish!: (v: any) => void;
    f.context.executionPort = {
      getBackgroundTask: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as any;
    const pending = entry.handler(nonblocking, f.context);
    await Promise.resolve();
    assert.equal(f.current.notified, undefined);
    f.controller.abort();
    finish(undefined);
    await assert.rejects(pending, (e: any) => e.name === "AbortError");
    assert.equal(f.current.notified, undefined);
  });
  test(`${surface} failed projection preserves exception and notification eligibility`, async () => {
    const f = fixture(task("completed", { type: "local_bash" }));
    const failure = new Error("synthetic projection");
    f.context.executionPort = {
      getBackgroundTask: async () => {
        throw failure;
      },
    } as any;
    await assert.rejects(entry.handler(nonblocking, f.context), (e) => e === failure);
    assert.equal(f.current.notified, undefined);
  });
  test(`${surface} successful projection updates current snapshot without clobbering fields`, async () => {
    const f = fixture(task("completed", { type: "local_bash" }));
    let finish!: (v: any) => void;
    f.context.executionPort = {
      getBackgroundTask: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as any;
    const pending = entry.handler(nonblocking, f.context);
    f.current = { ...f.current, description: "newer", extraOwnedField: "preserve" };
    finish(undefined);
    await pending;
    assert.equal(f.current.description, "newer");
    assert.equal(f.current.extraOwnedField, "preserve");
    assert.equal(f.current.notified, true);
  });
  test(`${surface} already notified stays identical and repeated reads still deliver`, async () => {
    const initial = task("completed", { notified: true });
    const f = fixture(initial);
    const first = await entry.handler(nonblocking, f.context);
    const second = await entry.handler(nonblocking, f.context);
    assert.deepEqual(first, second);
    assert.equal(f.current, initial);
    assert.equal(f.calls.filter((c) => c[0] === "update").length, 2);
  });
  test(`${surface} notification owner failure propagates`, async () => {
    const f = fixture();
    const failure = new Error("synthetic owner update");
    f.registry.update = () => {
      throw failure;
    };
    await assert.rejects(entry.handler(nonblocking, f.context), (e) => e === failure);
  });
  test(`${surface} live memory registry receives notification only after delivery`, async () => {
    const f = fixture();
    const registry = new InMemoryRuntimeTaskRegistry();
    registry.register(task() as any);
    f.context.runtimeTaskRegistry = registry;
    const result: any = await entry.handler(nonblocking, f.context);
    assert.equal(result.retrieval_status, "success");
    assert.equal(registry.get("task")?.notified, true);
    assert.equal(registry.get("task")?.branchGeneration, 0);
  });
  test(`${surface} semantic false avoids progress and zero timeout sees final terminal snapshot`, async () => {
    const f = fixture(task("pending"));
    const result: any = await entry.handler({ task_id: "task", block: "false" }, f.context);
    assert.equal(result.retrieval_status, "not_ready");
    assert.equal(f.events.length, 0);
    f.context.emitEvent = async () => {
      f.current = task();
    };
    const terminal: any = await entry.handler(
      { task_id: "task", block: "true", timeout: 0 },
      f.context,
    );
    assert.equal(terminal.retrieval_status, "success");
  });
  test(`${surface} polls at 100ms and recognizes completion before deadline`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
    const f = fixture(task("running"));
    const pending = entry.handler({ task_id: "task", timeout: 250 }, f.context);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(f.calls.filter((c) => c[0] === "get").length, 3);
    f.current = task();
    t.mock.timers.tick(99);
    await Promise.resolve();
    assert.equal(f.current.notified, undefined);
    t.mock.timers.tick(1);
    const result: any = await pending;
    assert.equal(result.retrieval_status, "success");
    assert.equal(f.current.notified, true);
  });
  test(`${surface} polling cancellation does not write notified`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
    const f = fixture(task("running"));
    const pending = entry.handler({ task_id: "task", timeout: 250 }, f.context);
    await Promise.resolve();
    await Promise.resolve();
    f.controller.abort();
    t.mock.timers.tick(100);
    await assert.rejects(pending, (e: any) => e.name === "AbortError");
    assert.equal(f.current.notified, undefined);
  });
}
