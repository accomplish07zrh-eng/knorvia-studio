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
import {
  assertStudioOutputRefs,
  decodeStudioOutputRefs,
} from "../src/studio-runtime/domain/outputRef.js";
import { validateStudioWorkflow } from "../src/studio-runtime/domain/workflowGraph.js";
import {
  saveStudioValues,
  projectStudioStep,
} from "../src/studio-runtime/app/checkpointStorage.js";
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

test("a legacy step result without outputs keeps its exact previous semantics", () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const h = harness();
  const legacy = {
    status: "succeeded" as const,
    text: "legacy answer",
    resultKnown: true,
    workspacePath: "/project",
    changesSummary: "1 file changed",
  };
  h.port.checkpoint.values[workflowValueKey("n1")] = JSON.stringify(legacy);
  const cached = workflowCached(h.port, "n1");
  // 没有 version、没有 outputs 的旧记录：逐字段与改动前一致，缓存判定不变。
  assert.deepEqual(cached, legacy);
  assert.equal(cached?.outputs, undefined);
  assert.equal(cached?.version, undefined);
  assert.equal(decodeStudioOutputRefs(legacy).status, "legacy");
  // 旧定义没有 version 字段，仍按原样执行并通过校验。
  assert.equal(graph.version, undefined);
  assert.deepEqual(validateStudioWorkflow(graph), []);
});

test("known outputs round-trip through a bounded checkpoint and stay reusable", async () => {
  const refs = [
    { kind: "text" as const, name: "summary", text: "done" },
    { kind: "json" as const, name: "report", schemaId: "studio.report", value: { ok: true } },
    {
      kind: "workspace-file" as const,
      name: "patch",
      runId: "run-1",
      stepId: "n1",
      relativePath: "out/patch.diff",
      sha256: "a".repeat(64),
    },
    {
      kind: "creation-output" as const,
      name: "cover",
      // 创作任务记录本身不带运行来源，归属由引用上的 runId 声明并在解析时核对。
      runId: "run-1",
      creationJobId: "job-1",
      outputId: "out-1",
      fileName: "cover.png",
    },
  ];
  assert.deepEqual(assertStudioOutputRefs(refs), refs);
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const h = harness(async () => ({
    status: "succeeded",
    text: "x".repeat(4000),
    resultKnown: true,
    outputs: refs,
    version: 1,
  }));
  await executeStudioWorkflow(graph, "go", h.port);
  // 真实写入路径：检查点值由 saveStudioValues 投影后再落盘。
  const run = {
    id: "run",
    kind: "workflow",
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
  };
  const raw = h.port.checkpoint.values[workflowValueKey("n1")]!;
  saveStudioValues({ write() {} } as never, run as never, { [workflowValueKey("n1")]: raw });
  const saved = (run.checkpoint.values as Record<string, string>)[workflowValueKey("n1")]!;
  const parsed = JSON.parse(saved);
  assert.deepEqual(parsed.outputs, refs);
  assert.equal(parsed.version, 1);
  // 大文本仍按既有 projectText 截断，引用本身不被截断。
  assert.ok(parsed.text.length < 4000);
  assert.match(parsed.text, /Full result is retained/);
  const cached = workflowCached(h.port, "n1");
  assert.deepEqual(cached?.outputs, refs);
  assert.equal(cached?.version, 1);
});

test("a checkpoint version newer than this build is rejected while its raw payload is preserved", () => {
  const h = harness();
  const key = workflowValueKey("node");
  const raw = JSON.stringify({
    status: "succeeded",
    text: "from the future",
    resultKnown: true,
    version: 99,
    outputs: [{ kind: "text", name: "future", text: "kept" }],
  });
  h.port.checkpoint.values[key] = raw;
  assert.throws(
    () => workflowCached(h.port, "node"),
    /Unsupported workflow checkpoint version for node\./,
  );
  // 原始记录仍按原字节保留：不做降级重写，也不静默丢弃。
  assert.equal(h.port.checkpoint.values[key], raw);
  // 非法版本字段不是"未知新版本"，按既有非法检查点报告。
  for (const version of ["1", 1.5, -1, null]) {
    const malformed = JSON.stringify({ status: "succeeded", text: "", resultKnown: true, version });
    h.port.checkpoint.values[key] = malformed;
    assert.throws(() => workflowCached(h.port, "node"), /Invalid workflow checkpoint/);
    assert.equal(h.port.checkpoint.values[key], malformed);
  }
  // 更高版本的定义同样被显式拒绝，而不是按当前语义执行。
  const definition = { ...workflow([], []), version: 99 };
  assert.match(validateStudioWorkflow(definition)[0]!, /Unsupported workflow definition version/);
});

