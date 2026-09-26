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
    // 用例可能自己重开过数据库；Windows 上仍被占用的 -wal 会让删除失败，因此重试几次。
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await rm(root, { recursive: true, force: true });
        return;
      } catch {
        await sleep(200);
      }
    }
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

  // ⑤ 重开核验：**真的关掉再重开**——释放当前服务与数据库，用同一个数据库路径、
  // 同一个工作区目录新建实例，再通过正式查询接口核对接纳事实。
  // 只在原进程里读一次不能证明「重启后能恢复」，因此这里必须重建。
  const callsBeforeRestart = prompts.length;
  await f.service.disposeAllAndWait();
  const reopenedDb = new StudioDatabase(join(f.root, "runtime.sqlite"));
  // 重启后的适配器必须有**自己的**计数器：旧适配器维护的 prompts 不会被新实例触碰，
  // 只断言 prompts 长度会让「重启后重新派单」这条缺陷从断言下面溜过去。
  let restartCalls = 0;
  const reopened = new StudioRuntimeService({
    db: reopenedDb,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 5), undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => {
          restartCalls += 1;
          // 意外调用直接抛错，但**不只依赖抛错**：运行时可能把异常转成任务状态，
          // 所以下面还要显式断言计数为零。
          throw new Error("restart must not dispatch a model request");
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: createStudioWorkspaceManager(join(f.root, "studio-data")),
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    // 安全网：正常路径已在用例末尾释放；这里容忍重复释放。
    await reopened.disposeAllAndWait().catch(() => {});
  });

  // 先驱动恢复与调度到明确检查点（tick 若干轮），再查询正式接口。
  for (let attempt = 0; attempt < 20; attempt++) {
    reopened.tick();
    await sleep(10);
  }

  // 正式查询接口（timeline）而不是内部投影函数：重启后仍能查到该步骤的接纳事实。
  const timeline = await reopened.timeline(definition.id);
  const restored = timeline.runs.find((item) => item.id === accepted.id);
  assert.ok(restored, "重启后应能查到该次运行");
  const restoredStep = restored.outcome?.steps.find((item) => item.stepId === CLEANUP_STEP);
  // 运行级摘要是各步骤证据的聚合（盘点节点只有 model-claim，因此运行级是 produced）；
  // 真正要核对的是**该步骤**：重启后仍是已核验，且接纳记录完整。
  assert.equal(restoredStep?.outcome, "checked", "重启后该步骤仍应是已核验");
  assert.equal(restoredStep?.acceptance?.result, "accepted");
  assert.equal(restoredStep?.acceptance?.confirmation, "host-verified");
  assert.deepEqual(restoredStep?.acceptance?.paths, ["docs/cleanup.md"]);
  // 业务运行身份与步骤身份在重启后依然正确（不是物理工作区身份）。
  assert.equal(restoredStep?.acceptance?.runId, accepted.id);
  assert.equal(restoredStep?.acceptance?.stepId, CLEANUP_STEP);
  assert.equal(restoredStep?.acceptance?.workspaceStepId, CLEANUP_STEP);

  // 项目内容仍是应用后的结果；已完成节点没有重新执行。
  assert.equal(await readFile(join(f.project, "docs", "cleanup.md"), "utf8"), "整理结果\n");
  // 旧适配器的计数（prompts）与重启无关，只能说明旧实例没被再用；真正要断言的是
  // **重启后的适配器一次都没被调用**。
  assert.equal(prompts.length, callsBeforeRestart, "旧实例不应再收到调用");
  assert.equal(restartCalls, 0, "重启后不得产生任何新的模型派单");

  // 主动释放重开的实例：t.after 是先进先出，夹具的目录清理注册得更早。
  // （服务的 dispose 会一并关闭它持有的数据库，不要再单独 close。）
  await reopened.disposeAllAndWait();
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
