import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import type {
  StudioKernelAdapter,
  StudioKernelTurnResult,
} from "../src/studio-runtime/kernelTypes.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioStepResult } from "../src/studio-runtime/workflowTypes.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { workflow } from "./studio-orchestration-support.js";

/**
 * 命名输出的「生产 → 持久化 → 消费」集成测试（见 specs/knorvia-output-contract.md）。
 *
 * 关键点：从**真实执行入口**（StudioRuntimeService → turnExecutor）启动，只替换外部模型传输
 * （kernel adapter），**不往步骤结果里预填 `outputs`**。这样才证明生产者真的接通了，
 * 而不是夹具替它填好了数据。
 */

const ok = (text: string): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});

async function fixture(t: TestContext, adapter: StudioKernelAdapter) {
  const path = await mkdtemp(join(tmpdir(), "knorvia-output-production-"));
  const db = new StudioDatabase(join(path, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 5), undefined, { signal }),
    },
    kernels: {
      adapter: () => adapter,
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
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    await rm(path, { recursive: true, force: true });
  });
  return { db, service, path };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const run = (f: Fixture, id: string) => f.db.read<StoredRun>("run", id)!;

async function until(f: Fixture, check: () => boolean, label: string) {
  const end = Date.now() + 30_000;
  while (true) {
    f.service.tick();
    if (check()) return;
    if (Date.now() > end) throw new Error(`Runtime did not settle: ${label}`);
    await sleep(2);
  }
}

/** 线性 start → agent(A) → agent(B) → end，A 声明输出名，B 引用它们。 */
function graph(path: string, outputNames: string[], consumerPrompt: string) {
  const definition = {
    ...workflow(
      ["start", "agent", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: path,
  };
  definition.nodes[1]!.data.outputNames = outputNames;
  definition.nodes[2]!.data.prompt = consumerPrompt;
  return definition;
}

async function startWorkflow(f: Fixture, definition: ReturnType<typeof graph>) {
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  return f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "seed",
  });
}

function stepOf(f: Fixture, runId: string, stepId: string): StudioStepResult | undefined {
  return run(f, runId).checkpoint?.steps?.[stepId];
}

test("a single declared output name carries the node text and downstream reads it", async (t) => {
  const prompts: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      return ok(prompts.length === 1 ? "盘点结果正文" : "done");
    },
  });
  const definition = graph(f.path, ["summary"], "Use {{ref.summary}}");
  const accepted = await startWorkflow(f, definition);
  await until(f, () => run(f, accepted.id).state === "succeeded", "single-output run");

  // 生产者真的产出了引用，并随步骤结果持久化。
  const produced = stepOf(f, accepted.id, "workflow:n1:attempt:0");
  assert.equal(produced?.outputs?.length, 1, "单名输出应产出一条引用");
  assert.deepEqual(produced?.outputs?.[0], { kind: "text", name: "summary", text: "盘点结果正文" });

  // 消费者读到的是真实产出的值，而不是空引用。
  assert.equal(
    prompts.length,
    2,
    `下游节点应当执行；steps=${JSON.stringify(Object.keys(run(f, accepted.id).checkpoint?.steps ?? {}))} state=${run(f, accepted.id).state}`,
  );
  assert.match(prompts[1]!, /盘点结果正文/);
});

test("multiple declared output names require a JSON object keyed by those names", async (t) => {
  const prompts: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      if (prompts.length === 1)
        return ok(JSON.stringify({ inventory: "清单正文", deletions: ["a.md", "b.md"] }));
      return ok("done");
    },
  });
  const definition = graph(f.path, ["inventory", "deletions"], "盘点：{{ref.inventory}}");
  const accepted = await startWorkflow(f, definition);
  await until(f, () => run(f, accepted.id).state === "succeeded", "multi-output run");

  const produced = stepOf(f, accepted.id, "workflow:n1:attempt:0");
  assert.equal(produced?.outputs?.length, 2, "两个名字应产出两条引用");
  assert.deepEqual(
    produced?.outputs?.map((ref) => [ref.kind, ref.name]),
    [
      ["json", "inventory"],
      ["json", "deletions"],
    ],
  );
  assert.match(prompts[1]!, /清单正文/);
});

test("a multi-output node returning prose fails the step instead of duplicating text", async (t) => {
  const prompts: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      return ok("这是一段纯文本，不是 JSON。");
    },
  });
  const definition = graph(f.path, ["inventory", "deletions"], "盘点：{{ref.inventory}}");
  const accepted = await startWorkflow(f, definition);
  await until(f, () => run(f, accepted.id).state === "failed", "prose failure");

  const produced = stepOf(f, accepted.id, "workflow:n1:attempt:0");
  assert.equal(produced?.outputs, undefined, "失败时不得留下半成品引用");
  assert.match(produced?.error ?? "", /must be a JSON object keyed by those names/);
  assert.equal(prompts.length, 1, "下游节点不得在引用不可用时执行");
});

test("a multi-output node missing a declared key names the missing output", async (t) => {
  const f = await fixture(t, { run: async () => ok(JSON.stringify({ inventory: "只有清单" })) });
  const definition = graph(f.path, ["inventory", "deletions"], "盘点：{{ref.inventory}}");
  const accepted = await startWorkflow(f, definition);
  await until(f, () => run(f, accepted.id).state === "failed", "missing key failure");

  const produced = stepOf(f, accepted.id, "workflow:n1:attempt:0");
  assert.match(produced?.error ?? "", /Workflow outputs missing from the node result: deletions/);
});
