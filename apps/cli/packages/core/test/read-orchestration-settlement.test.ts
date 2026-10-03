import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { cacheEntry } from "./read-orchestration-cases.js";
import { entry, fixture, load } from "./read-orchestration-fixture.js";
import { executorFixture } from "./read-orchestration-consumer-fixture.js";

const { executeWithTimeout } = await load("tool/executor/deadline/handler-settlement");

function queueCancellation(controller: AbortController, depth: number, events: string[]) {
  queueMicrotask(() => {
    if (depth > 1) queueCancellation(controller, depth - 1, events);
    else {
      events.push("abort");
      controller.abort("Owned cancellation queued after metadata commit");
    }
  });
}

for (const cached of [false, true]) {
  test(`Read deadline retains committed completion ahead of queued cancellation, cached=${cached}`, async () => {
    for (const depth of [1, 2]) {
      const f = fixture({ label: "settlement boundary", ...(cached ? { cache: cacheEntry } : {}) });
      const events: string[] = [];
      const record = f.context.recordReadFileStateMetadata;
      f.context.recordReadFileStateMetadata = function (metadata) {
        record.call(this, metadata);
        events.push("metadata");
        queueCancellation(f.controller, depth, events);
      };
      const deadline = {
        timeoutMs: 30_000,
        queuedMs: 0,
        start() {
          events.push("start");
        },
        clear() {
          events.push("clear");
        },
      };
      const pending = executeWithTimeout(
        entry.handler,
        f.input,
        f.context,
        deadline,
        f.controller,
        entry,
      );
      if (depth === 1) {
        await assert.rejects(pending, (error: any) => error.type === CoreErrorType.ToolCancelled);
        assert.deepEqual(events, ["start", "metadata", "abort", "clear"]);
      } else {
        assert.equal((await pending).type, cached ? "file_unchanged" : "text");
        assert.deepEqual(events, ["start", "metadata", "clear", "abort"]);
      }
      assert.equal(f.metadata.length, 1);
      assert.equal(f.states.size, 1);
      assert.equal(
        f.calls.filter((call) => call.target === "readTextFileRange").length,
        cached ? 0 : 1,
      );
    }
  });

  test(`Read call-runner retains result metadata and completion telemetry, cached=${cached}`, async () => {
    for (const depth of [2, 3, 4]) {
      const f = executorFixture({
        label: "call-runner settlement boundary",
        ...(cached ? { cache: cacheEntry } : {}),
      });
      const controller = new AbortController();
      const events: string[] = [];
      f.behavior.handler = (input, context) => {
        const record = context.recordReadFileStateMetadata;
        context.recordReadFileStateMetadata = function (metadata) {
          record.call(this, metadata);
          events.push("metadata");
          queueCancellation(controller, depth, events);
        };
        return entry.handler(input, context);
      };
      const result = await f.execute({ signal: controller.signal });
      const shouldComplete = depth >= 3;
      assert.equal(result.success, shouldComplete, `depth=${depth}`);
      assert.equal(Boolean(result.readFileStateMetadata), shouldComplete);
      if (shouldComplete) {
        assert.equal(result.output.type, cached ? "file_unchanged" : "text");
        assert.equal(
          f.events.filter((event) => event.type === SessionEventType.ToolCallResult).length,
          1,
        );
        assert.equal(
          f.events.filter((event) => event.type === SessionEventType.ToolCallError).length,
          0,
        );
      } else {
        assert.equal(result.error.type, CoreErrorType.ToolCancelled);
        assert.equal(
          f.events.filter((event) => event.type === SessionEventType.ToolCallResult).length,
          0,
        );
        assert.equal(
          f.events.filter((event) => event.type === SessionEventType.ToolCallError).length,
          1,
        );
      }
      assert.deepEqual(
        f.terminal().map((event) => event.name),
        [shouldComplete ? "finishCompleted" : "finishCancelled"],
      );
      assert.equal(f.direct.states.size, 1);
      assert.equal(events.filter((event) => event === "metadata").length, 1);
    }
  });
}
