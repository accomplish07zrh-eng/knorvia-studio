import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
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

async function fixture(t: TestContext, adapter: StudioKernelAdapter, creation?: unknown) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-file-handoff-"));
  const project = join(root, "project");
  const dataDir = join(root, "studio-data");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    ...(creation ? { creation: creation as never } : {}),
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

// ── 第二条路径：文案产出 → 创作节点 → 读取真实媒体引用 ─────────────────────────

/** 创作服务替身：成果是**磁盘上真实存在的文件**，带真实哈希。 */
function mediaCreationService(mediaPath: string, hash: string) {
  return {
    listModels: async () => [
      { id: "image-model", name: "Image", kind: "image", enabled: true, configured: true },
    ],
    createJob: async () => ({ id: "job-media" }),
    getJob: async (id: string) => ({
      id,
      status: "succeeded",
      outputs: [
        {
          id: "out-media",
          name: "illustration",
          mimeType: "image/png",
          path: mediaPath,
          size: 12,
          hash,
        },
      ],
    }),
  };
}

test("a creation output reaches the downstream workspace as a media copy", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-media-handoff-"));
  const project = join(root, "project");
  const mediaDir = join(root, "creation-store");
  await mkdir(project, { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  // 创作成果是磁盘上真实存在的文件（创作存储的替身），带真实哈希。
  const mediaPath = join(mediaDir, "art.png");
  await writeFile(mediaPath, "PNG-BYTES-01", "utf8");
  const hash = createHash("sha256").update("PNG-BYTES-01").digest("hex");

  const prompts: string[] = [];
  const seen: string[] = [];
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    creation: mediaCreationService(mediaPath, hash) as never,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 5), undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async (turn) => {
          prompts.push(turn.text);
          // 下游必须能在自己的工作区里读到那份媒体副本。
          seen.push(await readFile(join(turn.workspacePath, "creation-input", "art.png"), "utf8"));
          return ok("汇总完成");
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: createStudioWorkspaceManager(join(root, "studio-data")),
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });

  const definition = {
    ...workflow(
      ["start", "creation", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: project,
  };
  definition.nodes[1]!.data.creationModelId = "image-model";
  definition.nodes[1]!.data.outputNames = ["illustration"];
  definition.nodes[2]!.data.prompt = "汇总：{{ref.illustration}}";
  await service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "产出一张配图",
  });

  const end = Date.now() + 30_000;
  while (db.read<StoredRun>("run", accepted.id)?.state !== "succeeded" && Date.now() < end) {
    service.tick();
    await sleep(2);
  }
  assert.equal(db.read<StoredRun>("run", accepted.id)?.state, "succeeded", "媒体路径应当跑通");

  // 创作节点产出 creation-output 引用，带文件名与真实哈希。
  const raw = db.read<StoredRun>("run", accepted.id)?.checkpoint?.values?.[workflowValueKey("n1")];
  const produced = raw ? (JSON.parse(raw) as StudioStepResult) : undefined;
  const ref = produced?.outputs?.[0];
  assert.equal(ref?.kind, "creation-output");
  assert.equal(ref?.name, "illustration");
  assert.equal(ref?.fileName, "art.png", "成果文件名来自真实落盘路径");
  assert.equal(ref?.sha256, hash);

  // 下游读到的是副本：内容与创作存储里的一致，且提示词给出的是固定落点。
  assert.equal(seen.length, 1, "下游节点应当执行");
  assert.equal(seen[0], "PNG-BYTES-01");
  assert.match(prompts[0]!, /creation-input\/art\.png/);
});

// ── 创作节点作为下游消费者：上游图片 → 下一个创作节点的参考图 ──────────────────

/**
 * 创作服务替身：记录每次 `createJob` 收到的参考图字节，并让 `listJobs()` 报告上游成果，
 * 以便 Host 侧核对「来源必须是已记录的创作成果」。
 */
