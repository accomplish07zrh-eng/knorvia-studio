import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { inflateSync } from "node:zlib";
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

/**
 * 两份**校验和正确**的 4×4 PNG。
 *
 * 复核指出：先前用的那份 1×1 样本 IDAT 块 CRC 不符（记录 `efbf9577`，实际应为 `efa2a75b`），
 * 严格校验器会报 `bad header checksum in b'IDAT'`。仅凭八字节文件头不能判定文件完整有效，
 * 因此这里换成正常编码器生成的两份小图，并在用例开头用 `assertValidPng` 做**逐块 CRC + 解压**校验。
 */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** 编辑后的产物：另一份有效 PNG（像素不同，字节也不同，便于区分）。 */
const editedPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  "base64",
);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 严格 PNG 校验：签名 → 逐块 CRC（覆盖块类型与块数据）→ IDAT 解压后的扫描线长度。
 * 只用八字节文件头判定"是 PNG"是不够的——这正是先前样本漏掉的问题。
 */
function assertValidPng(buffer: Buffer, label: string): void {
  assert.ok(buffer.subarray(0, 8).equals(PNG_MAGIC), `${label}：签名不对`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const recorded = buffer.readUInt32BE(offset + 8 + length);
    const computed = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    assert.equal(
      recorded,
      computed,
      `${label}：${type} 块 CRC 不符（记录 ${recorded.toString(16)}，实际 ${computed.toString(16)}）`,
    );
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") idat.push(Buffer.from(data));
    offset += 12 + length;
  }
  // 解压成功且扫描线长度符合预期，才算这份图片真的可解码。
  assert.equal(
    inflateSync(Buffer.concat(idat)).length,
    height * (1 + width * 3),
    `${label}：解压后的扫描线长度不符`,
  );
  assert.ok(width > 0 && height > 0, `${label}：尺寸非法`);
}

const ok = (text: string): StudioKernelTurnResult => ({
  status: "succeeded",
  resultKnown: true,
  text,
});

async function loopback(t: TestContext) {
  // 夹具自检：两份样本必须真的可解码（逐块 CRC + 解压），否则整个用例的"真 PNG"前提不成立。
  assertValidPng(png, "fixture:png");
  assertValidPng(editedPng, "fixture:editedPng");
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
  // 不只是八字节文件头：逐块 CRC 与解压都要过，才算"真正可解码的 PNG"。
  assertValidPng(real!.bytes, "agent-copy");
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
  assert.ok(body.includes(png.subarray(8)), "参考图请求体里应包含该 PNG 的块数据（不只是文件头）");
  assert.equal(
    body.includes(Buffer.from("PROJECT-DECOY", "utf8")),
    false,
    "不得使用项目里的同名文件",
  );
});

// 反例：先前使用的那份 1×1 样本 IDAT 块 CRC 不符（记录 efbf9577，实际应为 efa2a75b），
// 严格校验必须拒绝它——这条用例既记录了复核发现的具体缺陷，也证明上面的校验不是空断言。
test("the strict PNG verifier rejects the previously used broken sample", () => {
  const broken = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
    "base64",
  );
  assert.ok(broken.subarray(0, 8).equals(PNG_MAGIC), "旧样本的八字节文件头看起来仍是 PNG");
  assert.throws(
    () => assertValidPng(broken, "old-fixture"),
    /IDAT 块 CRC 不符/u,
    "只凭文件头会误判为有效；逐块 CRC 才能发现它坏了",
  );
});
