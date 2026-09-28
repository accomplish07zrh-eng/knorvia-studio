// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { CoreErrorType } from "@knorvia/contracts";
import { executeWithTimeout, ToolDeadline } from "../src/tool/executor/timeout.js";
import { clock, context, deferred, entry } from "./tool-deadline-fixture.js";

test("handler starts synchronously; successful settlement clears timer and abort listener", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const work = deferred<string>();
  const output: string[] = [];
  const promise = executeWithTimeout(
    (input, received) => {
      output.push(input);
      assert.equal(received.abortSignal, controller.signal);
      return work.promise;
    },
    "input",
    context(controller),
    new ToolDeadline(20),
    controller,
    entry(),
  );
  assert.deepEqual(output, ["input"]);
  assert.equal(time.pending.size, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  work.resolve("done");
  assert.equal(await promise, "done");
  assert.equal(time.pending.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  time.tick(100);
  assert.equal(controller.signal.aborted, false);
});

test("asynchronous rejection preserves the original value and releases both resources", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const thrown = { fixture: true };
  const promise = executeWithTimeout(
    async () => {
      throw thrown;
    },
    null,
    context(controller),
    new ToolDeadline(20),
    controller,
    entry(),
  );
  await assert.rejects(promise, (error) => error === thrown);
  assert.equal(time.pending.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("pre-cancel skips handler, deadline and listener registration", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  controller.abort("parent reason");
  await assert.rejects(
    executeWithTimeout(
      async () => assert.fail("handler called"),
      null,
      context(controller),
      new ToolDeadline(20),
      controller,
      entry(),
    ),
    (error: unknown) => {
      const e = error as Error & { type: string; context: unknown };
      assert.equal(e.type, CoreErrorType.ToolCancelled);
      assert.equal(e.message, "fixture cancelled");
      assert.equal(e.context, undefined);
      return true;
    },
  );
  assert.equal(time.pending.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("timeout wins its own abort, reports queued time, and ignores a later handler result", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const work = deferred<string>();
  const deadline = new ToolDeadline(10);
  const promise = executeWithTimeout(
    () => work.promise,
    null,
    context(controller),
    deadline,
    controller,
    entry(),
  );
  time.tick(3);
  deadline.pause();
  time.tick(20);
  deadline.resume();
  time.tick(7);
  await assert.rejects(promise, (error: unknown) => {
    const e = error as Error & { type: string; context: unknown; recoverable: boolean };
    assert.equal(e.type, CoreErrorType.ToolTimeout);
    assert.equal(e.message, "Tool execution timed out after 10ms");
    assert.deepEqual(e.context, {
      cancellation: "required",
      queuedMs: 20,
      timeoutMs: 10,
      toolName: "Fixture",
    });
    assert.equal(e.recoverable, true);
    assert.equal(controller.signal.reason, error);
    return true;
  });
  work.resolve("late");
  await Promise.resolve();
  assert.equal(time.pending.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("running cancellation is contextual and no-timeout tools still listen", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const work = deferred();
  const promise = executeWithTimeout(
    () => work.promise,
    null,
    context(controller),
    new ToolDeadline(undefined),
    controller,
    entry(),
  );
  assert.equal(time.pending.size, 0);
  controller.abort("reason");
  await assert.rejects(promise, (error: unknown) => {
    const e = error as Error & { type: string; context: unknown; recoverable: boolean };
    assert.equal(e.type, CoreErrorType.ToolCancelled);
    assert.deepEqual(e.context, { cancellation: "required", toolName: "Fixture" });
    assert.equal(e.recoverable, true);
    return true;
  });
  work.resolve();
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("a queued abort still beats the separate rejection reaction of an already rejected handler", async (t) => {
  clock(t);
  const controller = new AbortController();
  const error = new Error("handler rejected");
  const promise = executeWithTimeout(
    () => Promise.reject(error),
    null,
    context(controller),
    new ToolDeadline(20),
    controller,
    entry(),
  );
  queueMicrotask(() => controller.abort());
  await assert.rejects(
    promise,
    (value: unknown) => (value as { type?: string }).type === CoreErrorType.ToolCancelled,
  );
});

test("synchronous handler failure releases timer and listener before rejecting", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const error = new Error("sync failure");
  const promise = executeWithTimeout(
    () => {
      throw error;
    },
    null,
    context(controller),
    new ToolDeadline(20),
    controller,
    entry(),
  );
  await assert.rejects(promise, (caught) => caught === error);
  assert.equal(time.pending.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  time.tick(30);
  assert.equal(controller.signal.aborted, false);
});

test("non-Error synchronous throws and then-accessor failure retain identity and release resources", async (t) => {
  const time = clock(t);
  for (const thenAccessor of [false, true]) {
    const controller = new AbortController();
    const error = { fixture: "synchronous" };
    const handler = (): Promise<unknown> => {
      if (!thenAccessor) throw error;
      // oxlint-disable-next-line unicorn/no-thenable -- 故意构造损坏的 Promise 接口，验证建立链时的同步异常也释放资源。
      return Object.defineProperty({}, "then", {
        get() {
          throw error;
        },
      }) as Promise<unknown>;
    };
    await assert.rejects(
      executeWithTimeout(
        handler,
        null,
        context(controller),
        new ToolDeadline(20),
        controller,
        entry(),
      ),
      (caught) => caught === error,
    );
    assert.equal(time.pending.size, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    time.tick(21);
    assert.equal(controller.signal.aborted, false);
  }
});

test("late rejection after cancellation cannot repeat cleanup or replace the terminal result", async (t) => {
  const time = clock(t);
  const controller = new AbortController();
  const work = deferred();
  const deadline = new ToolDeadline(20);
  const clear = deadline.clear.bind(deadline);
  let cleanups = 0;
  t.mock.method(deadline, "clear", () => {
    cleanups++;
    clear();
  });
  const promise = executeWithTimeout(
    () => work.promise,
    null,
    context(controller),
    deadline,
    controller,
    entry(),
  );
  controller.abort();
  await assert.rejects(
    promise,
    (error: unknown) => (error as { type: string }).type === CoreErrorType.ToolCancelled,
  );
  work.reject(new Error("late"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cleanups, 1);
  assert.equal(time.pending.size, 0);
});
