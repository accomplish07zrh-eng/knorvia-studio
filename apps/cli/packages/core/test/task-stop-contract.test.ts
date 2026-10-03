// Synthetic owner ports only: these tests never stop real processes or tasks.
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType } from "@knorvia/contracts";
import { taskStopToolEntry as source } from "../src/tool/handlers/task-stop.js";
import { taskStopToolEntry as emitted } from "../dist/tool/handlers/task-stop.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

function fixture(result: any = { ok: true, taskId: "returned" }) {
  const calls: unknown[][] = [];
  const traceContext = { traceId: "trace", spanId: "span" };
  const port = {
    async stopBackgroundTask(this: unknown, ...args: any[]) {
      assert.equal(this, port);
      calls.push(args);
      return result;
    },
  };
  const context = {
    toolCallId: "call",
    traceContext,
    abortSignal: new AbortController().signal,
    backgroundTaskControlPort: port,
  } as unknown as ToolExecutionContext;
  return { context, calls, port, traceContext };
}
assert.notEqual(source, emitted);
for (const [surface, entry] of [
  ["source", source],
  ["emitted", emitted],
] as const) {
  for (const input of [null, { task_id: 1 }, { shell_id: null }, { task_id: "x", extra: 1 }]) {
    test(`${surface} schema admission precedes missing owner ${JSON.stringify(input)}`, async () => {
      const f = fixture();
      f.context.backgroundTaskControlPort = undefined;
      await assert.rejects(entry.handler(input, f.context), (error: any) => {
        assert.equal(error.name, "ZodError");
        return true;
      });
      assert.equal(f.calls.length, 0);
    });
  }
  for (const input of [
    {},
    { task_id: "" },
    { shell_id: "" },
    { task_id: "", shell_id: "fallback" },
  ]) {
    test(`${surface} missing ID never reaches owner ${JSON.stringify(input)}`, async () => {
      const f = fixture();
      f.context.backgroundTaskControlPort = undefined;
      await assert.rejects(entry.handler(input, f.context), (error: any) => {
        assert.equal(error.type, CoreErrorType.ToolExecutionFailed);
        assert.equal(error.message, "Missing required parameter: task_id");
        assert.equal(error.recoverable, true);
        assert.deepEqual(error.context, { toolCallId: "call", code: 1, toolName: "TaskStop" });
        return true;
      });
      assert.equal(f.calls.length, 0);
    });
  }
  test(`${surface} valid ID without owner is configuration error`, async () => {
    const f = fixture();
    f.context.backgroundTaskControlPort = undefined;
    await assert.rejects(entry.handler({ task_id: "request" }, f.context), (error: any) => {
      assert.equal(error.type, CoreErrorType.ConfigurationError);
      assert.equal(error.message, "Background task control is not configured for TaskStop");
      assert.equal(error.recoverable, false);
      assert.deepEqual(error.context, { toolCallId: "call", toolName: "TaskStop" });
      return true;
    });
  });
  for (const [input, id] of [
    [{ task_id: "request", shell_id: "legacy" }, "request"],
    [{ shell_id: "legacy" }, "legacy"],
    [{ task_id: "  " }, "  "],
  ] as const) {
    test(`${surface} one strict model stop for ${JSON.stringify(input)}`, async () => {
      const f = fixture();
      assert.deepEqual(await entry.handler(input, f.context), {
        message: "Successfully stopped task: returned (background_task)",
        task_id: "returned",
        task_type: "background_task",
      });
      assert.deepEqual(f.calls, [
        [id, { initiator: "model", strict: true, traceContext: f.traceContext }],
      ]);
      assert.equal((f.calls[0][1] as any).traceContext, f.traceContext);
    });
  }
  for (const [result, label, type, command] of [
    [{ ok: true, taskId: "r", type: "bash", command: "echo hi" }, "echo hi", "bash", "echo hi"],
    [{ ok: true, taskId: "r", type: "bash", command: "" }, "", "bash", undefined],
    [{ ok: true, taskId: "r", type: "", command: undefined }, "", "", undefined],
    [{ ok: true, taskId: "r", type: undefined, command: "  " }, "  ", "background_task", "  "],
  ] as const) {
    test(`${surface} success projection preserves empty and omitted fields ${JSON.stringify(result)}`, async () => {
      const f = fixture(result);
      const output = await entry.handler({ task_id: "request" }, f.context);
      const expected = {
        message: `Successfully stopped task: r (${label})`,
        task_id: "r",
        task_type: type,
        ...(command === undefined ? {} : { command }),
      };
      assert.deepEqual(output, expected);
      assert.equal(entry.formatModelContent!(output), JSON.stringify(expected));
      assert.equal(f.calls.length, 1);
    });
  }
  for (const reason of [
    "background_task_not_running",
    "background_task_cancel_not_supported",
    "background_task_not_found",
    undefined,
  ]) {
    for (const status of [undefined, "", "finished"]) {
      test(`${surface} refusal ${reason}/${JSON.stringify(status)} has exact context`, async () => {
        const f = fixture({ ok: false, taskId: "returned", reason, status, type: "bash" });
        const base = {
          taskId: "request",
          taskType: "bash",
          toolCallId: "call",
          toolName: "TaskStop",
        };
        const isNotRunning = reason === "background_task_not_running";
        const isUnsupported = reason === "background_task_cancel_not_supported";
        const expected = {
          ...base,
          code: isNotRunning ? 3 : 1,
          ...(isNotRunning ? { status } : isUnsupported ? { reason, status } : { reason }),
        };
        const message = isNotRunning
          ? `Task request is not running (status: ${status ?? "unknown"})`
          : isUnsupported
            ? "Task request cannot be stopped"
            : "No task found with ID: request";
        await assert.rejects(entry.handler({ task_id: "request" }, f.context), (error: any) => {
          assert.equal(error.type, CoreErrorType.ToolExecutionFailed);
          assert.equal(error.message, message);
          assert.equal(error.recoverable, true);
          assert.deepEqual(error.context, expected);
          return true;
        });
        assert.equal(f.calls.length, 1);
      });
    }
  }
  for (const synchronous of [false, true]) {
    test(`${surface} port rejection preserves identity synchronous=${synchronous}`, async () => {
      const f = fixture();
      const marker = new Error("synthetic owner failure");
      let calls = 0;
      f.port.stopBackgroundTask = (() => {
        calls++;
        if (synchronous) throw marker;
        return Promise.reject(marker);
      }) as any;
      await assert.rejects(
        entry.handler({ task_id: "request" }, f.context),
        (error) => error === marker,
      );
      assert.equal(calls, 1);
    });
  }
  test(`${surface} awaits owner and does not deduplicate repeated requests`, async () => {
    const f = fixture();
    let finish!: (v: any) => void;
    let calls = 0;
    f.port.stopBackgroundTask = (() => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    }) as any;
    let settled = false;
    const pending = entry.handler({ task_id: "request" }, f.context).then((v) => {
      settled = true;
      return v;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    finish({ ok: true, taskId: "first" });
    assert.equal(((await pending) as any).task_id, "first");
    const second = entry.handler({ task_id: "request" }, f.context);
    finish({ ok: true, taskId: "second" });
    assert.equal(((await second) as any).task_id, "second");
    assert.equal(calls, 2);
  });
  test(`${surface} existing executor cancellation ownership remains unchanged`, async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    f.context.abortSignal = controller.signal;
    f.context.traceContext = undefined;
    await entry.handler({ task_id: "request" }, f.context);
    assert.deepEqual(f.calls, [
      ["request", { initiator: "model", strict: true, traceContext: undefined }],
    ]);
  });
  test(`${surface} aliases and control metadata remain unchanged`, () => {
    assert.deepEqual(entry.aliases, ["KillShell", "KillBash"]);
    assert.equal(entry.metadata.sideEffectScope, "session");
    assert.equal(entry.permission.permission, "backgroundTask.stop");
    assert.equal(entry.permission.needsApproval, false);
    assert.equal(entry.timeout.defaultMs, 10000);
    assert.equal(entry.cancellation.supported, true);
    assert.throws(() => entry.formatModelContent!({ message: "bad" }));
  });
}
