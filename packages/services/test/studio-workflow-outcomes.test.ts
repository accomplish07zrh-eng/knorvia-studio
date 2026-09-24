import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { executeStudioWorkflow } from "../src/studio-runtime/app/workflowExecutor.js";
import { workflowCached, workflowValueKey } from "../src/studio-runtime/app/workflowSteps.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { assertStudioRunOwned } from "../src/studio-runtime/app/turnExecutor.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import { harness, workflow, success, failure } from "./studio-orchestration-support.js";

test("approval rejection and cancellation persist on their node; explicit retry asks again", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-workflow-outcomes-"));
  const db = new StudioDatabase(join(directory, "runtime.sqlite"));
  let calls = 0;
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 2), undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        async run() {
          calls++;
          return { status: "succeeded", text: "done", resultKnown: true };
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async ({ sourcePath }) => sourcePath,
      changes: async () => [],
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  async function until(condition: () => boolean | Promise<boolean>, tick = true) {
    const deadline = Date.now() + 3000;
    while (true) {
      if (tick) service.tick();
      if (await condition()) return;
      if (Date.now() > deadline) throw new Error("workflow did not settle");
      await sleep(2);
    }
  }
  const graph = {
    ...workflow(
      ["start", "agent", "approval", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    ),
    workspacePath: directory,
  };
  await service.command({ commandId: randomUUID(), type: "save-workflow", workflow: graph });
  const accepted = await service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: graph.id,
    text: "deliver",
  });
  const current = () => db.read<StoredRun>("run", accepted.id)!;
  const pending = async () =>
    (await service.timeline(graph.id)).interactions.find((item) => item.status === "pending");
  await until(async () => !!(await pending()));
  const denied = (await pending())!;
  await service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: denied.id,
    answer: { decision: "deny" },
  });
  await until(() => current().state === "failed");
  assert.equal(current().error, "Human approval was denied.");
  for (const id of ["n2", "n3", "n4"]) {
    const node = JSON.parse(current().checkpoint.values[workflowValueKey(id)]!);
    assert.equal(node.status, "failed");
    assert.equal(node.error, "Human approval was denied.");
  }
  assert.equal(calls, 1);
  const attempt = current().attempt;
  await service.command({
    commandId: randomUUID(),
    type: "resume",
    runId: accepted.id,
    retryUncertain: false,
  });
  await until(async () => !!(await pending()));
  const retry = (await pending())!;
  assert.notEqual(retry.id, denied.id);
  assert.equal(current().attempt, attempt + 1);
  assert.equal(calls, 1, "earlier successful agent remains cached");
  await service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: retry.id,
    answer: { decision: "allow-once" },
  });
  await until(() => current().state === "succeeded");
  assert.equal(calls, 2);
  assert.equal(
    JSON.parse(current().checkpoint.values[workflowValueKey("n2")]!).status,
    "succeeded",
  );
  const cancelled = await service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: graph.id,
    text: "stop at approval",
  });
  await until(async () => !!(await pending()));
  await service.command({ commandId: randomUUID(), type: "cancel", runId: cancelled.id });
  // Reproduce the production race: the persisted stop reaches approval polling before tick aborts.
  await until(() => db.read<StoredRun>("run", cancelled.id)?.state === "cancelled", false);
  const cancelledRun = db.read<StoredRun>("run", cancelled.id)!;
  assert.equal(cancelledRun.resultKnown, true);
  assert.equal(cancelledRun.error, "任务已停止");
  assert.equal(
    JSON.parse(cancelledRun.checkpoint.values[workflowValueKey("n2")]!).status,
    "cancelled",
  );
  const pureGraph = {
    ...workflow(
      ["start", "approval", "end"],
      [
        [0, 1],
        [1, 2],
      ],
    ),
    workspacePath: directory,
  };
  await service.command({ commandId: randomUUID(), type: "save-workflow", workflow: pureGraph });
  const pure = await service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: pureGraph.id,
    text: "offline approval",
  });
  const previousCalls = calls;
  await until(async () => !!(await pending()));
  await service.command({ commandId: randomUUID(), type: "cancel", runId: pure.id });
  await until(() => db.read<StoredRun>("run", pure.id)?.state === "cancelled", false);
  const pureRun = db.read<StoredRun>("run", pure.id)!;
  assert.equal(pureRun.resultKnown, true);
  assert.equal(pureRun.error, "任务已停止");
  assert.equal(calls, previousCalls);
  assert.equal(pureRun.checkpoint.values[workflowValueKey("n2")], undefined);
  assert.ok(
    (await service.timeline(pureGraph.id)).interactions
      .filter((item) => item.runId === pure.id)
      .every((item) => item.status === "expired"),
  );
});