test("over-size or dishonest inline payloads are rejected at the write boundary", () => {
  assert.throws(
    () => assertStudioOutputRefs([{ kind: "text", name: "big", text: "x".repeat(16 * 1024 + 1) }]),
    /inline text limit/,
  );
  assert.throws(
    () =>
      assertStudioOutputRefs([
        { kind: "json", name: "big", value: { data: "x".repeat(16 * 1024 + 1) } },
      ]),
    /inline JSON limit/,
  );
  // 单条不超限但合计超限，同样拒绝；截断保存会让检查点与真实产物不一致。
  const half = "x".repeat(16 * 1024);
  assert.throws(
    () =>
      assertStudioOutputRefs([
        { kind: "text", name: "a", text: half },
        { kind: "text", name: "b", text: half },
        { kind: "text", name: "c", text: half },
        { kind: "text", name: "d", text: half },
        { kind: "text", name: "e", text: half },
      ]),
    /inlines at most 65536 bytes/,
  );
  assert.throws(
    () =>
      assertStudioOutputRefs(
        Array.from({ length: 33 }, (_, index) => ({
          kind: "text" as const,
          name: `item-${index}`,
          text: "ok",
        })),
      ),
    /at most 32 output references/,
  );
  assert.throws(
    () =>
      assertStudioOutputRefs([
        { kind: "text", name: "a", text: "1" },
        { kind: "text", name: "a", text: "2" },
      ]),
    /Duplicate studio output name/,
  );
  for (const relativePath of ["/etc/passwd", "C:/windows", "a/../b", "a\\b", "nul", ""]) {
    assert.throws(
      () =>
        assertStudioOutputRefs([
          { kind: "workspace-file", name: "file", runId: "r", stepId: "s", relativePath },
        ]),
      /Invalid studio output reference/,
      relativePath,
    );
  }
  // 写入边界即服务边界：超限结果不会落进检查点。
  assert.throws(
    () =>
      projectStudioStep({
        status: "succeeded",
        text: "ok",
        resultKnown: true,
        outputs: [{ kind: "text", name: "big", text: "x".repeat(16 * 1024 + 1) }],
        version: 1,
      }),
    /inline text limit/,
  );
});

test("the checkpoint keeps bounded references instead of copying output bytes", () => {
  const big = "y".repeat(200_000);
  const refs = [
    { kind: "json" as const, name: "pointer", value: { file: "out/result.json", bytes: 200_000 } },
  ];
  const projected = projectStudioStep({
    status: "succeeded",
    text: big,
    resultKnown: true,
    outputs: refs,
    version: 1,
  });
  assert.ok(projected.text.length <= 1024 + 64);
  assert.deepEqual(projected.outputs, refs);
  const run = {
    id: "run",
    kind: "workflow",
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
  };
  saveStudioValues({ write() {} } as never, run as never, {
    [workflowValueKey("n1")]: JSON.stringify(projected),
  });
  const stored = (run.checkpoint.values as Record<string, string>)[workflowValueKey("n1")]!;
  assert.ok(stored.length < 4096, stored.length.toString());
  assert.equal(stored.includes(big), false);
  assert.deepEqual(JSON.parse(stored).outputs, refs);
  const h = harness();
  h.port.checkpoint.values[workflowValueKey("n1")] = stored;
  assert.equal(workflowCached(h.port, "n1")?.status, "succeeded");
});

test("outputs are only accepted on known results and malformed references fail checkpoint validation", () => {
  const h = harness();
  const key = workflowValueKey("node");
  for (const value of [
    JSON.stringify({
      status: "succeeded",
      text: "",
      resultKnown: false,
      outputs: [{ kind: "text", name: "x", text: "1" }],
      version: 1,
    }),
    JSON.stringify({
      status: "succeeded",
      text: "",
      resultKnown: true,
      outputs: [{ kind: "text", name: "", text: "1" }],
      version: 1,
    }),
    JSON.stringify({
      status: "succeeded",
      text: "",
      resultKnown: true,
      outputs: "not-an-array",
      version: 1,
    }),
  ]) {
    h.port.checkpoint.values[key] = value;
    assert.throws(() => workflowCached(h.port, "node"), /Invalid workflow checkpoint/);
  }
});
