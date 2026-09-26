import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { readStudioRunOutcome } from "../src/studio-runtime/app/runOutcomeProjection.js";
import { workflowValueKey } from "../src/studio-runtime/app/workflowSteps.js";
import { workflow } from "./studio-orchestration-support.js";

/**
 * 第一条完整路径（复核点名）：
 * **文档盘点 → 人工批准 → 整理文档 → 查看修改 → 接受文件**。
 *
 * 从真实执行入口启动、用真实工作区管理器，只替换外部模型传输；不预填任何 `outputs`。
 * 每一步都断言“正式执行入口产生了真实结果”，而不是“相关文件存在”。
 */

const ok = (text: string): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});

async function fixture(t: TestContext, adapter: StudioKernelAdapter) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-delivery-path-"));
  const project = join(root, "project");
  const dataDir = join(root, "studio-data");
  await mkdir(join(project, "docs"), { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  await writeFile(join(project, "docs", "old.md"), "旧文档\n", "utf8");
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
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
    workspaces: createStudioWorkspaceManager(dataDir),
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, project, db, service };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const run = (f: Fixture, id: string) => f.db.read<StoredRun>("run", id)!;
function nodeOutcome(f: Fixture, runId: string, nodeId: string): StudioStepResult | undefined {
  const raw = run(f, runId).checkpoint?.values?.[workflowValueKey(nodeId)];
  return raw ? (JSON.parse(raw) as StudioStepResult) : undefined;
}
async function until(f: Fixture, check: () => boolean | Promise<boolean>, label: string) {
  const end = Date.now() + 30_000;
  while (true) {
    f.service.tick();
    if (await check()) return;
    if (Date.now() > end) throw new Error(`Runtime did not settle: ${label}`);
    await sleep(2);
  }
}

/** start → agent(盘点) → approval(人工批准) → agent(整理) → end。 */
function graph(project: string) {
  const definition = {
    ...workflow(
      ["start", "agent", "approval", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    ),
    workspacePath: project,
  };
  definition.nodes[1]!.data.outputs = [
    { name: "inventory", from: "json" },
    { name: "deletions", from: "json" },
  ];
  definition.nodes[2]!.data.prompt = "确认整理 {{ref.inventory}}";
  definition.nodes[3]!.data.prompt = "按 {{ref.inventory}} 整理文档";
  return definition;
}

const CLEANUP_STEP = "workflow:n3:attempt:0";

test("document path: inventory → approval → cleanup → review changes → accept file", async (t) => {
  const prompts: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      if (prompts.length === 1)
        // 盘点：按名建键的结构化结果 → 两个命名输出。
        return ok(JSON.stringify({ inventory: "清单正文", deletions: ["docs/old.md"] }));
      // 整理：在自己的隔离工作区写出整理结果。
      await mkdir(join(turn.workspacePath, "docs"), { recursive: true });
      await writeFile(join(turn.workspacePath, "docs", "cleanup.md"), "整理结果\n", "utf8");
      return ok("整理完成");
    },
  });
  const definition = graph(f.project);
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "盘点并整理文档",
  });

  // ① 人工批准：批准之前整理节点不得执行。
  await until(
    f,
    async () =>
      (await f.service.timeline(definition.id)).interactions.some((i) => i.status === "pending"),
    "approval pending",
  );
  assert.equal(prompts.length, 1, "批准之前只能有盘点这一步");
  const interaction = (await f.service.timeline(definition.id)).interactions.find(
    (i) => i.status === "pending",
  )!;
  await f.service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: interaction.id,
    answer: { decision: "allow-once" },
  });
  await until(f, () => run(f, accepted.id).state === "succeeded", "delivery path run");

  // ② 盘点产出了两个命名输出，整理节点引用了其中的值。
  const inventory = nodeOutcome(f, accepted.id, "n1");
  assert.deepEqual(
    inventory?.outputs?.map((ref) => [ref.kind, ref.name]),
    [
      ["json", "inventory"],
      ["json", "deletions"],
    ],
  );
  assert.match(prompts[1]!, /清单正文/);
  assert.equal(prompts.length, 2, "批准后整理节点执行了一次");

  // ③ 查看修改：整理结果作为隔离改动出现。
  const changes = await f.service.workspaceChanges({ runId: accepted.id, stepId: CLEANUP_STEP });
  const cleanup = changes.find((change) => change.path === "docs/cleanup.md");
  assert.ok(cleanup, `应看到整理产生的新文件；实际：${JSON.stringify(changes.map((c) => c.path))}`);
  assert.notEqual(cleanup.kind, "deleted");

  // ④ 接受文件：项目里出现该文件，隔离目录不被当作项目改写。
  assert.equal(
    await readFile(join(f.project, "docs", "cleanup.md"), "utf8").catch(() => null),
    null,
  );
  await f.service.applyWorkspaceChanges({
    runId: accepted.id,
    stepId: CLEANUP_STEP,
    paths: ["docs/cleanup.md"],
  });
  assert.equal(await readFile(join(f.project, "docs", "cleanup.md"), "utf8"), "整理结果\n");

  // ⑤ 重开核验：接纳事实能在本次任务的交付摘要里查到。
  const outcome = readStudioRunOutcome(f.db, run(f, accepted.id));
  const step = outcome.steps.find((item) => item.stepId === CLEANUP_STEP);
  assert.equal(step?.acceptance?.result, "accepted");
  assert.equal(step?.acceptance?.confirmation, "host-verified");
  assert.deepEqual(step?.acceptance?.paths, ["docs/cleanup.md"]);
});

test("document path: a denied approval stops before the cleanup node runs", async (t) => {
  const prompts: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      return ok(JSON.stringify({ inventory: "清单正文", deletions: [] }));
    },
  });
  const definition = graph(f.project);
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "盘点并整理文档",
  });
  await until(
    f,
    async () =>
      (await f.service.timeline(definition.id)).interactions.some((i) => i.status === "pending"),
    "approval pending",
  );
  const interaction = (await f.service.timeline(definition.id)).interactions.find(
    (i) => i.status === "pending",
  )!;
  await f.service.command({
    commandId: randomUUID(),
    type: "answer",
    interactionId: interaction.id,
    answer: { decision: "deny" },
  });
  await until(f, () => run(f, accepted.id).state === "failed", "denied run");
  assert.equal(prompts.length, 1, "拒绝后整理节点不得执行");
});
