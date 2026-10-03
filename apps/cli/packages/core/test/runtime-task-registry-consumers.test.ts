import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ToolExecutionContext } from "../src/tool/types.js";
import {
  actual,
  current,
  loadCurrent,
  pins,
  registry,
  selectedURL,
  surface,
  task,
  taskOutput,
} from "./runtime-task-registry-observation-fixture.js";

test(`${surface}: existing nonblocking TaskOutput observation uses same-surface memory owner`, async () => {
  const owner = registry();
  owner.register(task("completed", { description: "synthetic", resultText: "result" }));
  const before = owner.get("task");
  const controller = new AbortController();
  const context = {
    toolCallId: "call",
    traceId: "trace",
    sessionId: "session",
    turnId: "turn",
    abortSignal: controller.signal,
    runtimeTaskRegistry: owner,
    emitEvent() {
      assert.fail("nonblocking consumer must not emit progress");
    },
  } as unknown as ToolExecutionContext;
  const pending = taskOutput.handler({ task_id: "task", block: false }, context);
  assert.equal(owner.get("task"), before);
  assert.equal(before?.notified, undefined);
  assert.deepEqual(await pending, {
    retrieval_status: "success",
    task: {
      task_id: "task",
      task_type: "local_dynamic_workflow",
      description: "synthetic",
      status: "completed",
      output: "result",
      result: "result",
    },
  });
  assert.equal(owner.get("task")?.notified, true);
  assert.equal(owner.get("task")?.branchGeneration, 0);
});

test(`${surface}: exact current source/JS/declaration routing rejects wrong and missing artifacts`, async () => {
  assert.equal(current.InMemoryRuntimeTaskRegistry, actual.InMemoryRuntimeTaskRegistry);
  assert.match(
    selectedURL.pathname,
    surface === "emitted" ? /\/dist\/.*\.js$/u : /\/src\/.*\.ts$/u,
  );
  for (const path of Object.keys(pins.files)) {
    await assert.rejects(
      loadCurrent(async (url) =>
        url.pathname.endsWith(path) ? "wrong artifact" : readFile(url, "utf8"),
      ),
      (error: any) => error.code === "ERR_ASSERTION",
    );
    const missing = Object.assign(new Error("Owned missing artifact"), { code: "ENOENT" });
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.pathname.endsWith(path)) throw missing;
        return readFile(url, "utf8");
      }),
      (error) => error === missing,
    );
  }
});