function chainedCreationService(options: { mediaPath: string; hash: string }) {
  const submitted: Array<{ reference?: { name: string; dataBase64: string } }> = [];
  let counter = 0;
  const output = {
    id: "out-media",
    name: "illustration",
    mimeType: "image/png",
    path: options.mediaPath,
    size: 12,
    hash: options.hash,
  };
  return {
    submitted,
    listModels: async () => [
      { id: "image-model", name: "Image", kind: "image", enabled: true, configured: true },
    ],
    createJob: async (input: { reference?: { name: string; dataBase64: string } }) => {
      submitted.push({ reference: input.reference });
      counter += 1;
      return { id: `job-${counter}` };
    },
    listJobs: async () => [{ id: "job-1", status: "succeeded", outputs: [output] }],
    getJob: async (id: string) => ({ id, status: "succeeded", outputs: [output] }),
  };
}

async function chainedFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-media-chain-"));
  const project = join(root, "project");
  const mediaDir = join(root, "creation-store");
  await mkdir(join(project, "creation-input"), { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  // 反例：原项目里放一张**同名但不同内容**的图片。旧实现把占位路径按项目解析，
  // 就会读到这一张；正确实现必须读到上游产物。
  await writeFile(join(project, "creation-input", "art.png"), "PROJECT-DECOY", "utf8");
  const mediaPath = join(mediaDir, "art.png");
  await writeFile(mediaPath, "UPSTREAM-ART", "utf8");
  const hash = createHash("sha256").update("UPSTREAM-ART").digest("hex");

  const creation = chainedCreationService({ mediaPath, hash });
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    creation: creation as never,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(Math.min(ms, 5), undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        run: async () => ok("done"),
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: createStudioWorkspaceManager(join(root, "studio-data")),
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, project, db, service, creation, hash, mediaPath };
}

function chainedGraph(project: string) {
  const definition = {
    ...workflow(
      ["start", "creation", "creation", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: project,
  };
  definition.nodes[1]!.data.creationModelId = "image-model";
  definition.nodes[1]!.data.outputNames = ["illustration"];
  definition.nodes[2]!.data.creationModelId = "image-model";
  definition.nodes[2]!.data.creationReferencePath = "{{ref.illustration}}";
  definition.nodes[2]!.data.outputNames = ["edited"];
  return definition;
}

async function runChained(
  f: Awaited<ReturnType<typeof chainedFixture>>,
  definition: ReturnType<typeof chainedGraph>,
) {
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id,
    text: "先出图再改图",
  });
  const end = Date.now() + 30_000;
  while (
    !["succeeded", "failed"].includes(f.db.read<StoredRun>("run", accepted.id)?.state ?? "") &&
    Date.now() < end
  ) {
    f.service.tick();
    await sleep(2);
  }
  return accepted;
}

test("a creation node consumes an upstream image as its reference, not the same-named project file", async (t) => {
  const f = await chainedFixture(t);
  const accepted = await runChained(f, chainedGraph(f.project));
  assert.equal(f.db.read<StoredRun>("run", accepted.id)?.state, "succeeded", "创作链应当跑通");

  // 两次派单：第一次无参考图，第二次必须拿到**上游产物**的字节。
  assert.equal(f.creation.submitted.length, 2, "两个创作节点各派一次");
  assert.equal(f.creation.submitted[0]?.reference, undefined);
  const reference = f.creation.submitted[1]?.reference;
  assert.ok(reference, "第二个创作节点必须收到参考图");
  assert.equal(Buffer.from(reference!.dataBase64, "base64").toString("utf8"), "UPSTREAM-ART");
  assert.notEqual(
    Buffer.from(reference!.dataBase64, "base64").toString("utf8"),
    "PROJECT-DECOY",
    "不得读到项目里的同名文件",
  );
});

test("a stale upstream image fails before the second creation request is dispatched", async (t) => {
  const f = await chainedFixture(t);
  // 上游成果在交接前被改动：哈希与引用记录不一致。
  await writeFile(f.mediaPath, "TAMPERED-ART", "utf8");
  const accepted = await runChained(f, chainedGraph(f.project));
  assert.equal(f.db.read<StoredRun>("run", accepted.id)?.state, "failed", "失效引用必须让运行失败");

  const raw = f.db.read<StoredRun>("run", accepted.id)?.checkpoint?.values?.[
    workflowValueKey("n2")
  ];
  const produced = raw ? (JSON.parse(raw) as StudioStepResult) : undefined;
  assert.match(produced?.error ?? "", /创作成果/u);
  assert.equal(
    f.creation.submitted.length,
    1,
    "失效引用必须在派单之前失败，不得发起第二次创作请求",
  );
});
