import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CreationJob } from "../src/creation/contract.js";
import { createCreationService } from "../src/creation/creationService.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
  "base64",
);
const pngHash = createHash("sha256").update(png).digest("hex");

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

async function terminal(
  service: ReturnType<typeof createCreationService>,
  id: string,
): Promise<CreationJob> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = await service.getJob(id);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Creation job did not finish");
}

const imageResponse = () =>
  new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
    headers: { "content-type": "application/json" },
  });

test("parameter snapshot, reference hash and provenance round-trip through disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-snapshot-"));
  const referenceBase64 = png.toString("base64");
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => imageResponse(),
  });
  try {
    const model = await service.saveModel({
      name: "Snapshot image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture-v1",
      enabled: true,
      apiKey: "fixture-only-key",
    });
    const created = await service.createJob({
      requestId: "snapshot-roundtrip",
      kind: "image",
      modelId: model.id,
      prompt: "  一棵树  ",
      reference: { name: "reference.png", mimeType: "image/png", dataBase64: referenceBase64 },
      provenance: {
        parentJobId: "origin-job",
        referencedOutputId: "origin-output",
        repeatOfRequestId: "origin-request",
      },
    });
    const snapshot = created.parameterSnapshot;
    assert(snapshot);
    assert.equal(snapshot.kind, "image");
    assert.equal(snapshot.modelId, model.id);
    assert.equal(snapshot.modelName, "Snapshot image");
    assert.equal(snapshot.protocol, "openai-images");
    assert.equal(snapshot.prompt, "一棵树");
    assert.deepEqual(snapshot.params, { prompt: "一棵树", model: "fixture-v1" });
    assert.equal(snapshot.referenceName, "reference.png");
    assert.equal(snapshot.referenceHash, pngHash);
    assert.equal(snapshot.capturedAt, created.createdAt);
    assert.deepEqual(created.provenance, {
      parentJobId: "origin-job",
      referencedOutputId: "origin-output",
      repeatOfRequestId: "origin-request",
    });
    assert.equal(created.reconstructible, true);
    assert.deepEqual(created.missing, []);
    assert.equal("referenceHash" in created, false);
    // 参考图字节既不进入任务记录，也不进入快照。
    const stored = await readFile(join(root, "jobs.json"), "utf8");
    assert.equal(stored.includes(referenceBase64), false);
    assert.equal(JSON.stringify(snapshot).includes(referenceBase64), false);
    const done = await terminal(service, created.id);
    assert.equal(done.status, "succeeded");
    assert.equal(done.outputs[0]?.hash, pngHash);
    // 落盘往返：新实例读到同样的快照、来源与可重建结论。
    const reopened = createCreationService({ rootDir: root, credentials: credentials() });
    const read = await reopened.getJob(created.id);
    assert.deepEqual(read?.parameterSnapshot, snapshot);
    assert.deepEqual(read?.provenance, created.provenance);
    assert.equal(read?.reconstructible, true);
    assert.deepEqual(read?.missing, []);
    assert.equal(read?.outputs[0]?.hash, pngHash);
    assert.equal((await reopened.listJobs())[0]?.reconstructible, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a legacy job without a snapshot stays honestly non-reconstructible", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-legacy-"));
  try {
    const legacy = {
      id: "legacy-job",
      requestId: "legacy-request",
      kind: "image",
      modelId: "legacy-model",
      prompt: "旧任务",
      status: "succeeded",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      outputs: [
        {
          id: "legacy-output",
          name: "creation-legacy-job.png",
          mimeType: "image/png",
          path: join(root, "assets", "creation-legacy-job.png"),
          size: png.byteLength,
        },
      ],
    };
    await writeFile(join(root, "jobs.json"), JSON.stringify({ version: 1, items: [legacy] }));
    const service = createCreationService({ rootDir: root, credentials: credentials() });
    const job = await service.getJob("legacy-job");
    assert(job);
    assert.equal(job.parameterSnapshot, undefined);
    assert.equal(job.provenance, undefined);
    assert.equal(job.checkedAt, undefined);
    assert.equal(job.reconstructible, false);
    assert.deepEqual(job.missing, ["parameterSnapshot"]);
    assert.equal(job.outputs[0]?.hash, undefined);
    assert.equal(job.outputs[0]?.name, "creation-legacy-job.png");
    assert.equal((await service.listJobs())[0]?.reconstructible, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a snapshot that disagrees with the record is reported with its exact missing fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-stale-"));
  try {
    const stale = {
      id: "stale-job",
      requestId: "stale-request",
      kind: "image",
      modelId: "stale-model",
      prompt: "改动过的提示词",
      status: "succeeded",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      outputs: [],
      parameterSnapshot: {
        kind: "image",
        modelId: "stale-model",
        modelName: "",
        protocol: "openai-images",
        prompt: "旧提示词",
        params: { prompt: "旧提示词", model: "" },
        capturedAt: "",
      },
    };
    await writeFile(join(root, "jobs.json"), JSON.stringify({ version: 1, items: [stale] }));
    const service = createCreationService({ rootDir: root, credentials: credentials() });
    const job = await service.getJob("stale-job");
    assert(job);
    assert.equal(job.reconstructible, false);
    assert.deepEqual(job.missing, [
      "parameterSnapshot.prompt",
      "parameterSnapshot.modelName",
      "parameterSnapshot.capturedAt",
      "parameterSnapshot.params.prompt",
      "parameterSnapshot.params.model",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reuse returns a fresh requestId without resubmitting or writing records", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-reuse-"));
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => {
      submissions++;
      return imageResponse();
    },
  });
  try {
    const model = await service.saveModel({
      name: "Reuse image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture-v1",
      enabled: true,
      apiKey: "fixture-only-key",
    });
    const job = await service.createJob({
      requestId: "reuse-source",
      kind: "image",
      modelId: model.id,
      prompt: "复用我",
      reference: {
        name: "reference.png",
        mimeType: "image/png",
        dataBase64: png.toString("base64"),
      },
    });
    assert.equal((await terminal(service, job.id)).status, "succeeded");
    assert.equal(submissions, 1);
    const before = await readFile(join(root, "jobs.json"), "utf8");
    const draft = await service.reuseJob(job.id);
    const other = await service.reuseJob(job.id);
    assert.match(draft.requestId, /^reuse-/);
    assert.notEqual(draft.requestId, job.requestId);
    // 每次复用都是新意图：编号不同，但仍指向同一个来源。
    assert.notEqual(other.requestId, draft.requestId);
    assert.equal(draft.kind, "image");
    assert.equal(draft.modelId, model.id);
    assert.equal(draft.prompt, "复用我");
    assert.deepEqual(draft.provenance, {
      parentJobId: job.id,
      repeatOfRequestId: "reuse-source",
    });
    assert.equal(draft.previousResultUnknown, false);
    assert.deepEqual(draft.missing, []);
    assert.equal(draft.parameterSnapshot?.referenceHash, pngHash);
    assert.equal(draft.reference?.name, "reference.png");
    assert.equal(draft.reference?.dataBase64, png.toString("base64"));
    // 复用只读：没有新的供应商请求，也没有改写任务记录。
    assert.equal(submissions, 1);
    assert.equal(await readFile(join(root, "jobs.json"), "utf8"), before);
    // 草稿可以显式再次提交，并带上来源关系形成生成链。
    const reused = await service.createJob(draft);
    assert.equal(reused.requestId, draft.requestId);
    assert.deepEqual(reused.provenance, {
      parentJobId: job.id,
      repeatOfRequestId: "reuse-source",
    });
    assert.equal((await terminal(service, reused.id)).status, "succeeded");
    assert.equal(submissions, 2);
    assert.equal((await service.createJob(draft)).id, reused.id);
    assert.equal(submissions, 2);
    await assert.rejects(service.reuseJob("missing-job"), /创作任务不存在/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reuse rejects a job whose recorded reference is no longer declared by the model", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-reuse-gate-"));
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => imageResponse(),
  });
  try {
    const model = await service.saveModel({
      name: "Editable image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture-v1",
      enabled: true,
      apiKey: "fixture-only-key",
    });
    const job = await service.createJob({
      requestId: "gate-source",
      kind: "image",
      modelId: model.id,
      prompt: "带参考图",
      reference: {
        name: "reference.png",
        mimeType: "image/png",
        dataBase64: png.toString("base64"),
      },
    });
    assert.equal((await terminal(service, job.id)).status, "succeeded");
    // 同一模型改换成不声明图生图输入的协议后，复用必须按同一个服务端谓词拒绝。
    await service.saveModel({
      id: model.id,
      name: "Editable image",
      kind: "image",
      protocol: "comfyui",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture-v1",
      enabled: true,
      workflowJson: '{"node":{"inputs":{"text":"{{prompt}}"}}}',
    });
    await assert.rejects(service.reuseJob(job.id), /未配置图生图输入/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same requestId is idempotent while changed content or provenance is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-idempotent-"));
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => {
      submissions++;
      return imageResponse();
    },
  });
  try {
    const model = await service.saveModel({
      name: "Idempotent image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture-v1",
      enabled: true,
      apiKey: "fixture-only-key",
    });
    const base = {
      requestId: "idempotent",
      kind: "image" as const,
      modelId: model.id,
      prompt: "同一内容",
    };
    const first = await service.createJob({ ...base, provenance: { parentJobId: "parent-1" } });
    assert.equal(
      (
        await service.createJob({
          ...base,
          provenance: { parentJobId: "parent-1" },
        })
      ).id,
      first.id,
    );
    assert.equal(submissions, 1);
    await assert.rejects(
      () => service.createJob({ ...base, prompt: "不同内容" }),
      /已用于其他内容/,
    );
    await assert.rejects(
      () =>
        service.createJob({
          ...base,
          provenance: { parentJobId: "parent-2" },
        }),
      /已用于其他内容/,
    );
    // 来源关系也是提交内容的一部分：缺少它会与已记录的那次提交不一致。
    await assert.rejects(
      () =>
        service.createJob({
          ...base,
          provenance: { parentJobId: "parent-1", repeatOfRequestId: "another-request" },
        }),
      /已用于其他内容/,
    );
    await assert.rejects(
      () =>
        service.createJob({
          ...base,
          provenance: { parentJobId: "not a valid id" },
        }),
      /来源信息/,
    );
    assert.equal(submissions, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a model credential never reaches the job record, snapshot or failure text", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-secret-"));
  const apiKey = "sk-live-creation-secret-0123456789abcdef";
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => {
      submissions++;
      throw new Error(`upstream rejected bearer ${apiKey}`);
    },
  });
  try {
    const model = await service.saveModel({
      name: "Secret image",
      kind: "image",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture-v1",
      enabled: true,
      apiKey,
      apiMapping: {
        requestPath: "/generate",
        requestTemplate: `{"prompt":"{{prompt}}","token":"${apiKey}"}`,
        outputPath: "asset",
      },
    });
    const job = await service.createJob({
      requestId: "secret-check",
      kind: "image",
      modelId: model.id,
      prompt: "No leak",
    });
    const done = await terminal(service, job.id);
    assert.equal(done.status, "failed");
    assert.equal(JSON.stringify(done).includes(apiKey), false);
    assert.equal(done.error?.includes(apiKey), false);
    assert.equal(done.error?.includes("[redacted]"), true);
    assert.equal(JSON.stringify(done.parameterSnapshot).includes(apiKey), false);
    // 允许清单之外的值不进入记录：地址、请求路径与映射模板都不落盘。
    const stored = await readFile(join(root, "jobs.json"), "utf8");
    assert.equal(stored.includes(apiKey), false);
    assert.equal(stored.includes("http://127.0.0.1:1"), false);
    assert.equal(stored.includes("/generate"), false);
    assert.equal(stored.includes("token"), false);
    assert.equal(submissions, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