test("lease loss while cancellation is requested remains an unknown interruption at an approval", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-approval-lease-"));
  const db = new StudioDatabase(join(directory, "runtime.sqlite"));
  t.after(async () => {
    db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  db.claim("original-owner", 1000);
  db.transaction(() =>
    db.write("run", "approval-run", {
      id: "approval-run",
      owner: "original-owner",
      state: "waiting",
      cancelRequested: true,
    }),
  );
  db.claim("new-owner", 10000);
  const graph = workflow(
    ["start", "approval", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const h = harness();
  h.port.confirm = async () => {
    assertStudioRunOwned(
      {
        db,
        owner: "original-owner",
        clock: {
          now: () => 10000,
          id: randomUUID,
          delay: async () => {},
        },
      },
      "approval-run",
      true,
    );
    return true;
  };
  const result = await executeStudioWorkflow(graph, "go", h.port);
  assert.equal(result.status, "interrupted");
  assert.equal(result.resultKnown, false);
  assert.match(result.error!, /执行权已失效/);
  assert.equal(h.calls.length, 0);
  assert.equal(JSON.parse(h.port.checkpoint.values[workflowValueKey("n1")]!).status, "interrupted");
});

test("a pure node evaluation failure is persisted without being replaced by a downstream error", async () => {
  const graph = workflow(
    ["start", "approval", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[1]!.data.prompt = "{{input}}{{input}}";
  const h = harness();
  const result = await executeStudioWorkflow(graph, "x".repeat(130_000), h.port);
  assert.equal(result.status, "failed");
  assert.equal(result.error, "Expanded workflow prompt exceeds the context limit.");
  assert.equal(h.questions.size, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(JSON.parse(h.port.checkpoint.values[workflowValueKey("n1")]!).error, result.error);
});

test("cancelled and interrupted node outcomes remain visible but are not completion caches", async () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  for (const status of ["cancelled", "interrupted"] as const) {
    const h = harness(async () => ({
      status,
      text: "",
      resultKnown: status === "cancelled",
      error: "native stop detail",
    }));
    assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, status);
    const saved = JSON.parse(h.port.checkpoint.values[workflowValueKey("n1")]!);
    assert.equal(saved.status, status);
    assert.equal(saved.error, "native stop detail");
    assert.equal(workflowCached(h.port, "n1"), undefined);
  }
});

test("known failed checkpoints are retryable while malformed checkpoints still fail validation", () => {
  const h = harness();
  const key = workflowValueKey("node");
  h.port.checkpoint.values[key] = JSON.stringify(failure("retry me"));
  assert.equal(workflowCached(h.port, "node"), undefined);
  h.port.checkpoint.values[key] = JSON.stringify(success("keep"));
  assert.equal(workflowCached(h.port, "node")?.text, "keep");
  for (const value of [
    "broken json",
    JSON.stringify({ status: "running", text: "", resultKnown: true }),
    JSON.stringify({ status: "failed", text: null, resultKnown: true }),
    JSON.stringify({ status: "failed", text: "" }),
    JSON.stringify({ status: "succeeded", text: "", resultKnown: false }),
    JSON.stringify({ status: "skipped", text: "", resultKnown: true, branch: "elsewhere" }),
  ]) {
    h.port.checkpoint.values[key] = value;
    assert.throws(() => workflowCached(h.port, "node"), /Invalid workflow checkpoint/);
  }
});

test("any join can absorb a known failed branch while preserving that branch's diagnostic", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "agent", "join", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
    ],
  );
  graph.nodes[4]!.data.joinPolicy = "any";
  const failed = Promise.withResolvers<void>();
  const h = harness(async (step) => {
    if (step.id.includes("n2")) {
      failed.resolve();
      return failure("optional branch failed");
    }
    await failed.promise;
    await sleep(2);
    return success("usable answer");
  });
  const result = await executeStudioWorkflow(graph, "go", h.port);
  assert.equal(result.status, "succeeded");
  assert.equal(result.error, undefined);
  const node = JSON.parse(h.port.checkpoint.values[workflowValueKey("n2")]!);
  assert.equal(node.status, "failed");
  assert.equal(node.error, "optional branch failed");
});
