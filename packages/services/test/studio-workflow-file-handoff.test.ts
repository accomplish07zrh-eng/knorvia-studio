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
 * 跨隔离交接的**端到端**验收：从真实执行入口启动，用真实工作区管理器。
 *
 * 链条：上游 Agent 在自己的隔离工作区写出文件 → 节点声明 `outputs: [{ name, from: "file" }]`
 * → Host 核对文件与哈希后产出 `workspace-file` 引用 → 下游引用 `{{ref.<name>}}` 时，
 * turnExecutor 把副本导入下游工作区 → 下游内核读到的是**副本**，上游文件不被下游改写。
 *
 * 这里不预填任何 `outputs`：全部由真实生产者产出。
 */

const ok = (text: string): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});

async function fixture(t: TestContext, adapter: StudioKernelAdapter) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-file-handoff-"));
  const project = join(root, "project");
  const dataDir = join(root, "studio-data");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
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
async function until(f: Fixture, check: () => boolean, label: string) {
  const end = Date.now() + 30_000;
  while (true) {
    f.service.tick();
    if (check()) return;
    if (Date.now() > end) throw new Error(`Runtime did not settle: ${label}`);
    await sleep(2);
  }
}

/** start → agent(n1, 声明一个 file 输出) → agent(n2, 引用它) → end。 */
function graph(project: string) {
  const definition = {
    ...workflow(
      ["start", "agent", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: project,
  };
  definition.nodes[1]!.data.outputs = [{ name: "patch", from: "file" }];
  definition.nodes[2]!.data.prompt = "请检查 {{ref.patch}}";
  return definition;
}

test("an upstream file output reaches the downstream workspace as a copy", async (t) => {
  const prompts: string[] = [];
  const seen: string[] = [];
  const f = await fixture(t, {
    run: async (turn) => {
      prompts.push(turn.text);
      if (prompts.length === 1) {
        // 上游 Agent 在自己的隔离工作区里写出产物。
        await mkdir(join(turn.workspacePath, "out"), { recursive: true });
        await writeFile(join(turn.workspacePath, "out", "patch.diff"), "--- a\n+++ b\n", "utf8");
        return ok(JSON.stringify({ patch: "out/patch.diff" }));
      }
      // 下游必须能在**自己的工作区**里读到那份副本。
      seen.push(await readFile(join(turn.workspacePath, "out", "patch.diff"), "utf8"));
      return ok("done");
    },
  });
  const definition = graph(f.project);
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "seed",
  });
  await until(f, () => run(f, accepted.id).state === "succeeded", "file handoff run");

  // 生产者：由 Host 核对文件与哈希后产出的 workspace-file 引用。
  const produced = nodeOutcome(f, accepted.id, "n1");
  const ref = produced?.outputs?.[0];
  assert.equal(ref?.kind, "workspace-file", "file 来源应产出 workspace-file 引用");
  assert.equal(ref?.name, "patch");
  assert.equal(ref?.relativePath, "out/patch.diff");
  assert.match(ref?.sha256 ?? "", /^[a-f0-9]{64}$/u, "引用必须带上 Host 核对的真实哈希");

  // 消费者：下游读到的是副本，内容一致；提示词里的相对路径就是副本位置。
  assert.equal(seen.length, 1, "下游节点应当执行");
  assert.equal(seen[0], "--- a\n+++ b\n");
  assert.match(prompts[1]!, /out\/patch\.diff/);
});

test("a file output that does not exist fails the step instead of becoming a string", async (t) => {
  const f = await fixture(t, {
    run: async () => ok(JSON.stringify({ patch: "out/missing.diff" })),
  });
  const definition = graph(f.project);
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "seed",
  });
  await until(f, () => run(f, accepted.id).state === "failed", "missing file failure");

  const produced = nodeOutcome(f, accepted.id, "n1");
  assert.equal(produced?.outputs, undefined, "缺文件时不得产出引用");
  assert.match(produced?.error ?? "", /does not exist: out\/missing\.diff/);
});
