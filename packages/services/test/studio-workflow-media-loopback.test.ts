import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { createCreationService } from "../src/creation/creationService.js";
import { workflow } from "./studio-orchestration-support.js";

/**
 * 媒体链路的**真夹具**（复核点名）：真实 CreationService 连接回环供应商，返回**真正有效的 PNG**。
 *
 * 与 `studio-workflow-file-handoff.test.ts` 的区别：那里用创作服务替身、内容是字符串
 * `PNG-BYTES-01`——足以验证字节复制与哈希，但证明不了真实图片解码与创作协议。
 * 这里走真实的 `createCreationService`（OpenAI 兼容的 `/v1/images/generations` 与
 * `/v1/images/edits`），分别验证两类消费者：
 *   1. 创作 → Agent：Agent 在自己的工作区里读到**真实 PNG 字节**；
 *   2. 创作 → 创作参考图：第二个创作请求的 edits 端点确实收到**上游产物的 PNG 字节**。
 * 全程只连 `127.0.0.1`，不需要真实模型或付费调用。
 */

/** 真正有效的 1×1 PNG（与 creation-service.test.ts 同一份夹具）。 */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
  "base64",
);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** 编辑后的产物：另一个有效 PNG（换一份字节以便区分）。 */
const editedPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const ok = (text: string): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});

async function loopback(t: TestContext) {
  const edits: Buffer[] = [];
  let generations = 0;
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.url === "/v1/images/generations") {
      generations += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
      return;
    }
    if (request.url === "/v1/images/edits") {
      edits.push(body);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ b64_json: editedPng.toString("base64") }] }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return { baseUrl: `http://127.0.0.1:${address.port}`, edits, generations: () => generations };
}

function credentials() {
  const secrets = new Map<string, string>();
  return {
    async load(key: string) {
      return secrets.get(key) ?? null;
    },
    async save(key: string, value: string) {
      secrets.set(key, value);
    },
    async delete(key: string) {
      secrets.delete(key);
    },
  };
}

async function fixture(t: TestContext, adapter: StudioKernelAdapter, baseUrl: string) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-media-loopback-"));
  const project = join(root, "project");
  await mkdir(join(project, "creation-input"), { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  // 反例：项目里放一张同名但内容不同的"图片"；正确实现必须用上游产物而不是它。
  await writeFile(join(project, "creation-input", "art.png"), "PROJECT-DECOY", "utf8");

  const creation = createCreationService({
    rootDir: join(root, "creation"),
    credentials: credentials(),
    pollIntervalMs: 5,
  });
  const model = await creation.saveModel({
    name: "Loopback image",
    kind: "image",
    protocol: "openai-images",
    baseUrl: `${baseUrl}/v1`,
    model: "fixture-image",
    enabled: true,
    apiKey: "local-fixture-key",
  });

  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const service = new StudioRuntimeService({
    db,
    creation,
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
    workspaces: createStudioWorkspaceManager(join(root, "studio-data")),
    onDidChange: Event.None,
    notify: () => {},
  });
  t.after(async () => {
    await service.disposeAllAndWait();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, project, db, service, modelId: model.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function runWorkflow(f: Fixture, definition: Record<string, unknown>) {
  await f.service.command({ commandId: randomUUID(), type: "save-workflow", workflow: definition });
  const accepted = await f.service.command({
    commandId: randomUUID(),
    type: "send",
    kind: "workflow",
    targetId: definition.id as string,
    text: "产出一张配图",
  });
  const end = Date.now() + 30_000;
  while (
    !["succeeded", "failed"].includes(f.db.read<StoredRun>("run", accepted.id)?.state ?? "") &&
    Date.now() < end
  ) {
    f.service.tick();
    await sleep(5);
  }
  return accepted;
}

test("creation → agent: the agent reads the real PNG produced through the loopback provider", async (t) => {
  const server = await loopback(t);
  const seen: Array<{ name: string; bytes: Buffer }> = [];
  const workspaceListings: string[] = [];
  const f = await fixture(
    t,
    {
      run: async (turn) => {
        workspaceListings.push(
          `${turn.workspacePath} :: ${JSON.stringify(await readdir(turn.workspacePath).catch(() => []))}`,
        );
        const dir = join(turn.workspacePath, "creation-input");
        const names = await readdir(dir).catch(() => []);
        for (const name of names) seen.push({ name, bytes: await readFile(join(dir, name)) });
        return ok("汇总完成");
      },
    },
    server.baseUrl,
  );
  const definition = {
    ...workflow(
      ["start", "creation", "agent", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: f.project,
  };
  definition.nodes[1]!.data.creationModelId = f.modelId;
  definition.nodes[1]!.data.outputNames = ["illustration"];
  definition.nodes[2]!.data.prompt = "汇总：{{ref.illustration}}";

  const accepted = await runWorkflow(f, definition);
  const run = f.db.read<StoredRun>("run", accepted.id);
  assert.equal(
    run?.state,
    "succeeded",
    `创作 → Agent 应当跑通；状态=${run?.state}；错误=${run?.error ?? ""}；步骤=${JSON.stringify(run?.checkpoint?.values ?? {})}`,
  );
  assert.equal(server.generations(), 1, "应当只向回环供应商派一次生成请求");
  // 隔离工作区是项目基线的副本，因此项目里的反例文件仍在；关键是有没有**上游产物**的副本。
  const real = seen.find((entry) => entry.bytes.subarray(0, 8).equals(PNG_MAGIC));
  assert.ok(
    real,
    `Agent 工作区里应有上游产物的真实 PNG 副本；实际：${JSON.stringify(seen.map((entry) => entry.name))}；工作区：${JSON.stringify(workspaceListings)}`,
  );
  assert.equal(real!.bytes.equals(png), true, "副本字节必须与回环供应商返回的 PNG 一致");
  // 项目里的同名"图片"仍在工作区里（它是基线的一部分），但它不是被引用的那一份。
  const decoy = seen.find((entry) => entry.bytes.toString("utf8") === "PROJECT-DECOY");
  assert.ok(decoy, "反例文件应当仍在工作区里，用来证明引用没有指向它");
  assert.notEqual(real!.name, decoy!.name, "引用指向的必须是上游产物，而不是项目里的同名文件");
});

test("creation → creation: the second request receives the upstream PNG as its reference", async (t) => {
  const server = await loopback(t);
  const f = await fixture(t, { run: async () => ok("unused") }, server.baseUrl);
  const definition = {
    ...workflow(
      ["start", "creation", "creation", "end"],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
    workspacePath: f.project,
  };
  definition.nodes[1]!.data.creationModelId = f.modelId;
  definition.nodes[1]!.data.outputNames = ["illustration"];
  definition.nodes[2]!.data.creationModelId = f.modelId;
  definition.nodes[2]!.data.creationReferencePath = "{{ref.illustration}}";
  definition.nodes[2]!.data.outputNames = ["edited"];

  const accepted = await runWorkflow(f, definition);
  assert.equal(f.db.read<StoredRun>("run", accepted.id)?.state, "succeeded", "创作 → 创作应当跑通");
  assert.equal(server.generations(), 1, "第一次是生成");
  assert.equal(server.edits.length, 1, "第二次必须以参考图走 edits 端点");
  // edits 是 multipart：断言请求体里确实带着**上游产物的 PNG 字节**，而不是项目里的同名文件。
  const body = server.edits[0]!;
  assert.ok(body.includes(PNG_MAGIC), "参考图请求体里应包含真实 PNG 字节");
  assert.equal(
    body.includes(Buffer.from("PROJECT-DECOY", "utf8")),
    false,
    "不得使用项目里的同名文件",
  );
});
